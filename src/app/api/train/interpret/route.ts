// 말 → Spark 해석 → 앞 의도와 합치기 → 화면 경로 계획(기차). 키는 서버에만 있다.
import { logError, overSize, rateLimited, tooLarge } from "@/server/guard";
import { langOf, planSay, rejectSay } from "@/engine/turn";
import { clarifySay, seatNote, trainGate } from "@/kiosks/train/gates";
import { interpret } from "@/kiosks/train/interpret";
import type { KioskState } from "@/kiosks/train/machine";
import { mergeIntent, plan, type PlanResult, type TrainIntent } from "@/kiosks/train/planner";

export async function POST(req: Request) {
  // 공개 배포에서 IP별 분당 한도. 넘으면 429와 고정 문구
  const limited = rateLimited("interpret", req);
  if (limited) return limited;
  // 본문이 JSON이 아니거나 칸이 빠졌으면 400과 고정 값
  const { utterance, state, pending } = ((await req.json().catch(() => null)) ?? {}) as { utterance?: string; state?: KioskState; pending?: TrainIntent };
  if (typeof utterance !== "string" || !utterance.trim() || !state) return Response.json({ error: "bad_request" }, { status: 400 });
  if (overSize("utteranceChars", utterance.length)) return tooLarge(req);
  // 대답 언어: 휴대폰이 주소에 붙인 언어(?lang=). 없으면(평가 하네스·옛 클라이언트·키오스크에서 친 말) Spark가 고른 언어
  const phone = new URL(req.url).searchParams.get("lang") || null;

  const t0 = performance.now();
  try {
    // 발매기가 지금 무엇을 기다리는지는 클라이언트 말을 믿지 않고 상태와 앞 의도로 서버가 정한다
    const before = pending ? plan(state, pending) : null;
    const waiting = before?.kind === "plan" ? before.stop : null;
    const r = await interpret(utterance, state, waiting, pending ?? {});
    // '어린이만'은 발매기가 물은 뒤의 확인만 받는다(첫 말 "아이 한 명"을 어린이만으로 넘겨짚지 않게)
    const askedChildOnly = before?.kind === "clarify" && before.missing.includes("child_only");
    if (!askedChildOnly) delete r.intent.childrenOnly;
    const intent = mergeIntent(pending ?? {}, r.intent);
    // 나가기·못 하는 일·노선에 없는 역은 계획하지 않고 거절한다. 없는 출발역을 브리지중앙 출발로 바꿔 예약하지 않는다
    const unknown = (r.unknownFrom && !r.intent.from) || (r.unknownTo && !r.intent.to);
    const p: PlanResult = r.exit
      ? { kind: "reject", reason: "train_exit" }
      : r.unsupported !== "none"
        ? { kind: "reject", reason: r.unsupported === "other_discount" ? "train_discount" : "train_unsupported" }
        : unknown
          ? { kind: "reject", reason: "unknown_station" }
          : plan(state, intent);
    // 되묻기·계획·거절 모두 휴대폰과 같은 고정 문구(Spark 문장은 하지 않은 일을 말하거나 역 이름을 틀리게 쓸 수 있다)
    // 지난 시각은 발매기 시각(화면 위 시계)을 넣어 이유를 알린다
    const lang = phone ? langOf(phone) : r.replyLanguage;
    let say = p.kind === "reject" ? rejectSay(p.reason, lang, { now: `${String(state.nowHour).padStart(2, "0")}:00` }) : p.kind === "clarify" ? clarifySay(p.missing, lang) : r.say;
    let gate = null;
    let paymentHandoff = false;
    if (p.kind === "plan") {
      gate = trainGate(p.stop, lang);
      paymentHandoff = p.stop?.kind === "human";
      say = [planSay(p.events.length, lang, gate?.kind === "ack" ? gate : null), seatNote(p.notes, lang)].filter(Boolean).join(" ");
    }
    // 계획은 KIBO의 조작만 담아야 한다. 사람 터치나 기기 사건이 섞이면 보내지 않는다
    if (p.kind === "plan" && p.events.some((e) => e.by !== "kibo")) return Response.json({ error: "plan_not_kibo" }, { status: 500 });
    const planOut = p.kind === "plan" ? { kind: p.kind, events: p.events, stop: p.stop, notes: p.notes } : p;
    return Response.json({ say, replyLanguage: lang, intent, plan: planOut, gate, paymentHandoff, timing: { sparkMs: r.ms, totalMs: Math.round(performance.now() - t0) } });
  } catch (e) {
    // 예외 원문(Spark 오류 본문 포함)은 서버 로그에만 남기고 응답은 고정 값
    logError("train interpret", e);
    return Response.json({ error: "interpret_failed" }, { status: 502 });
  }
}
