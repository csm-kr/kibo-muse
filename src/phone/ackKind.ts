// 받아쓴 말의 종류(질문·주문·짧은 대답)를 가려 바로 하는 짧은 대답을 고른다.
// 11/4 사용자: '네, 잠시만요' 하나만 되풀이하니 별로다. 질문에는 '알아볼게요', 주문에는 '바로 해 드릴게요'처럼 말에 맞게 답한다.
// 소리는 public/ack/<언어>/<종류>-<번호>.mp3(대답과 같은 Gemini 목소리로 미리 만든 것)
import type { Lang } from "@/engine/turn";

export type AckKind = "question" | "request" | "short";

export const ACK_LINES: Record<Lang, Record<AckKind, [string, string, string]>> = {
  ko: { question: ["네, 알아볼게요.", "확인해 볼게요.", "잠깐만요, 찾아볼게요."], request: ["네, 바로 해 드릴게요.", "좋아요, 잠시만요.", "네, 알겠어요. 준비할게요."], short: ["네.", "네, 알겠어요.", "좋아요."] },
  en: { question: ["Let me check.", "Good question, one sec.", "Let me look that up."], request: ["Sure, on it.", "Okay, one moment.", "Got it, give me a second."], short: ["Okay.", "Got it.", "Sure."] },
  ja: { question: ["はい、調べますね。", "確認しますね。", "少々お待ちください、お調べします。"], request: ["はい、すぐやりますね。", "かしこまりました、少々お待ちください。", "はい、承知しました。"], short: ["はい。", "承知しました。", "わかりました。"] },
  vi: { question: ["Để tôi xem nhé.", "Tôi kiểm tra ngay.", "Chờ chút, tôi tìm nhé."], request: ["Vâng, tôi làm ngay.", "Được, chờ một chút.", "Vâng, tôi hiểu rồi."], short: ["Vâng.", "Tôi hiểu rồi.", "Vâng, tôi hiểu."] },
  zh: { question: ["好的，我查一下。", "我帮您看看。", "稍等，我找一下。"], request: ["好的，马上办。", "好的，请稍等。", "明白了，马上处理。"], short: ["好的。", "明白。", "好。"] },
  es: { question: ["Déjeme ver.", "Lo compruebo.", "Un momento, lo busco."], request: ["Claro, enseguida.", "Vale, un momento.", "Entendido, ya voy."], short: ["Vale.", "Entendido.", "De acuerdo."] },
};

// 받아쓰기는 물음표를 빼기도 해서 의문사·의문 어미로도 본다
const QUESTION: RegExp[] = [
  /[?？¿]/,
  /(뭐|무슨|무엇|몇|얼마|어디|언제|어떻게|어느|어떤|왜)|(나요|까요|ㄴ가요|는지|있어|되나|돼요|돼|있나|어때)\s*$/,
  /^(what|how|when|where|which|who|why|is|are|do|does|can|could|will|would)\b/i,
  /(か|の)\s*$|何|いくら|どこ|いつ|どう/,
  /không\s*$|bao nhiêu|mấy|đâu|nào|gì/i,
  /吗|什么|多少|几|哪|怎么/,
  /\b(qué|cuánto|cuánta|dónde|cuándo|cómo|cuál)\b/i,
];
const SHORT_WORDS = /^(네|예|응|아니요|아니|좋아요|맞아요|그래요|ok|okay|yes|no|yeah|sure|はい|いいえ|vâng|có|không|sí|vale|是|好|对|不是)\b/i;

export function ackKind(text: string): AckKind {
  const t = text.trim();
  if (QUESTION.some((r) => r.test(t))) return "question";
  const compact = t.replace(/[\s\p{P}]/gu, "");
  const words = t.split(/\s+/).filter(Boolean).length;
  if (SHORT_WORDS.test(t) && words <= 3) return "short";
  if (/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t) ? compact.length <= 5 : words <= 2) return "short";
  return "request";
}
