// 휴대폰에서 글을 사용자의 언어로 읽어 준다. Meta API에는 음성 합성이 없어 브라우저 speechSynthesis를 쓴다
import { langOf, type Lang } from "@/engine/turn";

const TAGS: Record<Lang, string> = { en: "en-US", ko: "ko-KR", ja: "ja-JP", vi: "vi-VN", zh: "zh-CN", es: "es-ES" };

// 'ko', 'ko-KR', 'Korean' 같은 이름을 BCP-47 태그로(utterance.lang에 언어 이름을 넣으면 브라우저가 못 알아듣는다)
export const speechLang = (language: string) => TAGS[langOf(language)];

type VoiceLike = Pick<SpeechSynthesisVoice, "lang" | "name" | "localService">;
const norm = (tag: string) => tag.replace("_", "-").toLowerCase();

// 지역까지 같은 목소리(기기 안 목소리 먼저) → 언어만 같은 목소리. 없으면 고르지 않는다(브라우저가 lang으로 고른다)
export function pickVoice<V extends VoiceLike>(voices: readonly V[], tag: string): V | undefined {
  const want = norm(tag);
  const exact = voices.filter((v) => norm(v.lang) === want);
  return exact.find((v) => v.localService) ?? exact[0] ?? voices.find((v) => norm(v.lang).split("-")[0] === want.split("-")[0]);
}

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
  if (!value) window.speechSynthesis?.cancel();
  listeners.forEach((f) => f());
}
export function subscribeSound(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

// 휴대폰 브라우저(특히 iOS)는 사람이 누른 순간에 한 번 읽어야 그 뒤의 읽기를 허락한다. 마이크·언어 칩을 누를 때 소리 없이 한 번 읽는다
let unlocked = false;
export function unlockSpeech() {
  if (unlocked || !window.speechSynthesis) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  window.speechSynthesis.speak(u);
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

// 앞의 읽기는 끊는다. 목소리를 기다리는 사이 새 읽기가 오면 옛것은 버린다
let seq = 0;
export async function speak(text: string, language: string) {
  if (!window.speechSynthesis || !text || !soundOn()) return;
  const n = ++seq;
  const tag = speechLang(language);
  const voice = pickVoice(await voices(), tag);
  if (n !== seq || !soundOn()) return;
  const s = window.speechSynthesis;
  // iOS는 cancel 바로 뒤의 speak를 놓칠 때가 있어, 읽는 중일 때만 끊는다
  if (s.speaking || s.pending) s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = tag;
  if (voice) u.voice = voice;
  s.speak(u);
}
