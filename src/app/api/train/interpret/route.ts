// 말 → Spark 해석 → 앞 의도와 합치기 → 화면 경로 계획(기차). 키는 서버에만 있다.
import { logError, overSize, rateLimited, tooLarge } from "@/server/guard";
import { langOf, planSay, rejectSay } from "@/engine/turn";
import { buttonsFor, keywordsFor } from "@/kiosks/keywords";
import { mixedScript, replyLang } from "@/kiosks/langmix";
import { bookingSay, clarifySay, planLead, seatNote, trainGate } from "@/kiosks/train/gates";
import { fillStations, misspelledStation } from "@/kiosks/train/facts";
import { interpret } from "@/kiosks/train/interpret";
import type { KioskState } from "@/kiosks/train/machine";
import { mergeIntent, plan, type PlanResult, type TrainIntent } from "@/kiosks/train/planner";
import { HOME_STATION, stations } from "@/kiosks/train/rail";
import { t } from "@/kiosks/train/ui/strings";

export async function POST(req: Request) {
  // 공개 배포에서 IP별 분당 한도. 넘으면 429와 고정 문구
  const limited = rateLimited("interpret", req);
  if (limited) return limited;
  // 본문이 JSON이 아니거나 칸이 빠졌으면 400과 고정 값
  const { utterance, state, pending } = ((await req.json().catch(() => null)) ?? {}) as { utterance?: string; state?: KioskState; pending?: TrainIntent };
  if (typeof utterance !== "string" || !utterance.trim() || !state) return Response.json({ error: "bad_request" }, { status: 400 });
  if (overSize("utteranceChars", utterance.length)) return tooLarge(req, "speech");
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
    // 휴대폰 언어로 답한다. 다만 말한 언어가 분명히 다르면(순수 영어 등) 말한 언어로 답하고 휴대폰이 따라오게 한다(followSpoken)
    const proper = [...keywordsFor("train"), ...buttonsFor("train")];
    const { lang, followSpoken } = replyLang(phone, r.replyLanguage, utterance, proper);
    // Spark 문장: 질문(몇 시·얼마·어디)에 사실로 답하고 빠진 것만 묻는다(11/4 실기기: 질문에 '알려 주세요: 날짜와 시각, 인원'만 되풀이).
    // 역 {id}는 정확한 이름으로 채운다. 대답 언어가 다르거나, 다른 문자가 섞였거나, 역 이름을 틀렸거나, 모르는 {id}면 고정 문구로 답한다
    const filled = r.say ? fillStations(r.say, lang) : null;
    const sparkSay = filled && langOf(r.replyLanguage) === langOf(lang) && !misspelledStation(filled) && !mixedScript(filled, r.replyLanguage, utterance, proper) ? filled : null;
    // 나가기·못 하는 일·날짜·인원 같은 거절과 관문·계획 문구는 고정 문구다(Spark 문장은 하지 않은 일을 말할 수 있다)
    const ko = langOf(lang) === "ko";
    const destinations = stations.filter((x) => x.id !== HOME_STATION).map((x) => x.name[ko ? "ko" : "en"]).join(", ");
    let say =
      p.kind === "reject"
        ? p.reason === "unknown_station"
          ? (sparkSay ?? `${rejectSay(p.reason, lang)} ${ko ? `갈 수 있는 역: ${destinations}.` : `Stations: ${destinations}.`}`)
          : rejectSay(p.reason, lang, { now: `${String(state.nowHour).padStart(2, "0")}:00`, b: t.home[state.lang] ?? t.home.en })
        : p.kind === "clarify"
          ? p.missing.includes("child_only")
            ? clarifySay(p.missing, lang)
            : (sparkSay ?? clarifySay(p.missing, lang, intent))
          : "";
    let gate = null;
    let paymentHandoff = false;
    let booked = "";
    let lead = "";
    // 누를 것 없는 턴의 Spark 답. 휴대폰이 '누를 버튼이 없어요' 대신 말한다
    let answer = "";
    if (p.kind === "plan") {
      gate = trainGate(p.stop, lang);
      paymentHandoff = p.stop?.kind === "human";
      // 누를 것도 사람 관문도 없으면(예약 뒤 '창가로 해 주세요') Spark가 지금 할 수 있는 일을 알린다
      const idle = p.events.length === 0 && !gate;
      // 누르기 전에는 알아들은 것(도착역·날·시각·인원)을 먼저 말한다(11/4: 'N번 눌러 드릴게요'만으로는 알아들었는지 모른다)
      lead = p.events.length > 0 ? planLead(p.final, lang) : "";
      if (idle && sparkSay) answer = sparkSay;
      say = idle && sparkSay ? sparkSay : [lead, planSay(p.events.length, lang, gate?.kind === "ack" ? gate : null), seatNote(p.notes, lang)].filter(Boolean).join(" ");
      // 다시 누르기가 끝나면 휴대폰이 읽을 예약 요약(날·시각·열차·인원·좌석·합계와 결제는 직접)
      if (paymentHandoff && p.events.length > 0) booked = bookingSay(p.final, lang);
    }
    // 계획은 KIBO의 조작만 담아야 한다. 사람 터치나 기기 사건이 섞이면 보내지 않는다
    if (p.kind === "plan" && p.events.some((e) => e.by !== "kibo")) return Response.json({ error: "plan_not_kibo" }, { status: 500 });
    const planOut = p.kind === "plan" ? { kind: p.kind, events: p.events, stop: p.stop, notes: p.notes } : p;
    return Response.json({ say, replyLanguage: lang, ...(followSpoken && { followSpoken }), intent, plan: planOut, gate, paymentHandoff, ...(booked && { booked }), ...(lead && { lead }), ...(answer && { answer }), timing: { sparkMs: r.ms, totalMs: Math.round(performance.now() - t0) } });
  } catch (e) {
    // 예외 원문(Spark 오류 본문 포함)은 서버 로그에만 남기고 응답은 고정 값
    logError("train interpret", e);
    return Response.json({ error: "interpret_failed" }, { status: 502 });
  }
}
