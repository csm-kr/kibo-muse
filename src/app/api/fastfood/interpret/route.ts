// 말 → Spark 해석 → 앞 턴에 되물은 의도와 합치기 → 화면 경로 계획. 키는 서버에만 있다.
import { logError, overSize, rateLimited, tooLarge } from "@/server/guard";
import { langOf, planSay, rejectSay } from "@/engine/turn";
import { answerPatch, clarifySay, koParticles } from "@/kiosks/fastfood/clarify";
import { interpret } from "@/kiosks/fastfood/interpret";
import type { KioskState } from "@/kiosks/fastfood/machine";
import { mergeIntent, plan, type FastfoodIntent } from "@/kiosks/fastfood/planner";
import { buttonsFor, keywordsFor } from "@/kiosks/keywords";
import { mixedScript, replyLang } from "@/kiosks/langmix";
import { t } from "@/kiosks/fastfood/ui/strings";
import type { Answer } from "@/sync/link";

export async function POST(req: Request) {
  // 공개 배포에서 IP별 분당 한도. 넘으면 429와 고정 문구
  const limited = rateLimited("interpret", req);
  if (limited) return limited;
  // 본문이 JSON이 아니거나 칸이 빠졌으면 400과 고정 값
  const { utterance, state, pending, answer } = ((await req.json().catch(() => null)) ?? {}) as { utterance?: string; state?: KioskState; pending?: FastfoodIntent; answer?: Answer };
  if (typeof utterance !== "string" || !utterance.trim() || !state) return Response.json({ error: "bad_request" }, { status: 400 });
  if (overSize("utteranceChars", utterance.length)) return tooLarge(req, "speech");
  // 대답 언어: 휴대폰이 주소에 붙인 언어(?lang=). 없으면(평가 하네스·옛 클라이언트·키오스크에서 친 말) Spark가 고른 언어
  const phone = new URL(req.url).searchParams.get("lang") || null;
  // 평가 전용(eval/interpret/score.mts --model): Spark 판본을 바꿔 같은 세트를 비교한다. production에서는 무시한다
  const model = process.env.NODE_ENV !== "production" ? (req.headers.get("x-eval-model") ?? undefined) : undefined;

  const t0 = performance.now();
  try {
    // 휴대폰 답 칩이면 Spark를 부르지 않는다. 지금 상태에 맞지 않는 답이면(patch 없음) Spark 길
    const patch = answer ? answerPatch(answer, state, pending) : null;
    const r = patch ? { intent: patch, unsupported: "none" as const, replyLanguage: phone ?? "en", say: "", unknownItems: [] as string[], ms: 0 } : await interpret(utterance, state, pending, { model });
    const intent = mergeIntent(pending ?? {}, r.intent);
    // 담긴 줄 바꾸기·빼기·주문 취소는 하지 않는다. 계획하지 않고 거절해 고정 문구로 답하게 한다(전체 취소는 전용 문구)
    const p: ReturnType<typeof plan> = r.unsupported === "cancel_order" ? { kind: "reject", reason: "cancel_order" } : r.unsupported !== "none" ? { kind: "reject", reason: "unsupported" } : plan(state, intent);
    // 계획은 KIBO의 조작만 담아야 한다. 사람 터치나 기기 사건이 섞이면 보내지 않는다
    if ((p.kind === "plan" || p.kind === "clarify") && p.events.some((e) => e.by !== "kibo")) return Response.json({ error: "plan_not_kibo" }, { status: 500 });
    const planOut = p.kind === "plan" ? { kind: p.kind, events: p.events, paymentHandoff: p.paymentHandoff, assumed: p.assumed, dropped: p.dropped, endScreen: p.final.screen } : p;
    // 휴대폰 언어로 답한다. 다만 말한 언어가 분명히 다르면(순수 영어 등) 말한 언어로 답하고 휴대폰이 따라오게 한다(followSpoken)
    const proper = [...keywordsFor("fastfood"), ...buttonsFor("fastfood")];
    const { lang, followSpoken } = replyLang(phone, r.replyLanguage, utterance, proper);
    // 되묻기 Spark 문장이 휴대폰 언어가 아니거나(장면 8: 영어 섞인 한국어 말에 영어로 되물음) 다른 언어 문자를 섞었으면(실측 「…1개ですね」)
    // 담을 품목 이름과 빠진 칸으로 만든 고정 문구로 바꾼다
    const foreign = phone !== null && langOf(r.replyLanguage) !== lang;
    // 주문이 아닌 말(인사·메뉴 질문): 할 일이 없으면 일반 거절 대신 Spark 응대 문장. 휴대폰 언어가 아니거나 섞였으면 고정 인사(11/4 실기기 "안녕하세요")
    const nothing = !r.intent.items?.length && !r.intent.orderType && !r.intent.current && !r.intent.dropCurrent && !r.intent.checkout && !r.intent.requestPayment && r.unsupported === "none";
    const chat = nothing && ((p.kind === "reject" && p.reason === "bad_order_type") || (p.kind === "plan" && p.events.length === 0));
    const chatSay = chat ? (langOf(r.replyLanguage) !== lang || mixedScript(r.say, r.replyLanguage, utterance, [...keywordsFor("fastfood"), ...buttonsFor("fastfood")]) ? rejectSay("chat", lang) : r.say) : null;
    // 첫 화면에서 할 일이 없는 말이면 [Order here]만 먼저 눌러 매장·포장 화면을 띄운다(되묻기처럼 답하고 아는 만큼 먼저 누르기).
    // 빠진 칸(매장·포장)을 실어 휴대폰에 [먹고 갈게요][포장할게요] 칩이 붙게 한다(키오스크가 그 화면에 있다는 결정적 조건)
    const out = chat && state.screen === "idle" ? { kind: "clarify" as const, missing: [{ field: "orderType" as const }], events: [{ by: "kibo" as const, target: "start" as const }] } : planOut;
    const clarify = p.kind === "clarify" && (patch || foreign || mixedScript(r.say, r.replyLanguage, utterance, proper)) ? clarifySay(p.missing, intent, state, lang) : lang === "ko" ? koParticles(r.say) : r.say;
    return Response.json({
      // 되묻기만 Spark 문장. 계획·거절은 휴대폰과 같은 고정 문구(Spark 문장은 하지 않은 일을 말할 수 있다. 예: 결제 전 "注文を確定しました")
      say: chatSay ?? (p.kind === "clarify" ? clarify : p.kind === "reject" ? rejectSay(p.reason, lang, { b: t.startOver[state.lang] ?? t.startOver.en }) : planSay(p.events.length, lang)),
      replyLanguage: lang,
      ...(followSpoken && { followSpoken }),
      unknownItems: r.unknownItems,
      intent,
      plan: out,
      timing: { sparkMs: r.ms, totalMs: Math.round(performance.now() - t0) },
    });
  } catch (e) {
    // 예외 원문(Spark 오류 본문 포함)은 서버 로그에만 남기고 응답은 고정 값
    logError("fastfood interpret", e);
    return Response.json({ error: "interpret_failed" }, { status: 502 });
  }
}
