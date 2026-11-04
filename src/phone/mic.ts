// 누르고 말하기의 녹음 흐름(React 밖). 브라우저 기능은 deps로 받아 시험에서 가짜를 넣는다.
// - 누를 때마다 마이크를 새로 받고, 녹음본을 얻으면 트랙을 멈춘다. iOS는 캡처가 켜져 있으면 재생 소리를 수화부로 보내거나 줄여
//   KIBO 대답이 안 들리고(WebKit 218012/260501/218815/278598), 주황 점도 켜진 채 남는다. 끝난 트랙을 다시 쓰는 일도 없어진다
// - '듣는 중'(recording)은 스트림을 받고 녹음기가 시작된 뒤에 켠다. 그 전에 말하면 첫 음절이 잘린다
// - 어떤 실패에서도 idle로 돌아온다(새로고침해야 말할 수 있는 상태를 만들지 않는다)

import { TAIL_MS } from "./ptt";

// 녹음기에 stop을 보낸 뒤 stop 이벤트를 이만큼만 기다린다
export const STOP_WAIT_MS = 1500;
// 이만큼 들으면 저절로 보낸다. 서버 한도(MAX.wavBytes 2,000,000 = 16kHz 약 62.5초)보다 짧게
export const MAX_HOLD_MS = 55_000;

export type MicPhase = "idle" | "opening" | "recording" | "sending";

