// 휴대폰에서 글을 사용자의 언어로 읽어 준다. Meta API에는 음성 합성이 없어 Gemini 음성(/api/speak)을 쓰고, 안 되면 브라우저 speechSynthesis로 읽는다
import { langOf, type Lang } from "@/engine/turn";
import { runningAudio, unlockAudio } from "./silence";

const TAGS: Record<Lang, string> = { en: "en-US", ko: "ko-KR", ja: "ja-JP", vi: "vi-VN", zh: "zh-CN", es: "es-ES" };

// 'ko', 'ko-KR', 'Korean' 같은 이름을 BCP-47 태그로(utterance.lang에 언어 이름을 넣으면 브라우저가 못 알아듣는다)
export const speechLang = (language: string) => TAGS[langOf(language)];

type VoiceLike = Pick<SpeechSynthesisVoice, "lang" | "name" | "localService">;
const norm = (tag: string) => tag.replace("_", "-").toLowerCase();

// 덜 딱딱한 목소리 점수(11/4 사용자 "너무 딱딱해"): iOS 고음질(Premium·Enhanced), Edge 신경망(Online (Natural)), 크롬 Google 목소리 순. 같으면 기기 안 목소리
const quality = (v: VoiceLike) => (/premium/i.test(v.name) ? 4 : /enhanced|natural|neural/i.test(v.name) ? 3 : /google/i.test(v.name) ? 2 : v.localService ? 1 : 0);

// 지역까지 같은 목소리 중 점수가 가장 높은 것 → 언어만 같은 목소리. 없으면 고르지 않는다(브라우저가 lang으로 고른다)
export function pickVoice<V extends VoiceLike>(voices: readonly V[], tag: string): V | undefined {
  const want = norm(tag);
  const exact = voices.filter((v) => norm(v.lang) === want);
  const best = exact.reduce<V | undefined>((b, v) => (!b || quality(v) > quality(b) ? v : b), undefined);
  return best ?? voices.find((v) => norm(v.lang).split("-")[0] === want.split("-")[0]);
}

// 기본 빠르기(1)는 늘어진다(11/4 사용자 "음성 말하는 걸 빠르게"). 조금 빠르게 읽는다
export const SPEECH_RATE = 1.15;

// 🔊 켜기·끄기. 기본은 켬, 이 기기에 저장한다
const KEY = "kibo.phone.sound";
let on: boolean | null = null;
const listeners = new Set<() => void>();
export function soundOn() {
  if (on === null) {
    try {
      on = localStorage.getItem(KEY) !== "off";
    } catch {
      on = true;
    }
  }
  return on;
}
export function setSound(value: boolean) {
  on = value;
  try {
    localStorage.setItem(KEY, value ? "on" : "off");
  } catch {
    // 저장할 수 없는 브라우저(사생활 모드 등)면 이번 화면에서만 쓴다
  }
  if (!value) {
    window.speechSynthesis?.cancel();
    stopCloud();
  }
  listeners.forEach((f) => f());
}
export function subscribeSound(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

// 휴대폰 브라우저(특히 iOS)는 사람이 누른 순간에 한 번 읽어야 그 뒤의 읽기를 허락한다. 마이크·언어 칩을 누를 때 소리 없이 한 번 읽는다.
// iOS는 터치의 누름(pointerdown)을 사용자 동작으로 치지 않아 그때 읽기를 조용히 버린다(11/3 iPhone: 글만 나오고 소리 없음).
// 그래서 읽기가 실제로 시작될 때까지 풀린 것으로 치지 않고, 그때까지 사람 동작(손 뗌 포함)마다 다시 읽는다
const GESTURES = ["pointerup", "touchend", "click", "keydown"];
let unlocked = false;
let armed = false;
function markUnlocked() {
  if (unlocked) return;
  unlocked = true;
  for (const g of GESTURES) window.removeEventListener(g, unlockSpeech, true);
}
export function unlockSpeech() {
  // Google 음성을 재생할 오디오 처리기도 같은 누름에서 깨운다
  unlockAudio();
  if (unlocked || !window.speechSynthesis) return;
  if (!armed) {
    armed = true;
    for (const g of GESTURES) window.addEventListener(g, unlockSpeech, true);
  }
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  u.onstart = u.onend = markUnlocked;
  window.speechSynthesis.speak(u);
}

// 화면의 수량 표기 ×N을 읽을 말로('곱하기'로 읽히지 않게). 한·중·일은 세는 말, 나머지는 ×1은 빼고 ×N은 ", N"
const COUNT: Partial<Record<Lang, (n: string) => string>> = { ko: (n) => `${n}개`, ja: (n) => `${n}つ`, zh: (n) => `${n}份` };
export function spokenText(text: string, language: string) {
  const c = COUNT[langOf(language)];
  return text.replace(/ ?×(\d+)/g, (_, n: string) => (c ? ` ${c(n)}` : n === "1" ? "" : `, ${n}`));
}

// 목소리 목록은 처음에 비어 있다가 voiceschanged 뒤에 찬다. 1초까지 기다린다
function voices(): Promise<SpeechSynthesisVoice[]> {
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(window.speechSynthesis.getVoices());
    };
    const timer = setTimeout(done, 1000);
    window.speechSynthesis.addEventListener("voiceschanged", done);
  });
}

