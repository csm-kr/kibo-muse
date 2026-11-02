// Supabase Realtime 연결 점검: 키를 넣은 뒤 한 번 돌려 실제 휴대폰-키오스크 통로가 되는지 본다.
// 실행: node --env-file=.env.local --import tsx scripts/realtime-smoke.mts > <로그 파일> 2>&1
// 키 없이 스크립트 자체 점검: node --import tsx scripts/realtime-smoke.mts --fake (메모리 안 가짜 서버)
// src의 supabaseLink를 그대로 쓴다. 첫 줄은 모드(real/fake), 그다음은 항목별 PASS/FAIL과 밀리초뿐이다.
// 주소·키·환경 변수 값은 내지 않는다: 준비 검사는 고정 문구, 예외는 error.code 또는 error.name만 낸다.
import { RealtimeClient } from "@supabase/realtime-js";
import { supabaseLink, type Link, type LinkMsg, type RealtimeChannelLike, type RealtimeLike } from "@/sync/link";
import { newRoomCode } from "@/sync/room";
import { smokeConfigError } from "./smoke-config";

const FAKE = process.argv.includes("--fake");
const JOIN_TIMEOUT_MS = 10_000;
const MSG_TIMEOUT_MS = 5_000;
// supabaseLink의 STALE_MS(15초)보다 조금 늦게 접속시킨다
const LATE_JOIN_MS = 16_000;

console.log(`모드 ${FAKE ? "fake" : "real"}`);

