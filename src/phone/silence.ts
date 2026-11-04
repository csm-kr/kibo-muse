// 탭 모드에서 말이 끝났는지 본다. 100ms마다 소리 크기(RMS, 0~1)를 넣으면, 말소리를 들은 뒤 SILENCE_MS 동안 조용할 때 "end"를 한 번 낸다.
// 말소리를 NO_VOICE_MS 동안 한 번도 못 들었으면(말하지 않음, 0만 내는 마이크, 고른 잡음) "none"을 한 번 낸다. 휴대폰은 보내지 않고 듣기를 멈춘다(이어 듣기 끝)
export const SILENCE_MS = 1500;
export const NO_VOICE_MS = 8000;
const VOICE_MS = 300;
// 끼어들기(11/5 사용자: "KIBO가 말하고 있어도 내가 말하면 끊고 말할 수 있게"). KIBO 소리가 나는 동안(talking) 마이크에는 KIBO 목소리 메아리가 들어온다.
// 메아리 크기: 0.02를 넘는 소리 ECHO_WARM번의 최대값(재생 직전의 조용함은 재지 않는다. 0.4초가 지나도 그만큼 큰 소리가 없으면 반향 제거가 잘 된 것), 상한 ECHO_MAX.
// 그 뒤로는 메아리 최대값을 천천히 줄이며 따라간다. 그 3배(적어도 BARGE_RMS)를 BARGE_MS 동안 넘으면 사람이 끼어든 것으로 보고 한 번 "barge".
// 음절 사이 0.1초 틈은 봐준다(0.4초 가운데 0.3초).
// 그 전 소리는 말소리로 치지 않고 말없음 시간도 세지 않는다(KIBO 목소리를 사람 말로 보내지 않게). KIBO가 스스로 말을 마치면 한 번 "free".
// 사람이 이미 말하는 중(0.2초 넘게)에 KIBO 소리가 시작되면 바로 "overlap"(KIBO가 비켜 준다).
// lead: "barge"·"free" 때 녹음본을 지금부터 몇 ms 앞부터 남길지(끼어든 말 앞 0.4초. KIBO 말끝에 겹친 짧은 말 '네'도 남긴다)
export const BARGE_MS = 300;
const BARGE_RMS = 0.05;
const ECHO_WARM = 3;
const ECHO_WAIT_MS = 400;
// 메아리로 잰 값의 상한. 재는 사이 사람이 말을 시작해 목소리를 메아리로 쟀어도 기준(3배)이 0.12를 넘지 않게.
// 11/5 실측: 시험 목소리의 0.1초 크기는 중간값 0.123, 상위 10% 0.163, 0.3을 넘는 칸이 없었다(상한 0.1이면 기준 0.3이라 끼어들 수 없었다)
const ECHO_MAX = 0.04;
const PRE_MS = 400;

type EndEvent = "end" | "none" | "barge" | "overlap" | "free" | null;