// Gemini 음성(서버 /api/speak, 11/4 사용자 "너무 딱딱해"). 서버가 16비트 PCM 조각을 흘려보내면 오는 대로 이어 튼다(첫 소리 약 0.8초).
// 키가 없으면(404) 이 화면에서는 다시 묻지 않는다. 오디오 처리기가 아직 잠겼거나(마이크를 한 번도 안 누름),
// 실패하거나, 첫 조각이 2.5초 안에 오지 않으면 기기 목소리로 읽는다
let cloud = true;
let playing: { stop(): void } | null = null;
function stopCloud() {
  try {
    playing?.stop();
  } catch {
    // 이미 끝났다
  }
  playing = null;
}
// 조각 사이 네트워크 흔들림을 받아 줄 여유(초)
const LEAD = 0.1;
async function cloudSpeak(text: string, language: string, stale: () => boolean) {
  const ctx = runningAudio();
  if (!cloud || !ctx) return false;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 2500);
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  let first: ReadableStreamReadResult<Uint8Array>;
  let rate: number;
  try {
    const res = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang: language }), signal: abort.signal });
    if (res.status === 404) cloud = false;
    if (!res.ok || !res.body) return false;
    rate = Number(/rate=(\d+)/.exec(res.headers.get("content-type") ?? "")?.[1] ?? 24000);
    reader = res.body.getReader();
    first = await reader.read();
    if (first.done) return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
  // 기다리는 사이 새 읽기가 왔으면 이것은 버린다(기기 목소리로도 읽지 않는다)
  if (stale()) {
    abort.abort();
    return true;
  }
  window.speechSynthesis?.cancel();
  const live = new Set<AudioBufferSourceNode>();
  let ended = false;
  const me = {
    stop() {
      abort.abort();
      live.forEach((s) => s.stop());
      live.clear();
    },
  };
  playing = me;
  const finish = () => {
    if (ended && live.size === 0 && playing === me) playing = null;
  };
  let at = ctx.currentTime + LEAD;
  let rest = new Uint8Array(0);
  const play = (chunk: Uint8Array) => {
    // 조각 경계가 표본(2바이트) 중간에 걸리면 남은 바이트를 다음 조각 앞에 붙인다
    const bytes = rest.length ? Uint8Array.from([...rest, ...chunk]) : chunk;
    const n = bytes.length >> 1;
    rest = bytes.slice(n * 2);
    if (!n) return;
    const buf = ctx.createBuffer(1, n, rate);
    const data = buf.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
    for (let i = 0; i < n; i++) data[i] = view.getInt16(i * 2, true) / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => {
      live.delete(src);
      finish();
    };
    at = Math.max(at, ctx.currentTime);
    src.start(at);
    at += n / rate;
    live.add(src);
  };
  play(first.value);
  void (async () => {
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done || playing !== me) break;
        play(r.value);
      }
    } catch {
      // 도중에 끊기면 거기까지만 읽는다
    } finally {
      ended = true;
      finish();
    }
  })();
  return true;
}

// 앞의 읽기는 끊는다. 목소리를 기다리는 사이 새 읽기가 오면 옛것은 버린다
let seq = 0;
// 목소리를 기다리는 중인 읽기 수(이때는 speechSynthesis.speaking이 아직 false다)
let queued = 0;
// 읽는 중인가. 이어 듣기는 KIBO가 다 읽은 뒤에 마이크를 연다(자기 목소리를 듣지 않게)
export const speechBusy = () => queued > 0 || playing !== null || !!window.speechSynthesis?.speaking || !!window.speechSynthesis?.pending;
export async function speak(text: string, language: string) {
  if (!text || !soundOn()) return;
  const n = ++seq;
  stopCloud();
  const said = spokenText(text, language);
  queued++;
  try {
    if (await cloudSpeak(said, language, () => n !== seq || !soundOn())) return;
    if (n !== seq || !soundOn() || !window.speechSynthesis) return;
    const tag = speechLang(language);
    const voice = pickVoice(await voices(), tag);
    if (n !== seq || !soundOn()) return;
    const s = window.speechSynthesis;
    // iOS는 cancel 바로 뒤의 speak를 놓칠 때가 있어, 읽는 중일 때만 끊는다
    if (s.speaking || s.pending) s.cancel();
    const u = new SpeechSynthesisUtterance(said);
    u.lang = tag;
    u.rate = SPEECH_RATE;
    if (voice) u.voice = voice;
    s.speak(u);
  } finally {
    queued--;
  }
}
