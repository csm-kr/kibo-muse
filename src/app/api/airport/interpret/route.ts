// 말 → Spark 해석 → 앞 의도와 합치기 → 화면 경로 계획. 키는 서버에만 있다.
import { logError, overSize, rateLimited, tooLarge } from "@/server/guard";
import { langOf, planSay, rejectSay } from "@/engine/turn";
import { clarifySay, gateFor, noSeatsText } from "@/kiosks/airport/gates";
import { interpret } from "@/kiosks/airport/interpret";
import type { KioskState } from "@/kiosks/airport/machine";
import { mergeIntent, plan, splitBags, type AirportIntent } from "@/kiosks/airport/planner";
import { buttonsFor, keywordsFor } from "@/kiosks/keywords";
import { mixedScript, replyLang } from "@/kiosks/langmix";
import { t } from "@/kiosks/airport/ui/strings";

export async function POST(req: Request) {
  // 공개 배포에서 IP별 분당 한도. 넘으면 429와 고정 문구
  const limited = rateLimited("interpret", req);
  if (limited) return limited;
  // 본문이 JSON이 아니거나 칸이 빠졌으면 400과 고정 값
  const { utterance, state, pending } = ((await req.json().catch(() => null)) ?? {}) as { utterance?: string; state?: KioskState; pending?: AirportIntent };
  if (typeof utterance !== "string" || !utterance.trim() || !state) return Response.json({ error: "bad_request" }, { status: 400 });
  if (overSize("utteranceChars", utterance.length)) return tooLarge(req, "speech");
  // 대답 언어: 휴대폰이 주소에 붙인 언어(?lang=). 없으면(평가 하네스·옛 클라이언트·키오스크에서 친 말) Spark가 고른 언어
  const phone = new URL(req.url).searchParams.get("lang") || null;

  const t0 = performance.now();
  try {
    // 키오스크가 지금 무엇을 기다리는지는 클라이언트 말을 믿지 않고 상태와 앞 의도로 서버가 정한다
    const before = pending ? plan(state, pending) : null;
    const waiting = before?.kind === "plan" ? before.stop : null;
    const r = await interpret(utterance, state, waiting, pending ?? {});
    const intent = mergeIntent(pending ?? {}, r.intent);
    // 나가기는 하지 않는다. 계획하지 않고 거절해, 확정 카드를 다시 띄우지 않고 고정 문구로 답하게 한다
    const p: ReturnType<typeof plan> = r.exit ? { kind: "reject", reason: "exit" } : plan(state, intent);
    // 되묻기만 Spark 문장. 계획·거절은 휴대폰과 같은 고정 문구(Spark 문장은 하지 않은 일을 말할 수 있다)
    // 되묻기 Spark 문장이 휴대폰 언어가 아니거나 다른 언어 문자를 섞었으면 알아들은 항공사와 빠진 칸으로 만든 고정 문구로 바꾼다
    // 휴대폰 언어로 답한다. 다만 말한 언어가 분명히 다르면(순수 영어 등) 말한 언어로 답하고 휴대폰이 따라오게 한다(followSpoken)
    const proper = [...keywordsFor("airport"), ...buttonsFor("airport")];
    const { lang, followSpoken } = replyLang(phone, r.replyLanguage, utterance, proper);
    const foreign = phone !== null && langOf(r.replyLanguage) !== lang;
    const clarify = p.kind === "clarify" && (foreign || mixedScript(r.say, r.replyLanguage, utterance, proper)) ? clarifySay(p.missing, intent, lang) : r.say;
    let say = p.kind === "reject" ? rejectSay(p.reason, lang, { b: t.exit[state.lang] ?? t.exit.en }) : clarify;
    let gate = null;
    if (p.kind === "plan") {
      gate = gateFor(p.stop, lang, Object.values(splitBags(intent.bags ?? 0, p.final.scanned)).reduce((a, b) => a + b, 0));
      say = planSay(p.events.length, lang, gate?.kind === "ack" ? gate : null);
      if (p.notes.includes("no_matching_seats")) say = `${say} ${noSeatsText(lang)}`;
    }
    // 계획은 KIBO의 조작만 담아야 한다. 사람 터치나 기기 사건이 섞이면 보내지 않는다
    if (p.kind === "plan" && p.events.some((e) => e.by !== "kibo")) return Response.json({ error: "plan_not_kibo" }, { status: 500 });
    const planOut = p.kind === "plan" ? { kind: p.kind, events: p.events, stop: p.stop, notes: p.notes } : p;
    return Response.json({ say, replyLanguage: lang, ...(followSpoken && { followSpoken }), intent, plan: planOut, gate, timing: { sparkMs: r.ms, totalMs: Math.round(performance.now() - t0) } });
  } catch (e) {
    // 예외 원문(Spark 오류 본문 포함)은 서버 로그에만 남기고 응답은 고정 값
    logError("airport interpret", e);
    return Response.json({ error: "interpret_failed" }, { status: 502 });
  }
}
