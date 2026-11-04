// 누르고 말하기의 녹음 흐름(React 밖). 브라우저 기능은 deps로 받아 시험에서 가짜를 넣는다.
// - 누를 때마다 마이크를 새로 받고, 녹음본을 얻으면 트랙을 멈춘다. iOS는 캡처가 켜져 있으면 재생 소리를 수화부로 보내거나 줄여
//   KIBO 대답이 안 들리고(WebKit 218012/260501/218815/278598), 주황 점도 켜진 채 남는다. 끝난 트랙을 다시 쓰는 일도 없어진다
// - '듣는 중'(recording)은 스트림을 받고 녹음기가 시작된 뒤에 켠다. 그 전에 말하면 첫 음절이 잘린다
// - 어떤 실패에서도 idle로 돌아온다(새로고침해야 말할 수 있는 상태를 만들지 않는다)

import { releaseAction, TAIL_MS } from "./ptt";

// 이만큼 넘게 마이크를 기다렸다면 권한 창이 떠 있던 것으로 본다(사람이 권한 창에 답하는 데 1초는 걸린다)
export const PROMPT_MS = 1000;
// 녹음기에 stop을 보낸 뒤 stop 이벤트를 이만큼만 기다린다
export const STOP_WAIT_MS = 1500;
// 이만큼 누르고 있으면 저절로 뗀다. 서버 한도(MAX.wavBytes 2,000,000 = 16kHz 약 62.5초)보다 짧게
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
// skipMs = 녹음 앞에서 버릴 길이(끼어들기 전 KIBO 목소리. 없으면 0)
export interface Take {
  blob: Blob;
  startDelayMs: number;
  durationMs: number;
  skipMs: number;
}

export interface MicEvents {
  onPhase(p: MicPhase): void;
  // 누른 순간(녹음 전). 소리 잠금 풀기, 안내 지우기 같은 일
  onPress?(): void;
  // 녹음이 실제로 시작됨
  onRecording?(): void;
  // 뗀 뒤 녹음본. 이것이 끝날 때까지 'sending'
  onTake(take: Take): Promise<void> | void;
  onTooShort?(): void;
  onBlocked?(): void;
  // 녹음기를 시작하지 못했거나 녹음본이 비었다: '다시 눌러 말해 주세요'
  onFailed?(): void;
  // 권한 창이 떠 있는 동안 손을 뗐다: '허용했으면 다시 눌러 말해 주세요'
  onAllowRetry?(): void;
  // MAX_HOLD_MS가 되어 저절로 뗐다
  onTooLong?(): void;
  // 두 번 탭(toggle)으로 녹음이 시작됐다: '듣고 있어요. 다시 두 번 탭하면 보내요'를 한 번 알린다
  onToggleOn?(): void;
  // 탭 모드에서 말소리를 끝내 못 들어 보내지 않고 멈췄다
  onNoSpeech?(): void;
}

// 화면 읽기의 두 번 탭·키보드로 생긴 click은 detail이 0이다. 이것만 '탭으로 시작, 다시 탭하면 보내기'로 쓴다.
// iOS Safari에서 손가락을 떼면 pointerup 뒤에 click(detail ≥1)이 오는데, 그것은 길게 누르기 흐름이 이미 처리했다
export const assistClick = (toggle: () => void) => (e: { detail: number }) => {
  if (e.detail === 0) toggle();
};

interface Press {
  at: number;
  // 탭 모드: 두 번 탭이나 짧은 탭으로 시작한 녹음. 손을 떼도 보내지 않고, 다시 누르면 보낸다
  toggle: boolean;
  // 마이크를 여는 중에 손을 뗐다
  released?: boolean;
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

  // 탭 모드가 되면 말 끝을 본다. 다시 누르지 않아도 조용해지면 보낸다
  function watchEnd(p: Press) {
    if (p.stream && !p.cancelWatch)
      p.cancelWatch = d.watch?.(
        p.stream,
        () => void (press === p && up(true)),
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

  async function down(toggle = false) {
    // 탭 모드로 듣는 중에 다시 누르면 보낸다(그 누름의 손 뗌은 up()이 무시한다)
    if (phase === "recording" && press?.toggle) return up(true);
    if (phase !== "idle") return;
    const p: Press = { at: d.now(), toggle, chunks: [] };
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
    // 마이크를 기다리는 사이에 손을 뗐다. 오래 기다렸으면(권한 창) '다시 눌러', 금방 열렸으면 짧은 탭이라 탭 모드로 이어 듣는다
    if (press !== p || (p.released && d.now() - p.at >= PROMPT_MS)) {
      if (press === p) press = null;
      drop(stream);
      set("idle");
      if (d.now() - p.at >= PROMPT_MS) ev.onAllowRetry?.();
      else ev.onTooShort?.();
      return;
    }
    if (p.released) p.toggle = true;
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
      void up(true);
    }, MAX_HOLD_MS);
    set("recording");
    ev.onRecording?.();
    if (p.toggle) {
      ev.onToggleOn?.();
      watchEnd(p);
    }
  }

  // force: 다시 누름·두 번 탭·시한·화면 숨김. 그 밖(손 뗌·버튼 밖으로 나감)은 탭 모드에서 보내지 않는다
  async function up(force = false) {
    const p = press;
    if (!p || (p.toggle && !force)) return;
    const rec = p.rec;
    // 아직 마이크를 여는 중이면 down()이 마무리한다
    if (!rec) {
      if (force) press = null;
      else p.released = true;
      return;
    }
    // 짧은 탭: '누른 채로' 오류 대신 탭 모드로 이어 듣는다
    if (!force && releaseAction(d.now() - p.at) === "too_short") {
      p.toggle = true;
      ev.onToggleOn?.();
      watchEnd(p);
      return;
    }
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
      const skipMs = p.keepFrom === undefined ? 0 : Math.max(0, Math.round(p.keepFrom - startedAt));
      await ev.onTake({ blob: new Blob(p.chunks, { type: rec.mimeType }), startDelayMs: Math.round(startedAt - p.at), durationMs: Math.round(end - startedAt), skipMs });
    } finally {
      set("idle");
    }
  }

  return {
    down: () => down(),
    up: () => up(),
    // 두 번 탭: 쉬고 있으면 시작, 녹음 중이면 보낸다. 마이크를 여는 중·보내는 중에는 무시한다
    toggle: () => void (phase === "idle" ? down(true) : phase === "recording" && up(true)),
    // 화면이 숨겨지면(잠금·앱 전환) 녹음 중인 것을 뗀 것으로 본다
    hidden: () => void (phase === "recording" && up(true)),
    // 이어 듣기: 쉬고 있을 때만 누름 없이 탭 모드로 듣기 시작
    listen: () => void (phase === "idle" && down(true)),
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
