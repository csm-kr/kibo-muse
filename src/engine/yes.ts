// 관문 동의로 받는 고정 "예" 목록. 동의는 Spark를 거치지 않고, 띄어쓰기·문장부호를 뺀 말 전체가 목록과 똑같을 때만 인정한다.
// 목록 = '예' 머리말, 동의 문장, 머리말 + 문장("네, 알겠습니다"). 머리말 뒤에 목록에 없는 말이 붙으면("네 근데 라이터 있어요") 동의가 아니다.
// 물음표가 있으면("네?") 되묻는 말이라 동의가 아니다. 부정·잡음·덧붙인 말은 목록에 없으니 동의가 아니다.
// 휴대폰 언어 설정과 받아쓰기 언어가 어긋날 수 있어 여섯 언어 목록을 함께 본다.
// 존댓말 머리·꼬리(베트남어 "dạ …", "… ạ", 한국어 "…요", 중국어 어기조사)는 떼고도 본다. 떼서 생기는 말도 목록에 있어야 하므로 "아니요"→"아니"처럼 부정은 통과하지 않는다.
// 받아쓰기가 앞부분을 한 번 되풀이하는 일이 있어("Vâng,Vâng, tôi xác nhận.") 목록 문장 앞에 그 문장의 앞부분이 한 번 더 붙은 꼴도 예로 본다.
// 단어 묶음(1–4단어)을 바로 이어 되풀이하는 일도 있어("tôi xác xác nhận") 묶음을 하나로 줄인 꼴도 본다. 줄인 꼴은 목록과 똑같아야만 동의다.

// 언어마다 '예' 머리말(혼자서도 동의)과 문장(혼자서도, 머리말 뒤에서도 동의). 같은 언어 안에서만 잇는다
type L = "ko" | "en" | "ja" | "vi" | "zh" | "es";
const heads: Record<L, string[]> = {
  // "내"는 "네"의 받아쓰기 동음
  ko: ["네", "예", "넵", "내", "응"],
  en: ["yes", "yeah", "yep", "ok", "okay", "sure"],
  ja: ["はい", "ええ", "うん"],
  vi: ["vâng", "dạ", "có"],
  zh: ["是", "是的", "好", "好的", "对", "对的"],
  es: ["sí", "si", "vale"],
};
const sentences: Record<L, string[]> = {
  ko: ["그래", "그래요", "좋아", "좋아요", "알겠어요", "알겠습니다", "확인", "확인했어요", "확인했습니다", "동의해요", "동의합니다", "맞아요", "맞습니다", "확정", "확정해 주세요", "그 자리로 확정해 주세요", "그렇게 해 주세요", "진행해 주세요"],
  en: ["confirm", "confirm it", "please confirm", "i confirm", "confirmed", "i agree", "i understand", "thats right", "correct", "go ahead", "all good"],
  ja: ["いいよ", "そうです", "確認しました", "同意します", "大丈夫です", "確定", "確定します", "お願いします"],
  vi: ["đúng rồi", "được", "được rồi", "đồng ý", "tôi đồng ý", "xác nhận", "tôi xác nhận", "tôi đã đọc và đồng ý"],
  zh: ["确认", "我确认", "我已确认", "同意", "我同意", "可以", "没问题"],
  es: ["de acuerdo", "confirmo", "lo confirmo", "confirmado", "correcto", "claro"],
};
// 머리말 뒤에서만 동의인 말("please" 혼자는 동의가 아니다)
const afterHeadOnly: Record<L, string[]> = { ko: [], en: ["please"], ja: [], vi: [], zh: [], es: ["por favor"] };

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
const YES = new Set(
  (Object.keys(heads) as L[]).flatMap((l) => {
    const h = heads[l].map(norm);
    const alone = [...h, ...sentences[l].map(norm)];
    return [...alone, ...h.flatMap((a) => [...alone, ...afterHeadOnly[l].map(norm)].map((b) => a + b))];
  }),
);

const HEADS = ["dạ"].map(norm);
const TAILS = ["ạ", "요", "啊", "呀", "吧"].map(norm);

// 존댓말 머리·꼬리를 뗀 꼴들
function forms(n: string) {
  const out = new Set([n]);
  for (const h of HEADS) if (n.startsWith(h) && n.length > h.length) out.add(n.slice(h.length));
  for (const f of [...out]) for (const t of TAILS) if (f.endsWith(t) && f.length > t.length) out.add(f.slice(0, -t.length));
  return out;
}

// 목록 문장 q이거나, q를 그대로 되풀이한 꼴("네네", "yes yes yes")이거나, q 앞에 q의 앞부분이 한 번 더 붙은 꼴(받아쓰기 되풀이)인가
const matches = (f: string) =>
  YES.has(f) ||
  [...YES].some((q) => {
    if (!f.endsWith(q)) return false;
    if (f.length % q.length === 0 && q.repeat(f.length / q.length) === f) return true;
    const p = f.slice(0, f.length - q.length);
    return p.length > 0 && q.startsWith(p);
  });

// 바로 이어 되풀이된 1–4단어 묶음을 하나로 줄인다("tôi xác nhận, tôi xác nhận" → "tôi xác nhận")
function collapse(text: string) {
  const w = text.normalize("NFC").toLowerCase().split(/[\s\p{P}\p{S}]+/u).filter(Boolean);
  for (let changed = true; changed; ) {
    changed = false;
    for (let k = 1; k <= 4; k++)
      for (let i = 0; i + 2 * k <= w.length; i++)
        if (w.slice(i, i + k).join(" ") === w.slice(i + k, i + 2 * k).join(" ")) {
          w.splice(i + k, k);
          changed = true;
        }
  }
  return w.join("");
}

export function isYes(text: string) {
  if (/[?？]/.test(text)) return false;
  const n = norm(text);
  return n.length > 0 && ([...forms(n)].some(matches) || [...forms(collapse(text))].some((f) => YES.has(f)));
}
