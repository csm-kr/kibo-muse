// 휴대폰 기본 언어. 후보를 앞에서부터 보고(주소 ?lang= → 사용자가 고른 값 → 브라우저 언어 목록) 지원하는 6개 언어 중 처음 맞는 것을 고른다. 없으면 English
const CODES = ["en", "ko", "ja", "vi", "zh", "es"] as const;
export type PhoneLangCode = (typeof CODES)[number];

export function pickLang(candidates: readonly (string | null | undefined)[]): PhoneLangCode {
  for (const c of candidates) {
    const k = (c ?? "").toLowerCase().slice(0, 2);
    const hit = CODES.find((x) => x === k);
    if (hit) return hit;
  }
  return "en";
}

const KEY = "kibo.phone.lang";
export function savedLang(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function saveLang(code: string) {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // 저장할 수 없는 브라우저(사생활 모드 등)면 이번 화면에서만 쓴다
  }
}
