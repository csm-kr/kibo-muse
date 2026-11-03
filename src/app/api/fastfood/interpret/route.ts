// 말 → Spark 해석 → 앞 턴에 되물은 의도와 합치기 → 화면 경로 계획. 키는 서버에만 있다.
import { logError, overSize, rateLimited, tooLarge } from "@/server/guard";
import { langOf, planSay, rejectSay } from "@/engine/turn";
import { clarifySay } from "@/kiosks/fastfood/clarify";
import { interpret } from "@/kiosks/fastfood/interpret";
import type { KioskState } from "@/kiosks/fastfood/machine";
import { mergeIntent, plan, type FastfoodIntent } from "@/kiosks/fastfood/planner";
import { keywordsFor } from "@/kiosks/keywords";
import { mixedScript } from "@/kiosks/langmix";

export async function POST(req: Request) {
  // 공개 배포에서 IP별 분당 한도. 넘으면 429와 고정 문구
  const limited = rateLimited("interpret", req);
  if (limited) return limited;
  // 본문이 JSON이 아니거나 칸이 빠졌으면 400과 고정 값
  const { utterance, state, pending } = ((await req.json().catch(() => null)) ?? {}) as { utterance?: string; state?: KioskState; pending?: FastfoodIntent };
  if (typeof utterance !== "string" || !utterance.trim() || !state) return Response.json({ error: "bad_request" }, { status: 400 });
  if (overSize("utteranceChars", utterance.length)) return tooLarge(req);
  // 대답 언어: 휴대폰이 주소에 붙인 언어(?lang=). 없으면(평가 하네스·옛 클라이언트·키오스크에서 친 말) Spark가 고른 언어
  const phone = new URL(req.url).searchParams.get("lang") || null;

  const t0 = performance.now();
  try {
    const r = await interpret(utterance, state, pending);
    const intent = mergeIntent(pending ?? {}, r.intent);
    // 담긴 줄 바꾸기·빼기·주문 취소는 하지 않는다. 계획하지 않고 거절해 고정 문구로 답하게 한다(전체 취소는 전용 문구)
    const p: ReturnType<typeof plan> = r.unsupported === "cancel_order" ? { kind: "reject", reason: "cancel_order" } : r.unsupported !== "none" ? { kind: "reject", reason: "unsupported" } : plan(state, intent);
    // 계획은 KIBO의 조작만 담아야 한다. 사람 터치나 기기 사건이 섞이면 보내지 않는다
    if (p.kind === "plan" && p.events.some((e) => e.by !== "kibo")) return Response.json({ error: "plan_not_kibo" }, { status: 500 });
    const planOut = p.kind === "plan" ? { kind: p.kind, events: p.events, paymentHandoff: p.paymentHandoff, assumed: p.assumed, dropped: p.dropped, endScreen: p.final.screen } : p;
    const lang = phone ? langOf(phone) : r.replyLanguage;
    // 되묻기 Spark 문장이 휴대폰 언어가 아니거나(장면 8: 영어 섞인 한국어 말에 영어로 되물음) 다른 언어 문자를 섞었으면(실측 「…1개ですね」)
    // 담을 품목 이름과 빠진 칸으로 만든 고정 문구로 바꾼다
    const foreign = phone !== null && langOf(r.replyLanguage) !== lang;
    const clarify = p.kind === "clarify" && (foreign || mixedScript(r.say, r.replyLanguage, utterance, keywordsFor("fastfood"))) ? clarifySay(p.missing, intent, state, lang) : r.say;
    return Response.json({
      // 되묻기만 Spark 문장. 계획·거절은 휴대폰과 같은 고정 문구(Spark 문장은 하지 않은 일을 말할 수 있다. 예: 결제 전 "注文を確定しました")
      say: p.kind === "clarify" ? clarify : p.kind === "reject" ? rejectSay(p.reason, lang) : planSay(p.events.length, lang),
      replyLanguage: lang,
      unknownItems: r.unknownItems,
      intent,
      plan: planOut,
      timing: { sparkMs: r.ms, totalMs: Math.round(performance.now() - t0) },
    });
  } catch (e) {
    // 예외 원문(Spark 오류 본문 포함)은 서버 로그에만 남기고 응답은 고정 값
    logError("fastfood interpret", e);
    return Response.json({ error: "interpret_failed" }, { status: 502 });
  }
}
