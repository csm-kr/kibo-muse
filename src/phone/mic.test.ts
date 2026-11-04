import { describe, expect, it } from "vitest";
import { assistClick, createMic, MAX_HOLD_MS, PROMPT_MS, STOP_WAIT_MS, type MicDeps, type MicPhase, type RecorderLike, type StreamLike } from "./mic";
import { TAIL_MS } from "./ptt";

// 가짜 시계·마이크·녹음기. later는 시계를 돌릴 때 부르고, wait는 그만큼 시계를 돌린다
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function rig(o: { openMs?: number; deny?: boolean; failStart?: boolean; deadTrack?: boolean; silentStop?: boolean } = {}) {
  let t = 0;
  let timers: { at: number; fn: () => void }[] = [];
  const tick = async (ms: number) => {
    const end = t + ms;
    for (;;) {
      const next = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      timers = timers.filter((x) => x !== next);
      t = next.at;
      next.fn();
      await flush();
    }
    t = end;
    await flush();
  };
  const streams: { tracks: { readyState: string; stop(): void }[] }[] = [];
  const recs: (RecorderLike & { stops: number })[] = [];
  const watches: { end: () => void; none: () => void; keep: (leadMs: number) => void; on: boolean }[] = [];
  const deps: MicDeps = {
    watch: (_s, end, none, keep) => {
      const w = { end, none, keep, on: true };
      watches.push(w);
      return () => void (w.on = false);
    },
    now: () => t,
    later: (fn, ms) => {
      const x = { at: t + ms, fn };
      timers.push(x);
      return () => void (timers = timers.filter((y) => y !== x));
    },
    wait: (ms) => new Promise((r) => deps.later(r, ms)),
    open: () =>
      new Promise((res, rej) =>
        deps.later(() => {
          if (o.deny) return rej(new Error("NotAllowedError"));
          const s = { tracks: [{ readyState: o.deadTrack ? "ended" : "live", stop() { this.readyState = "ended"; } }] };
          streams.push(s);
          res({ getTracks: () => s.tracks } as StreamLike);
        }, o.openMs ?? 50),
      ),
    record: () => {
      const r: RecorderLike & { stops: number } = {
        state: "inactive",
        mimeType: "audio/webm",
        stops: 0,
        ondataavailable: null,
        onstart: null,
        onstop: null,
        start() {
          if (o.failStart) throw new Error("NotSupportedError");
          r.state = "recording";
          r.onstart?.();
        },
        stop() {
          r.stops++;
          if (r.state === "inactive") return;
          r.state = "inactive";
          r.ondataavailable?.({ data: new Blob([new Uint8Array(10)]) });
          if (!o.silentStop) r.onstop?.();
        },
      };
      recs.push(r);
      return r;
    },
  };
  const log: string[] = [];
  const phases: MicPhase[] = [];
  const mic = createMic(deps, {
    onPhase: (p) => phases.push(p),
    onRecording: () => log.push("recording"),
    onTake: (x) => void log.push(`take:${x.blob.size}${x.skipMs ? `@${x.skipMs}` : ""}`),
    onTooShort: () => log.push("tooShort"),
    onBlocked: () => log.push("blocked"),
    onFailed: () => log.push("failed"),
    onAllowRetry: () => log.push("allowRetry"),
    onTooLong: () => log.push("tooLong"),
    onToggleOn: () => log.push("toggleOn"),
    onNoSpeech: () => log.push("noSpeech"),
  });
  const live = () => streams.flatMap((s) => s.tracks).filter((x) => x.readyState === "live").length;
  return { mic, tick, log, phases, streams, recs, watches, live, phase: () => phases.at(-1) ?? "idle" };
}

