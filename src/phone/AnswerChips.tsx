"use client";

// 되묻기 답 칩(KIBO 대답 말풍선 아래). 누르면 보이는 글자 그대로 글 보내기와 같은 길로 보낸다(받아쓰기 없음).
// 칩 글자는 휴대폰 언어. 좁거나 글씨가 크면 다음 줄로 넘긴다
import type { Answer, Answers } from "@/sync/link";
import { phoneText } from "./text";

// 칩마다 글과 함께 보내는 정해진 답(text.ts answers와 같은 순서). 서버가 Spark 없이 바로 계획한다. [더 주문할게요]는 보내지 않는다(chipPick)
const values: Record<Answers, Answer[]> = {
  orderType: [
    { field: "orderType", value: "eat_in" },
    { field: "orderType", value: "take_out" },
  ],
  mode: [
    { field: "mode", value: "set" },
    { field: "mode", value: "single" },
  ],
  size: [
    { field: "size", value: "M" },
    { field: "size", value: "L" },
  ],
  more: [{ field: "more" }],
};

export type ChipPick = { send: string; answer?: Answer } | { local: string; reply: string };

// 칩을 누른 결과: 키오스크로 보낼 글과 정해진 답. [더 주문할게요]는 키오스크가 할 일이 없어(Spark가 '누를 버튼이 없어요') 보내지 않고,
// 휴대폰에서 바로 내 말과 고정 KIBO 턴을 붙인다
export function chipPick(kind: Answers, i: number, language: string): ChipPick {
  const tx = phoneText(language);
  const text = tx.answers[kind][i];
  if (kind === "more" && i === 1) return { local: text, reply: tx.moreAsk };
  const answer = values[kind][i];
  return answer ? { send: text, answer } : { send: text };
}

export function AnswerChips({ kind, language, onPick }: { kind: Answers; language: string; onPick: (c: ChipPick) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2" data-answer-chips>
      {phoneText(language).answers[kind].map((a, i) => (
        <button key={a} type="button" onClick={() => onPick(chipPick(kind, i, language))} className="min-h-11 rounded-full border-2 border-[var(--k-teal)] px-4 text-base font-bold break-keep text-[var(--k-teal)]">
          {a}
        </button>
      ))}
    </div>
  );
}
