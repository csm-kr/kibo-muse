// 말 → Spark 해석 → 화면 경로 계획. 키는 서버에만 있다.
import { interpret } from "@/kiosks/fastfood/interpret";
import type { KioskState } from "@/kiosks/fastfood/machine";
import { plan } from "@/kiosks/fastfood/planner";

export async function POST(req: Request) {
  const { utterance, state } = (await req.json()) as { utterance?: string; state?: KioskState };
  if (typeof utterance !== "string" || !utterance.trim() || !state) return Response.json({ error: "utterance and state are required" }, { status: 400 });

  const t0 = performance.now();
  try {
    const r = await interpret(utterance, state);
    const p = plan(state, r.intent);
    const planOut = p.kind === "plan" ? { kind: p.kind, events: p.events, paymentHandoff: p.paymentHandoff, assumed: p.assumed } : p;
    return Response.json({
      say: r.say,
      replyLanguage: r.replyLanguage,
      unknownItems: r.unknownItems,
      intent: r.intent,
      plan: planOut,
      timing: { sparkMs: r.ms, totalMs: Math.round(performance.now() - t0) },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
