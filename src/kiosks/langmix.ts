// Spark 되묻기 문장(say)이 요청 언어와 다른 문자 체계를 섞었는가(실측: 한국어 되묻기에 「…1개ですね」, 약 13회 중 1회).
// 규칙은 critic-tech langmix.py와 같다: 고유명사(키오스크 화면 이름)와 사용자 말을 그대로 인용한 조각을 뺀 뒤,
// 한국어에 가나·한자, 일본어에 한글, 중국어에 한글·가나, 그 밖(영어·베트남어·스페인어 등)에 한글·가나·한자가 남으면 섞임이다.
// 라틴 문자(M, L, 영어 이름)는 어느 언어에서도 섞임으로 보지 않는다.
import { langOf } from "@/engine/turn";

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
