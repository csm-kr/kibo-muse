import { describe, expect, it } from "vitest";
import { assistClick, createMic, MAX_HOLD_MS, STOP_WAIT_MS, type MicDeps, type MicPhase, type RecorderLike, type StreamLike } from "./mic";
import { TAIL_MS } from "./ptt";

// 가짜 시계·마이크·녹음기. later는 시계를 돌릴 때 부르고, wait는 그만큼 시계를 돌린다
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function rig(o: { openMs?: number; deny?: boolean; failStart?: boolean; deadTrack?: boolean; silentStop?: boolean; talking?: () => boolean } = {}) {
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
    onTake: (x) => void log.push(`take:${x.blob.size}${x.keepLastMs !== undefined ? `@${x.keepLastMs}` : ""}`),
    onBlocked: () => log.push("blocked"),
    onFailed: () => log.push("failed"),
    onTooLong: () => log.push("tooLong"),
    onToggleOn: () => log.push("toggleOn"),
    onNoSpeech: () => log.push("noSpeech"),
    talking: o.talking,
    onBarge: () => log.push("barge"),
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
    r.watches[0].end();
    await r.tick(TAIL_MS + 10);
    expect(r.log).toEqual(["recording", "toggleOn", "take:10"]);
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
    r.watches[0].end();
    await r.tick(TAIL_MS + STOP_WAIT_MS + 10);
    expect([r.log, r.phase(), r.live()]).toEqual([["recording", "toggleOn", "take:10"], "idle", 0]);
    const k = rig();
    void k.mic.down();
    await k.tick(100);
    k.recs[0].stop();
    await k.tick(1000);
    k.watches[0].end();
    await k.tick(TAIL_MS + 10);
    expect([k.log, k.phase()]).toEqual([["recording", "toggleOn", "take:10"], "idle"]);
  });

  it("녹음 중 화면이 숨겨지면 뗀 것으로 보고 보낸다", async () => {
    const r = rig();
    void r.mic.down();
    await r.tick(100);
    await r.tick(900);
    r.mic.hidden();
    await r.tick(TAIL_MS + 10);
    expect([r.log, r.phase(), r.live()]).toEqual([["recording", "toggleOn", "take:10"], "idle", 0]);
  });

  it("누르는 시간과 상관없이 한 번 누르면 계속 듣는다: 길게 눌러도, 듣는 중에 다시 눌러도 보내지 않고 말이 끝나 조용해지면(watch) 보낸다. 권한 창을 기다린 뒤에도 다시 누르지 않아도 듣는다", async () => {
    // 권한 창(마이크가 3초 뒤 열림). 그 사이 다시 눌러도 마이크를 또 열지 않는다
    const p = rig({ openMs: 3000 });
    void p.mic.down();
    await p.tick(600);
    void p.mic.down();
    await p.tick(2500);
    expect([p.log, p.phase(), p.live(), p.streams.length]).toEqual([["recording", "toggleOn"], "recording", 1, 1]);
    // 길게 누름(손을 떼는 것은 녹음기에 오지 않는다), 듣는 중 다시 누름: 계속 듣는다
    const s = rig();
    void s.mic.down();
    await s.tick(1500);
    void s.mic.down();
    await s.tick(1000);
    expect([s.log, s.phase(), s.watches.map((w) => w.on)]).toEqual([["recording", "toggleOn"], "recording", [true]]);
    s.watches[0].end();
    await s.tick(TAIL_MS + 10);
    expect([s.log, s.phase(), s.live(), s.watches[0].on]).toEqual([["recording", "toggleOn", "take:10"], "idle", 0, false]);
    const d = rig({ deny: true });
    void d.mic.down();
    await d.tick(100);
    expect([d.log, d.phase()]).toEqual([["blocked"], "idle"]);
  });

  it("화면 읽기의 두 번 탭·키보드 click(detail 0)은 누름과 같다(듣기 시작). 손가락을 뗄 때 오는 click(detail ≥1)은 무시한다", async () => {
    const r = rig();
    const click = assistClick(r.mic.down);
    click({ detail: 1 });
    await r.tick(100);
    expect([r.phase(), r.streams.length]).toEqual(["idle", 0]);
    click({ detail: 0 });
    await r.tick(100);
    expect([r.phase(), r.log]).toEqual(["recording", ["recording", "toggleOn"]]);
  });

  it("끼어들기: watch가 keep(지금부터 몇 ms 앞부터 남길지)을 알리면 녹음본에 끝에서부터 남길 길이(keepLastMs)를 붙인다. 마이크가 늦게 소리를 내기 시작해도 끝은 시계와 맞는다", async () => {
    const r = rig();
    void r.mic.down();
    await r.tick(120); // 50ms에 녹음 시작
    await r.tick(1880);
    r.watches[0].keep(700);
    r.watches[0].end();
    await r.tick(TAIL_MS + 10);
    // 2000ms에 keep(700) → 1300ms부터. 보내기는 2000ms + 꼬리 TAIL_MS에 끝난다
    expect(r.log).toEqual(["recording", "toggleOn", `take:10@${2000 + TAIL_MS - 1300}`]);
  });

  it("KIBO가 말하는 중에 탭 모드 듣기를 다시 누르면 보내지 않는다: KIBO를 멈추고(끼어들기) 그때부터 들은 것만 남긴다", async () => {
    let talking = false;
    const r = rig({ talking: () => talking });
    void r.mic.down();
    await r.tick(120);
    await r.tick(880);
    talking = true;
    void r.mic.down(); // 1000ms
    await r.tick(10);
    expect([r.log, r.phase()]).toEqual([["recording", "toggleOn", "barge"], "recording"]);
    talking = false;
    await r.tick(990);
    r.watches[0].end(); // 2000ms
    await r.tick(TAIL_MS + 10);
    expect(r.log.at(-1)).toBe(`take:10@${2000 + TAIL_MS - 1000}`);
  });

  it("탭 모드에서 말소리를 못 들으면(watch none) 보내지 않고 마이크를 끄고 알린다. cancel()도 보내지 않고 쉬는 상태로 돌아간다(답 칩을 누름)", async () => {
    const r = rig();
    void r.mic.down();
    await r.tick(100);
    r.watches[0].none();
    await r.tick(TAIL_MS + 10);
    expect([r.log, r.phase(), r.live(), r.watches[0].on]).toEqual([["recording", "toggleOn", "noSpeech"], "idle", 0, false]);
    void r.mic.down();
    await r.tick(100);
    r.mic.cancel();
    await r.tick(TAIL_MS + 10);
    expect([r.log.slice(3), r.phase(), r.live(), r.watches[1].on]).toEqual([["recording", "toggleOn"], "idle", 0, false]);
  });

  it("55초가 되면 저절로 보내고 알린다(서버 한도 약 62초)", async () => {
    expect(MAX_HOLD_MS).toBe(55_000);
    const r = rig();
    void r.mic.down();
    await r.tick(100);
    await r.tick(MAX_HOLD_MS + TAIL_MS + 10);
    expect([r.log, r.phase(), r.live()]).toEqual([["recording", "toggleOn", "tooLong", "take:10"], "idle", 0]);
  });
});
