// 말 → Spark 해석 → 앞 턴에 되물은 의도와 합치기 → 화면 경로 계획. 키는 서버에만 있다.
import { overSize, rateLimited, tooLarge } from "@/server/guard";
import { planSay, rejectSay } from "@/engine/turn";
import { interpret } from "@/kiosks/fastfood/interpret";
import type { KioskState } from "@/kiosks/fastfood/machine";
import { mergeIntent, plan, type FastfoodIntent } from "@/kiosks/fastfood/planner";

export async function POST(req: Request) {
  // 공개 배포에서 IP별 분당 한도. 넘으면 429와 고정 문구
  const limited = rateLimited("interpret", req);
  if (limited) return limited;
  const { utterance, state, pending } = (await req.json()) as { utterance?: string; state?: KioskState; pending?: FastfoodIntent };
  if (typeof utterance !== "string" || !utterance.trim() || !state) return Response.json({ error: "utterance and state are required" }, { status: 400 });
  if (overSize("utteranceChars", utterance.length)) return tooLarge(req);

  const t0 = performance.now();
  try {
    const r = await interpret(utterance, state, pending);
    const intent = mergeIntent(pending ?? {}, r.intent);
    // 담긴 줄 바꾸기·빼기·주문 취소는 하지 않는다. 계획하지 않고 거절해 고정 문구로 답하게 한다(전체 취소는 전용 문구)
    const p: ReturnType<typeof plan> = r.unsupported === "cancel_order" ? { kind: "reject", reason: "cancel_order" } : r.unsupported !== "none" ? { kind: "reject", reason: "unsupported" } : plan(state, intent);
    // 계획은 KIBO의 조작만 담아야 한다. 사람 터치나 기기 사건이 섞이면 보내지 않는다
    if (p.kind === "plan" && p.events.some((e) => e.by !== "kibo")) return Response.json({ error: "plan_not_kibo" }, { status: 500 });
    const planOut = p.kind === "plan" ? { kind: p.kind, events: p.events, paymentHandoff: p.paymentHandoff, assumed: p.assumed, dropped: p.dropped, endScreen: p.final.screen } : p;
    return Response.json({
      // 되묻기만 Spark 문장. 계획·거절은 휴대폰과 같은 고정 문구(Spark 문장은 하지 않은 일을 말할 수 있다. 예: 결제 전 "注文を確定しました")
      say: p.kind === "clarify" ? r.say : p.kind === "reject" ? rejectSay(p.reason, r.replyLanguage) : planSay(p.events.length, r.replyLanguage),
      replyLanguage: r.replyLanguage,
      unknownItems: r.unknownItems,
      intent,
      plan: planOut,
      timing: { sparkMs: r.ms, totalMs: Math.round(performance.now() - t0) },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
