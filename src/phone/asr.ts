// 받아쓰기 측정(/asr-test)의 문장과 채점. 사용자가 실제 휴대폰으로 읽고, 같은 녹음을 24kHz·16kHz 두 갈래로 보내 비교한다

export interface Sentence {
  lang: "Korean" | "English";
  text: string;
}
export const SENTENCES: Sentence[] = [
  "더블 치즈버거 세트 하나 주세요",
  "라지로요",
  "매장에서 먹고 갈게요",
  "포장해 주세요",
  "음료는 제로 콜라로 바꿔 주세요",
  "감자튀김 대신 치즈스틱으로요",
  "불고기버거 단품 두 개요",
  "스파이시 치킨버거 세트, 레몬 소다로요",
  "새우버거에 치즈 추가해 주세요",
  "너겟 4조각이랑 아이스티 하나요",
  "아이스크림 선데 하나 추가요",
  "방금 거 빼 주세요",
  "그게 다예요",
  "결제도 해 줘",
  "네, 맞아요",
  "아니요, 미디엄으로요",
  "베지 버거 세트 하나, 바닐라 셰이크로 바꿔 주세요",
]
  .map((text): Sentence => ({ lang: "Korean", text }))
  .concat(["I'd like a double cheeseburger meal with a Coke Zero", "Large, please", "That's all"].map((text): Sentence => ({ lang: "English", text })));

// 공백·문장부호·기호를 빼고 대소문자를 맞춘다. 글자는 코드 포인트 단위로 센다
const chars = (s: string) => [...s.normalize("NFC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "")];

function levenshtein(a: string[], b: string[]) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// 글자 오류율 = 레벤시테인 거리 ÷ 기준 글자 수
export function cer(ref: string, hyp: string) {
  const r = chars(ref);
  return levenshtein(r, chars(hyp)) / r.length;
}

// 받아쓰기가 같은 말을 이어서 두 번 적은 경우. 3글자 이상 덩어리가 바로 이어 반복되고, 기준 문장에는 그 반복이 없을 때
export function repeated(ref: string, hyp: string) {
  const h = chars(hyp);
  const r = chars(ref).join("");
  for (let k = 3; 2 * k <= h.length; k++)
    for (let i = 0; i + 2 * k <= h.length; i++) {
      const x = h.slice(i, i + k).join("");
      if (x === h.slice(i + k, i + 2 * k).join("") && !r.includes(x + x)) return true;
    }
  return false;
}

interface Branch {
  cer: number;
  repeated: boolean;
}
// 갈래별(a = 24kHz, b = 16kHz) 평균 CER과 되풀이 건수
export function summarize(rows: { a: Branch; b: Branch }[]) {
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return {
    n: rows.length,
    cerA: mean(rows.map((r) => r.a.cer)),
    cerB: mean(rows.map((r) => r.b.cer)),
    repeatsA: rows.filter((r) => r.a.repeated).length,
    repeatsB: rows.filter((r) => r.b.repeated).length,
  };
}
