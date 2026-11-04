// 탭 모드에서 말이 끝났는지 본다. 100ms마다 소리 크기(RMS, 0~1)를 넣으면, 말소리를 들은 뒤 SILENCE_MS 동안 조용할 때 "end"를 한 번 낸다.
// 말소리를 NO_VOICE_MS 동안 한 번도 못 들었으면(말하지 않음, 0만 내는 마이크, 고른 잡음) "none"을 한 번 낸다. 휴대폰은 보내지 않고 듣기를 멈춘다(이어 듣기 끝)
export const SILENCE_MS = 1500;
export const NO_VOICE_MS = 8000;
const VOICE_MS = 300;

export function speechEnd(stepMs = 100) {
  let floor = 1;
  let voice = 0;
  let quiet = 0;
  let heard = false;
  let ever = false;
  let waited = 0;
  return (rms: number): "end" | "none" | null => {
    // 가장 조용했던 크기(잡음 바닥)의 3배, 적어도 0.02를 넘으면 말소리로 본다
    floor = Math.min(floor, Math.max(rms, 0.001));
    if (rms > Math.max(0.02, floor * 3)) {
      voice += stepMs;
      quiet = 0;
      if (voice >= VOICE_MS) heard = ever = true;
      return null;
    }
    voice = 0;
    if (!ever) {
      waited += stepMs;
      return waited === NO_VOICE_MS ? "none" : null;
    }
    if (!heard) return null;
    quiet += stepMs;
    if (quiet < SILENCE_MS) return null;
    heard = false;
    quiet = 0;
    return "end";
  };
}

// 받아쓰기로 보내기 전에 앞뒤 빈 소리를 자른다. 받아쓰기 시간은 소리 길이를 따라 는다(실측 3.4초 → 1.6초, 8.5초 → 2.9초).
// 이어 듣기는 KIBO가 말을 마친 뒤 사람이 말을 시작할 때까지, 탭 모드는 말 끝 1.5초를 함께 녹음한다.
// 말 앞 0.4초(첫 음절)와 뒤 0.5초는 남긴다. 말소리가 없거나 0.5초도 줄지 않으면 그대로 둔다
export function trimSilence(samples: Float32Array, rate: number): Float32Array {
  const win = Math.max(1, Math.round(rate * 0.02));
  const n = Math.floor(samples.length / win);
  const rms: number[] = [];
  for (let w = 0; w < n; w++) {
    let sum = 0;
    for (let i = w * win; i < (w + 1) * win; i++) sum += samples[i] * samples[i];
    rms.push(Math.sqrt(sum / win));
  }
  // speechEnd와 같은 기준: 잡음 바닥의 3배, 적어도 0.02
  const floor = Math.max(0.001, Math.min(...rms, 1));
  const loud = (x: number) => x > Math.max(0.02, floor * 3);
  const f = rms.findIndex(loud);
  if (f < 0) return samples;
  const l = rms.findLastIndex(loud);
  const start = Math.max(0, f * win - Math.round(0.4 * rate));
  const end = Math.min(samples.length, (l + 1) * win + Math.round(0.5 * rate));
  if (samples.length - (end - start) < Math.round(0.5 * rate)) return samples;
  return samples.subarray(start, end);
}

// 소리 크기를 재는 오디오 처리기는 하나를 계속 쓴다. iOS는 사람이 누르는 동안 시작한 처리기만 소리를 받는다.
// 마이크를 누를 때 unlockAudio()로 깨워 두면, 누름 없이 다시 듣는 이어 듣기에서도 말 끝을 잴 수 있다
let shared: AudioContext | null = null;
function audioCtx() {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  return (shared ??= new AC());
}
// 이미 깨어 있는 처리기(사람이 마이크를 한 번 누른 뒤). Google 음성을 이것으로 재생한다. 없으면 기기 목소리
export function runningAudio(): AudioContext | null {
  return shared?.state === "running" ? shared : null;
}

export function unlockAudio() {
  try {
    const ctx = audioCtx();
    if (!ctx || ctx.state === "running") return;
    void ctx.resume().catch(() => {});
    // iOS는 누름(touchstart)을 사용자 동작으로 치지 않는다(speak.ts의 소리 잠금과 같다): 손을 뗄 때 한 번 더 깨운다
    const again = () => {
      void ctx.resume().catch(() => {});
      for (const g of ["touchend", "click"]) window.removeEventListener(g, again, true);
    };
    for (const g of ["touchend", "click"]) window.addEventListener(g, again, true);
  } catch {
    // 오디오를 쓸 수 없으면 말 끝을 재지 않는다(다시 누르면 보낸다)
  }
}

// 브라우저: 마이크 소리 크기를 100ms마다 재서 speechEnd에 넣는다. 오디오를 쓸 수 없으면 아무것도 하지 않는다(다시 누르면 보낸다)
export function watchSilence(stream: MediaStream, end: () => void, none?: () => void): () => void {
  try {
    const ctx = audioCtx();
    if (!ctx) return () => {};
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    src.connect(an);
    void ctx.resume().catch(() => {});
    const buf = new Float32Array(an.fftSize);
    const isEnd = speechEnd();
    const id = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const x of buf) sum += x * x;
      const r = isEnd(Math.sqrt(sum / buf.length));
      if (r === "end") end();
      else if (r === "none") none?.();
    }, 100);
    return () => {
      clearInterval(id);
      src.disconnect();
    };
  } catch {
    return () => {};
  }
}
