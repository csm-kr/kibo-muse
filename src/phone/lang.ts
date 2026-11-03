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

// 대답이 말한 언어를 따라오라고 하면(followSpoken: 휴대폰 언어와 분명히 다른 언어로 말함) 바꿀 언어. 바꾸지 않으면 null.
// 이번 화면에서 사람이 언어 칩으로 직접 골랐으면(userPicked) 그 선택을 지킨다
export function followLang(m: { followSpoken?: boolean; replyLanguage: string }, current: PhoneLangCode, userPicked: boolean): PhoneLangCode | null {
  if (!m.followSpoken || userPicked) return null;
  const next = CODES.find((c) => c === m.replyLanguage.toLowerCase().slice(0, 2));
  return next && next !== current ? next : null;
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