export interface TrackLike {
  readyState: string;
  stop(): void;
}
export interface StreamLike {
  getTracks(): TrackLike[];
}
export interface RecorderLike {
  state: string;
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstart: (() => void) | null;
  onstop: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface MicDeps {
  open(): Promise<StreamLike>;
  record(stream: StreamLike): RecorderLike;
  now(): number;
  wait(ms: number): Promise<void>;
  // ms 뒤에 fn을 부른다. 돌려준 함수로 취소한다
  later(fn: () => void, ms: number): () => void;
  // 탭 모드에서만: 말이 끝나 조용해지면 end, 말소리를 끝내 못 들으면 none을 부른다. 돌려준 함수로 멈춘다.
  // keep(leadMs): 끼어들기에서 녹음본을 지금부터 leadMs 앞부터만 남긴다(그 앞은 KIBO 목소리 메아리)
  watch?(stream: StreamLike, end: () => void, none: () => void, keep: (leadMs: number) => void): () => void;
}

// 녹음 한 번. startDelayMs = 누른 순간부터 녹음이 실제로 시작될 때까지, durationMs = 녹음 길이(뗀 뒤 꼬리 포함),
// keepLastMs = 끼어들기에서 녹음본 끝에서부터 남길 길이(그 앞은 KIBO 목소리 메아리. 없으면 다 남긴다).
// 끝을 기준으로 잰다: 마이크가 열리고 소리를 내기 시작하기까지 걸리는 시간은 기기마다 달라 녹음 시작 시각은 녹음본과 어긋난다
export interface Take {
  blob: Blob;
  startDelayMs: number;
  durationMs: number;
  keepLastMs?: number;
}

export interface MicEvents {
  onPhase(p: MicPhase): void;
  // 누른 순간(녹음 전). 소리 잠금 풀기, 안내 지우기 같은 일
  onPress?(): void;
  // 녹음이 실제로 시작됨
  onRecording?(): void;
  // 뗀 뒤 녹음본. 이것이 끝날 때까지 'sending'
  onTake(take: Take): Promise<void> | void;
  onBlocked?(): void;
  // 녹음기를 시작하지 못했거나 녹음본이 비었다: '다시 눌러 말해 주세요'
  onFailed?(): void;
  // MAX_HOLD_MS가 되어 저절로 보냈다
  onTooLong?(): void;
  // 듣기가 시작됐다: '듣고 있어요. 말이 끝나면 저절로 보내요'를 한 번 알린다
  onToggleOn?(): void;
  // 탭 모드에서 말소리를 끝내 못 들어 보내지 않고 멈췄다
  onNoSpeech?(): void;
  // KIBO가 말하는 중인가 / 사람이 끼어들었다(KIBO를 멈춘다)
  talking?(): boolean;
  onBarge?(): void;
}

// 화면 읽기의 두 번 탭·키보드로 생긴 click은 detail이 0이다. 이것을 누름으로 쓴다.
// iOS Safari에서 손가락을 떼면 pointerup 뒤에 click(detail ≥1)이 오는데, 그 누름은 pointerdown이 이미 처리했다
export const assistClick = (press: () => void) => (e: { detail: number }) => {
  if (e.detail === 0) press();
};

interface Press {
  at: number;
  stream?: StreamLike;
  rec?: RecorderLike;
  startedAt?: number;
  chunks: Blob[];
  cancelMax?: () => void;
  cancelWatch?: () => void;
  // 녹음본을 이 시각부터 남긴다(끼어들기)
  keepFrom?: number;
}

const drop = (s?: StreamLike) => s?.getTracks().forEach((t) => t.stop());

export function createMic(d: MicDeps, ev: MicEvents) {
  let phase: MicPhase = "idle";
  let press: Press | null = null;
  const set = (p: MicPhase) => {
    phase = p;
    ev.onPhase(p);
  };

  // 이미 멈췄으면 바로, 아니면 stop 이벤트나 시한 중 먼저 오는 것
  function stopped(rec: RecorderLike) {
    if (rec.state === "inactive") return Promise.resolve();
    return new Promise<void>((r) => {
      const cancel = d.later(r, STOP_WAIT_MS);
      rec.onstop = () => {
        cancel();
        r();
      };
      try {
        rec.stop();
      } catch {
        cancel();
        r();
      }
    });
  }

  // 말 끝을 본다. 조용해지면 보낸다
  function watchEnd(p: Press) {
    if (p.stream && !p.cancelWatch)
      p.cancelWatch = d.watch?.(
        p.stream,
        () => void (press === p && send()),
        () => {
          if (press !== p) return;
          cancel();
          ev.onNoSpeech?.();
        },
        (lead) => void (press === p && (p.keepFrom = d.now() - lead)),
      );
  }

  // 보내지 않고 멈춘다(말소리 없음, 답 칩을 누름). 녹음기와 마이크를 끄고 쉬는 상태로
  function cancel() {
    const p = press;
    if (!p || phase !== "recording") return;
    press = null;
    p.cancelMax?.();
    p.cancelWatch?.();
    if (p.rec && p.rec.state !== "inactive") {
      p.rec.onstop = null;
      p.rec.stop();
    }
    drop(p.stream);
    set("idle");
  }

  // 한 번 누르면 말이 끝나 조용해질 때까지 듣는다. 손을 떼거나 다시 눌러도 보내지 않는다.
  async function down() {
    // 듣는 중에 KIBO가 말하고 있으면 누름은 끼어들기다. KIBO를 멈추고 지금부터 들은 것만 남긴다(지금까지는 KIBO 메아리)
    if (phase === "recording" && press) {
      if (!ev.talking?.()) return;
      press.keepFrom = d.now();
      ev.onBarge?.();
      return;
    }
    if (phase !== "idle") return;
    const p: Press = { at: d.now(), chunks: [] };
    press = p;
    set("opening");
    ev.onPress?.();
    let stream: StreamLike;
    try {
      stream = await d.open();
    } catch {
      if (press === p) press = null;
      set("idle");
      ev.onBlocked?.();
      return;
    }
    // 마이크를 기다리는 사이에 취소됐다(답 칩). 권한 창을 기다렸어도 허용했으면 다시 누르지 않아도 듣는다
    if (press !== p) {
      drop(stream);
      set("idle");
      return;
    }
    try {
      if (!stream.getTracks().some((t) => t.readyState === "live")) throw new Error("no live track");
      const rec = d.record(stream);
      rec.ondataavailable = (e) => p.chunks.push(e.data);
      rec.onstart = () => (p.startedAt = d.now());
      rec.start();
      p.rec = rec;
      p.stream = stream;
    } catch {
      drop(stream);
      press = null;
      set("idle");
      ev.onFailed?.();
      return;
    }
    p.cancelMax = d.later(() => {
      if (press !== p) return;
      ev.onTooLong?.();
      void send();
    }, MAX_HOLD_MS);
    set("recording");
    ev.onRecording?.();
    ev.onToggleOn?.();
    watchEnd(p);
  }

  // 말이 끝나 조용해짐·시한·화면 숨김
  async function send() {
    const p = press;
    const rec = p?.rec;
    if (!p || !rec) return;
    press = null;
    p.cancelMax?.();
    p.cancelWatch?.();
    set("sending");
    try {
      await d.wait(TAIL_MS);
      await stopped(rec);
    } finally {
      drop(p.stream);
    }
    if (!p.chunks.some((b) => b.size > 0)) {
      set("idle");
      ev.onFailed?.();
      return;
    }
    const end = d.now();
    const startedAt = p.startedAt ?? end;
    try {
      const keepLastMs = p.keepFrom === undefined ? undefined : Math.max(0, Math.round(end - p.keepFrom));
      await ev.onTake({ blob: new Blob(p.chunks, { type: rec.mimeType }), startDelayMs: Math.round(startedAt - p.at), durationMs: Math.round(end - startedAt), keepLastMs });
    } finally {
      set("idle");
    }
  }

  return {
    down: () => void down(),
    // 화면이 숨겨지면(잠금·앱 전환) 들은 데까지 보낸다
    hidden: () => void (phase === "recording" && send()),
    // 이어 듣기: 쉬고 있을 때만 누름 없이 듣기 시작
    listen: () => void (phase === "idle" && down()),
    cancel,
    // 화면을 떠날 때: 녹음기와 마이크를 끈다
    dispose: () => {
      const p = press;
      press = null;
      p?.cancelMax?.();
      p?.cancelWatch?.();
      if (p?.rec && p.rec.state !== "inactive") p.rec.stop();
      drop(p?.stream);
    },
  };
}
