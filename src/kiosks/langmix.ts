// Spark 되묻기 문장(say)이 요청 언어와 다른 문자 체계를 섞었는가(실측: 한국어 되묻기에 「…1개ですね」, 약 13회 중 1회).
// 규칙은 critic-tech langmix.py와 같다: 고유명사(키오스크 화면 이름)와 사용자 말을 그대로 인용한 조각을 뺀 뒤,
// 한국어에 가나·한자, 일본어에 한글, 중국어에 한글·가나, 그 밖(영어·베트남어·스페인어 등)에 한글·가나·한자가 남으면 섞임이다.
// 라틴 문자(M, L, 영어 이름)는 어느 언어에서도 섞임으로 보지 않는다.
import { langOf, type Lang } from "@/engine/turn";

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]+/g;
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]+/g;
const CJK = /[一-鿿㐀-䶿]+/g;

const runs = (s: string, re: RegExp) => s.match(re) ?? [];

// proper: 키오스크 고유명사(keywordsFor). utterance: 이번에 사용자가 한 말
export function mixedScript(say: string, lang: string, utterance: string, proper: readonly string[]): boolean {
  // 가운뎃점 「・」(U+30FB)과 장음 「ー」(U+30FC)은 가나 영역에 있지만 어느 언어에서나 문장부호처럼 쓰인다. 판정 전에 지운다
  let s = say.replace(/[・ー]/g, " ");
  for (const p of [...proper].sort((a, b) => b.length - a.length)) s = s.replaceAll(p, " ");
  for (const frag of [...runs(utterance, HANGUL), ...runs(utterance, KANA), ...runs(utterance, CJK)]) if (frag.length >= 2) s = s.replaceAll(frag, " ");
  const l = langOf(lang);
  const banned = l === "ko" ? [KANA, CJK] : l === "ja" ? [HANGUL] : l === "zh" ? [HANGUL, KANA] : [HANGUL, KANA, CJK];
  return banned.some((re) => runs(s, re).length > 0);
}

// 베트남어에만 쓰는 글자(성조·특수 문자). 스페인어·프랑스어와 겹치는 á é í ó ú à è ù 등은 뺀다(critic-tech langmix.py와 같다)
const VI = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
// 휴대폰 언어만의 문자가 받아쓴 글에 있는가(그 언어로 말했다는 증거). en·es는 고유 문자가 없어 Spark 판정만 쓴다
const native: Partial<Record<Lang, (s: string) => boolean>> = {
  ko: (s) => runs(s, HANGUL).length > 0,
  ja: (s) => runs(s, KANA).length > 0,
  zh: (s) => runs(s, CJK).length > 0 && runs(s, KANA).length === 0,
  vi: (s) => VI.test(s),
};
// 'OK'·'eat in'·메뉴 이름만 같은 짧은 말로는 바꾸지 않는다(한국어 사용자도 흔히 쓴다). 고유명사를 뺀 뒤 세 단어 이상이어야 분명하다
const MIN_WORDS = 3;
const words = (s: string) => [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(s)].filter((w) => w.isWordLike && /\p{L}/u.test(w.segment)).length;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 대답 언어. phone: 휴대폰 언어(?lang, 없으면 null: 평가 하네스·키오스크에서 친 말). spoken: Spark가 본 말한 언어. proper: 키오스크 고유명사·버튼 글자.
// 말한 언어가 휴대폰 언어와 분명히 다르면 말한 언어로 답하고 휴대폰에 따라오라고(followSpoken) 알린다.
// 분명히 = Spark가 다르다고 보고, 고유명사를 뺀 받아쓴 글에 휴대폰 언어 고유 문자가 하나도 없고, 남은 말이 세 단어 이상
// (장면 8 "Double Cheeseburger set 하나 제로 콜라로 먹고 갈게요"는 한글이 있어 휴대폰 언어 그대로)
export function replyLang(phone: string | null, spoken: string, utterance: string, proper: readonly string[]): { lang: string; followSpoken: boolean } {
  if (!phone) return { lang: spoken, followSpoken: false };
  const p = langOf(phone);
  const s = langOf(spoken);
  if (s === p) return { lang: p, followSpoken: false };
  let text = utterance.normalize("NFC");
  for (const n of [...proper].sort((a, b) => b.length - a.length)) if (n) text = text.replace(new RegExp(escapeRe(n), "gi"), " ");
  // 말한 언어만의 문자가 있으면(영어 휴대폰에 "안녕하세요") 짧아도 분명하다. 고유 문자가 없으면 세 단어 이상이어야 한다
  return !native[p]?.(text) && (native[s]?.(text) || words(text) >= MIN_WORDS) ? { lang: s, followSpoken: true } : { lang: p, followSpoken: false };
}

// 말한 언어를 글자로 짐작한다(Spark 판정이 없는 곳: 안내 모드 질문). 고유 문자가 없으면 스페인어 표지가 있을 때만 스페인어, 아니면 영어
export function guessLang(text: string): Lang {
  if (runs(text, HANGUL).length) return "ko";
  if (runs(text, KANA).length) return "ja";
  if (runs(text, CJK).length) return "zh";
  if (VI.test(text)) return "vi";
  return /[¿¡ñ]|\b(qué|dónde|cómo|cuál|botón|pulsar|quiero|para)\b/i.test(text) ? "es" : "en";
}