export function speechEnd(stepMs = 100, talking: () => boolean = () => false) {
  let floor = 1;
  let voice = 0;
  let quiet = 0;
  let heard = false;
  let ever = false;
  let waited = 0;
  let barged = false;
  let was = false;
  let echo = 0;
  let warm = 0;
  let gateMs = 0;
  let run = 0;
  // 끼어들기 후보: 처음 큰 소리부터 지난 시간과, 지금 이어지는 틈
  let span = 0;
  let gap = 0;
  // KIBO가 말하는 동안 메아리보다 큰 소리가 마지막으로 이어진 길이와, 그 뒤 지난 시간
  let loud = 0;
  let since = 0;
  const step = Object.assign(
    (rms: number): EndEvent => {
      // 가장 조용했던 크기(잡음 바닥)의 3배, 적어도 0.02를 넘으면 말소리로 본다
      floor = Math.min(floor, Math.max(rms, 0.001));
      if (!barged && talking()) {
        // 사람이 이미 말하는 중에 KIBO 소리가 시작됐다(인사·대답이 늦게 시작): KIBO가 비켜 준다. 그 앞에는 메아리가 없어 녹음을 자르지 않는다
        if (!was && (voice >= 200 || heard)) {
          barged = true;
          return "overlap";
        }
        was = true;
        if (warm < ECHO_WARM) {
          gateMs += stepMs;
          echo = Math.min(ECHO_MAX, Math.max(echo, rms));
          if (rms > 0.02) warm++;
          else if (gateMs >= ECHO_WAIT_MS) warm = ECHO_WARM;
          return null;
        }
        if (rms > Math.max(BARGE_RMS, echo * 3)) {
          if (run === 0) span = 0;
          span += gap + stepMs;
          gap = 0;
          run += stepMs;
          loud = span;
          since = 0;
          if (run < BARGE_MS) return null;
          barged = heard = ever = true;
          voice = span;
          quiet = 0;
          step.lead = span + PRE_MS;
          return "barge";
        }
        // 말하던 중 한 칸 틈은 봐준다
        if (run > 0 && gap === 0) {
          gap = stepMs;
          since += stepMs;
          return null;
        }
        run = 0;
        gap = 0;
        since += stepMs;
        echo = Math.min(ECHO_MAX, Math.max(rms, echo * 0.98));
        return null;
      }
      if (was && !barged) {
        was = false;
        // KIBO 말끝에 겹친 짧은 말('네')은 끼어들기 기준(0.3초)에 못 미쳐도 버리지 않는다
        const short = loud >= 200 && since <= 300;
        if (short) {
          heard = ever = true;
          quiet = 0;
        }
        step.lead = short ? loud + since + PRE_MS : 0;
        loud = 0;
        return "free";
      }
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
    },
    { lead: 0 },
  );
  return step;
}

// 받아쓰기로 보내기 전에 앞뒤 빈 소리를 자른다. 받아쓰기 시간은 소리 길이를 따라 는다(실측 3.4초 → 1.6초, 8.5초 → 2.9초).
// 이어 듣기는 KIBO가 말을 마친 뒤 사람이 말을 시작할 때까지, 탭 모드는 말 끝 1.5초를 함께 녹음한다.
// 말 앞 0.4초(첫 음절)와 뒤 0.5초는 남긴다. 말소리가 없거나 0.5초도 줄지 않으면 그대로 둔다
// skipMs: 녹음 앞에서 먼저 버릴 길이(끼어들기 전 KIBO 목소리 메아리)
export function trimSilence(all: Float32Array, rate: number, skipMs = 0): Float32Array {
  const samples = skipMs > 0 ? all.subarray(Math.min(all.length, Math.round((skipMs / 1000) * rate))) : all;
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
// gate(이어 듣기): KIBO가 말하는 중인지(talking), 끼어들었을 때 할 일(barge), 녹음본에서 남길 시작점(keep: 지금부터 몇 ms 앞)
export interface BargeGate {
  talking(): boolean;
  barge(): void;
  keep(leadMs: number): void;
}
export function watchSilence(stream: MediaStream, end: () => void, none?: () => void, gate?: BargeGate): () => void {
  try {
    const ctx = audioCtx();
    if (!ctx) return () => {};
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    src.connect(an);
    void ctx.resume().catch(() => {});
    const buf = new Float32Array(an.fftSize);
    const isEnd = speechEnd(100, gate ? () => gate.talking() : undefined);
    const id = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const x of buf) sum += x * x;
      const r = isEnd(Math.sqrt(sum / buf.length));
      if (r === "end") end();
      else if (r === "none") none?.();
      // 끼어든 말 앞 0.4초부터 남기고 KIBO를 멈춘다. KIBO가 스스로 마쳤으면 그때부터(말끝에 겹친 짧은 말이 있으면 그 앞부터) 남긴다
      else if (r === "barge") {
        gate?.keep(isEnd.lead);
        gate?.barge();
      } else if (r === "overlap") gate?.barge();
      else if (r === "free") gate?.keep(isEnd.lead);
    }, 100);
    return () => {
      clearInterval(id);
      src.disconnect();
    };
  } catch {
    return () => {};
  }
}
