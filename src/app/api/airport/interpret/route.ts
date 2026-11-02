// 말 → Spark 해석 → 앞 의도와 합치기 → 화면 경로 계획. 키는 서버에만 있다.
import { overSize, rateLimited, tooLarge } from "@/server/guard";
import { planSay, rejectSay } from "@/engine/turn";
import { gateFor, noSeatsText } from "@/kiosks/airport/gates";
import { interpret } from "@/kiosks/airport/interpret";
import type { KioskState } from "@/kiosks/airport/machine";
import { mergeIntent, plan, splitBags, type AirportIntent } from "@/kiosks/airport/planner";

export async function POST(req: Request) {
  // 공개 배포에서 IP별 분당 한도. 넘으면 429와 고정 문구
  const limited = rateLimited("interpret", req);
  if (limited) return limited;
  const { utterance, state, pending } = (await req.json()) as { utterance?: string; state?: KioskState; pending?: AirportIntent };
  if (typeof utterance !== "string" || !utterance.trim() || !state) return Response.json({ error: "utterance and state are required" }, { status: 400 });
  if (overSize("utteranceChars", utterance.length)) return tooLarge(req);

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
    let say = p.kind === "reject" ? rejectSay(p.reason, r.replyLanguage) : r.say;
    let gate = null;
    if (p.kind === "plan") {
      gate = gateFor(p.stop, r.replyLanguage, Object.values(splitBags(intent.bags ?? 0, p.final.scanned)).reduce((a, b) => a + b, 0));
      say = planSay(p.events.length, r.replyLanguage, gate?.kind === "ack" ? gate : null);
      if (p.notes.includes("no_matching_seats")) say = `${say} ${noSeatsText(r.replyLanguage)}`;
    }
    // 계획은 KIBO의 조작만 담아야 한다. 사람 터치나 기기 사건이 섞이면 보내지 않는다
    if (p.kind === "plan" && p.events.some((e) => e.by !== "kibo")) return Response.json({ error: "plan_not_kibo" }, { status: 500 });
    const planOut = p.kind === "plan" ? { kind: p.kind, events: p.events, stop: p.stop, notes: p.notes } : p;
    return Response.json({ say, replyLanguage: r.replyLanguage, intent, plan: planOut, gate, timing: { sparkMs: r.ms, totalMs: Math.round(performance.now() - t0) } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