describe("누르고 말하기 녹음기(mic)", () => {
  it("누를 때마다 마이크를 새로 받고, 녹음본을 얻으면 트랙을 멈춘다(iOS 소리·주황 점). '듣는 중'은 스트림이 준비된 뒤에 켠다", async () => {
    const r = rig({ openMs: 300 });
    void r.mic.down();
    await r.tick(100);
    expect(r.phase()).toBe("opening");
    await r.tick(300);
    expect([r.phase(), r.live()]).toEqual(["recording", 1]);
    await r.tick(1500);
    const up = r.mic.up();
    await r.tick(TAIL_MS + 10);
    await up;
    expect(r.log).toEqual(["recording", "take:10"]);
    expect([r.phase(), r.live()]).toEqual(["idle", 0]);
    void r.mic.down();
    await r.tick(400);
    expect([r.streams.length, r.phase()]).toEqual([2, "recording"]);
  });

  it("트랙이 이미 끝났으면(화면 잠금 뒤) 다시 받고, 녹음기 생성·시작이 실패하면 스트림을 버리고 idle에서 '다시 눌러'를 알린다", async () => {
    const dead = rig({ deadTrack: true });
    void dead.mic.down();
    await dead.tick(100);
    expect([dead.phase(), dead.log, dead.live()]).toEqual(["idle", ["failed"], 0]);
    const bad = rig({ failStart: true });
    void bad.mic.down();
    await bad.tick(100);
    expect([bad.phase(), bad.log, bad.live()]).toEqual(["idle", ["failed"], 0]);
    void bad.mic.down();
    await bad.tick(100);
    expect(bad.streams.length).toBe(2);
  });

  it("녹음기가 이미 멈췄으면 stop 이벤트를 기다리지 않고, stop 이벤트가 안 와도 시한 뒤 보낸다(갇힘 없음)", async () => {
    const r = rig({ silentStop: true });
    void r.mic.down();
    await r.tick(100);
    await r.tick(1000);
    const up = r.mic.up();
    await r.tick(TAIL_MS + STOP_WAIT_MS + 10);
    await up;
    expect([r.log, r.phase(), r.live()]).toEqual([["recording", "take:10"], "idle", 0]);
    const k = rig();
    void k.mic.down();
    await k.tick(100);
    k.recs[0].stop();
    await k.tick(1000);
    const up2 = k.mic.up();
    await k.tick(TAIL_MS + 10);
    await up2;
    expect([k.log, k.phase()]).toEqual([["recording", "take:10"], "idle"]);
  });

  it("녹음 중 화면이 숨겨지면 뗀 것으로 보고 보낸다", async () => {
    const r = rig();
    void r.mic.down();
    await r.tick(100);
    await r.tick(900);
    r.mic.hidden();
    await r.tick(TAIL_MS + 10);
    expect([r.log, r.phase(), r.live()]).toEqual([["recording", "take:10"], "idle", 0]);
  });

  it("권한 창을 기다리는 사이에 손을 떼면 '허용했으면 다시 눌러'를 띄운다. 짧은 탭은 '누른 채로' 오류 대신 계속 듣고(탭 모드), 손을 떼거나 버튼 밖으로 나가도 보내지 않으며 다시 누르면 보낸다", async () => {
    const p = rig({ openMs: 3000 });
    void p.mic.down();
    await p.tick(600);
    await p.mic.up();
    expect(p.phase()).toBe("opening");
    // 권한 창이 떠 있는 동안 다시 눌러도 마이크를 또 열지 않는다
    void p.mic.down();
    await p.tick(2500);
    expect([p.log, p.phase(), p.live(), p.streams.length]).toEqual([["allowRetry"], "idle", 0, 1]);
    expect(PROMPT_MS).toBeLessThanOrEqual(1000);
    // 마이크가 열리기 전에 뗀 짧은 탭
    const q = rig({ openMs: 300 });
    void q.mic.down();
    await q.tick(200);
    await q.mic.up();
    await q.tick(200);
    await q.mic.up(); // 손가락이 버튼을 떠날 때 오는 pointerleave
    expect([q.log, q.phase(), q.live()]).toEqual([["recording", "toggleOn"], "recording", 1]);
    await q.tick(2000);
    void q.mic.down(); // 다시 누름 = 보냄
    await q.mic.up(); // 그 누름의 손 뗌은 무시
    await q.tick(TAIL_MS + 10);
    expect([q.log, q.phase(), q.live()]).toEqual([["recording", "toggleOn", "take:10"], "idle", 0]);
    // 마이크가 열린 뒤의 짧은 누름도 같다
    const s = rig();
    void s.mic.down();
    await s.tick(120);
    await s.mic.up();
    expect([s.log, s.phase()]).toEqual([["recording", "toggleOn"], "recording"]);
    const d = rig({ deny: true });
    void d.mic.down();
    await d.tick(100);
    expect([d.log, d.phase()]).toEqual([["blocked"], "idle"]);
  });

  it("화면 읽기의 두 번 탭·키보드 click(detail 0)은 탭으로 시작하고 다시 탭하면 보낸다. 시작은 한 번 알린다. 손가락을 뗄 때 오는 click(detail ≥1)은 무시한다", async () => {
    const r = rig();
    const click = assistClick(r.mic.toggle);
    // iOS Safari: 손가락을 떼면 pointerup 뒤에 click(detail 1)이 온다. 길게 누르기 흐름에 끼어들지 않는다
    click({ detail: 1 });
    await r.tick(100);
    expect([r.phase(), r.streams.length]).toEqual(["idle", 0]);
    click({ detail: 0 });
    await r.tick(100);
    expect([r.phase(), r.log]).toEqual(["recording", ["recording", "toggleOn"]]);
    await r.tick(2000);
    click({ detail: 0 });
    await r.tick(TAIL_MS + 10);
    expect([r.log, r.phase(), r.live()]).toEqual([["recording", "toggleOn", "take:10"], "idle", 0]);
  });

  it("탭 모드에서는 말이 끝나 조용해지면(watch) 다시 누르지 않아도 보낸다. 길게 누르기에는 쓰지 않는다", async () => {
    const r = rig();
    void r.mic.down();
    await r.tick(120);
    await r.mic.up(); // 짧은 탭 → 탭 모드
    expect(r.watches.map((w) => w.on)).toEqual([true]);
    r.watches[0].end();
    await r.tick(TAIL_MS + 10);
    expect([r.log, r.phase(), r.live(), r.watches[0].on]).toEqual([["recording", "toggleOn", "take:10"], "idle", 0, false]);
    // 화면 읽기 두 번 탭으로 시작한 탭 모드도 같다
    assistClick(r.mic.toggle)({ detail: 0 });
    await r.tick(100);
    expect(r.watches.map((w) => w.on)).toEqual([false, true]);
    // 길게 누르기: 잠깐 쉬어도 보내지 않는다(손을 뗄 때 보낸다)
    const h = rig();
    void h.mic.down();
    await h.tick(1500);
    expect(h.watches).toEqual([]);
  });

  it("끼어들기: watch가 keep(앞 몇 ms부터 남길지)을 알리면 녹음본에 그 앞을 버릴 길이(skipMs, 녹음 시작부터)를 붙인다", async () => {
    const r = rig();
    void r.mic.down();
    await r.tick(120); // 50ms에 녹음 시작
    await r.mic.up();
    await r.tick(1880);
    r.watches[0].keep(700);
    r.watches[0].end();
    await r.tick(TAIL_MS + 10);
    expect(r.log).toEqual(["recording", "toggleOn", "take:10@1250"]);
  });

  it("탭 모드에서 말소리를 못 들으면(watch none) 보내지 않고 마이크를 끄고 알린다. cancel()도 보내지 않고 쉬는 상태로 돌아간다(답 칩을 누름)", async () => {
    const r = rig();
    r.mic.toggle();
    await r.tick(100);
    r.watches[0].none();
    await r.tick(TAIL_MS + 10);
    expect([r.log, r.phase(), r.live(), r.watches[0].on]).toEqual([["recording", "toggleOn", "noSpeech"], "idle", 0, false]);
    r.mic.toggle();
    await r.tick(100);
    r.mic.cancel();
    await r.tick(TAIL_MS + 10);
    expect([r.log.slice(3), r.phase(), r.live(), r.watches[1].on]).toEqual([["recording", "toggleOn"], "idle", 0, false]);
  });

  it("55초가 되면 저절로 떼고 알린다(서버 한도 약 62초). 그 뒤 손을 떼도 두 번 보내지 않는다", async () => {
    expect(MAX_HOLD_MS).toBe(55_000);
    const r = rig();
    void r.mic.down();
    await r.tick(100);
    await r.tick(MAX_HOLD_MS + TAIL_MS + 10);
    await r.mic.up();
    await r.tick(TAIL_MS + 10);
    expect([r.log, r.phase(), r.live()]).toEqual([["recording", "tooLong", "take:10"], "idle", 0]);
  });
});