// 메모리 안 가짜 Realtime: 같은 채널 이름의 다른 클라이언트에만 전한다(self:false)
const hub = new Map<string, Set<(m: unknown, from: object) => void>>();
function fakeClient(): RealtimeLike {
  const me = {};
  return {
    channel(name) {
      let cb: (p: { payload: unknown }) => void = () => {};
      const deliver = (m: unknown, from: object) => from !== me && setTimeout(() => cb({ payload: m }), 1);
      const ch: RealtimeChannelLike & { off?: () => void } = {
        on: (_t, _f, f) => ((cb = f), ch),
        subscribe: (s) => {
          if (!hub.has(name)) hub.set(name, new Set());
          hub.get(name)!.add(deliver);
          ch.off = () => hub.get(name)!.delete(deliver);
          setTimeout(() => s?.("SUBSCRIBED"), 5);
          return ch;
        },
        send: async (m) => hub.get(name)?.forEach((d) => d(m.payload, me)),
      };
      return ch;
    },
    removeChannel: (ch) => (ch as { off?: () => void }).off?.(),
  };
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// 클라이언트를 만들기 전에 주소 형식과 키 종류(공개용인지)만 본다
const notReady = FAKE ? null : smokeConfigError(url, key);
if (notReady) {
  console.log(notReady);
  process.exit(1);
}

function client(): RealtimeLike {
  if (FAKE) return fakeClient();
  return new RealtimeClient(`${url}/realtime/v1`, { params: { apikey: key } }) as unknown as RealtimeLike;
}

// 접속(subscribe)을 ms만큼 늦추는 감싸개. 접속 전에 보낸 것은 supabaseLink가 모아 두었다가 접속 때 보낸다
function lateJoin(c: RealtimeLike, ms: number): RealtimeLike {
  let real: RealtimeChannelLike | null = null;
  return {
    channel(name, opts) {
      real = c.channel(name, opts);
      const ch: RealtimeChannelLike = {
        on: (t, f, cb) => (real!.on(t, f, cb), ch),
        subscribe: (s) => (setTimeout(() => real!.subscribe(s), ms), ch),
        send: (m) => real!.send(m),
      };
      return ch;
    },
    removeChannel: () => real && c.removeChannel(real),
    disconnect: () => c.disconnect?.(),
  };
}

let failed = false;
const report = (ok: boolean, line: string) => {
  failed ||= !ok;
  console.log(`${ok ? "PASS" : "FAIL"} ${line}`);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const joined = (l: Link) => new Promise<boolean>((res) => {
  const t = setTimeout(() => res(false), JOIN_TIMEOUT_MS);
  l.onJoin(() => (clearTimeout(t), res(true)));
});

try {
  const room = newRoomCode();
  const otherRoom = newRoomCode();
  const kiosk = supabaseLink(room, client());
  const phone = supabaseLink(room, client());
  const other = supabaseLink(otherRoom, client());
  // ④의 양성 대조: other와 같은 room에서 하나만 보낸다
  const otherSender = supabaseLink(otherRoom, client());
  const got = { kiosk: [] as LinkMsg[], phone: [] as LinkMsg[], other: [] as LinkMsg[] };
  kiosk.subscribe((m) => {
    got.kiosk.push(m);
    // 키오스크 역할: 말을 받으면 바로 대답한다(왕복 시간)
    if (m.type === "utterance" && m.id?.startsWith("rt")) kiosk.send({ type: "reply", re: m.id, say: "ok", replyLanguage: "en", result: "plan" });
  });
  phone.subscribe((m) => got.phone.push(m));
  other.subscribe((m) => got.other.push(m));

  const t0 = Date.now();
  const ok = await Promise.all([joined(kiosk), joined(phone), joined(other), joined(otherSender)]);
  report(ok.every(Boolean), `접속 ${Date.now() - t0}ms`);
  if (!ok.every(Boolean)) {
    [kiosk, phone, other, otherSender].forEach((l) => l.close());
    process.exit(1);
  }

  // ① 양방향: 휴대폰 → 키오스크(말), 키오스크 → 휴대폰(대답). 5회 왕복 시간
  const rtts: number[] = [];
  for (let i = 0; i < 5; i++) {
    const id = `rt${i}`;
    const start = Date.now();
    phone.send({ type: "utterance", id, text: "smoke", lang: "en" });
    while (Date.now() - start < MSG_TIMEOUT_MS && !got.phone.some((m) => m.type === "reply" && m.re === id)) await wait(5);
    if (got.phone.some((m) => m.type === "reply" && m.re === id)) rtts.push(Date.now() - start);
    await wait(200);
  }
  rtts.sort((a, b) => a - b);
  report(rtts.length === 5, `① 양방향 왕복 ${rtts.length}/5, p50 ${rtts[Math.floor(rtts.length / 2)] ?? "-"}ms, 최대 ${rtts[rtts.length - 1] ?? "-"}ms`);

  // ② self:false: 보낸 쪽은 자기 메시지를 받지 않는다
  const selfEcho = got.phone.filter((m) => m.type === "utterance").length + got.kiosk.filter((m) => m.type === "reply").length;
  report(selfEcho === 0, `② self:false 자기 메시지 받음 ${selfEcho}건`);

  // ③ 늦게 접속한 휴대폰(F5 뒤 다시 접속): 15초 넘게 묵은 말은 버리고, 최근 말과 hello는 보낸다
  const late = supabaseLink(room, lateJoin(client(), LATE_JOIN_MS));
  const lateStart = Date.now();
  late.send({ type: "utterance", id: "stale", text: "old", lang: "en" });
  late.send({ type: "hello" });
  await wait(8_000);
  late.send({ type: "utterance", id: "fresh", text: "new", lang: "en" });
  while (Date.now() - lateStart < LATE_JOIN_MS + MSG_TIMEOUT_MS && !got.kiosk.some((m) => m.type === "utterance" && m.id === "fresh")) await wait(20);
  await wait(1_000);
  const has = (id: string) => got.kiosk.some((m) => m.type === "utterance" && m.id === id);
  const hello = got.kiosk.some((m) => m.type === "hello");
  report(!has("stale") && has("fresh") && hello, `③ 묵은 말 버림 ${has("stale") ? "아니오" : "예"}, 최근 말 전달 ${has("fresh") ? "예" : "아니오"}, hello 전달 ${hello ? "예" : "아니오"} (${Date.now() - lateStart}ms)`);

  // ④ 다른 room에는 아무것도 가지 않는다. 양성 대조: 같은 otherRoom에서 보낸 하나는 정확히 그 하나만 받는다
  const leaked = got.other.length;
  const ctlStart = Date.now();
  otherSender.send({ type: "utterance", id: "ctl", text: "control", lang: "en" });
  while (Date.now() - ctlStart < MSG_TIMEOUT_MS && got.other.length === leaked) await wait(5);
  await wait(500);
  const ctl = got.other.slice(leaked);
  const ctlOk = ctl.length === 1 && ctl[0].type === "utterance" && ctl[0].id === "ctl";
  report(leaked === 0 && ctlOk, `④ 다른 room 받은 메시지 ${leaked}건, 같은 room 대조 받음 ${ctl.length}건(기대 1)`);

  [kiosk, phone, other, otherSender, late].forEach((l) => l.close());
  await wait(300);
  console.log(failed ? "결과 FAIL" : "결과 PASS");
  process.exit(failed ? 1 : 0);
} catch (e) {
  // 오류 객체를 통째로 찍으면 주소가 섞일 수 있다. 종류만 낸다
  const err = e as { code?: string; name?: string };
  console.log(`FAIL 오류 ${err?.code ?? err?.name ?? "unknown"}`);
  process.exit(1);
}
