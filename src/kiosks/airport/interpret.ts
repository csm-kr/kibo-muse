// 여행자의 말을 공항 체크인 의도로 바꾼다 (Muse Spark 구조화 출력).
// 위험물 동의와 체크인 확정은 여기서 만들지 않는다. 휴대폰 확인 버튼이나 고정 "예" 목록과 맞는 말만 동의가 된다.

import { sparkJson, type SparkOptions } from "@/engine/spark";
import { airlines, BAG_ALLOWANCE, booking, EXCESS_FEE, MAX_BAGS } from "./booking";
import { powerBankText } from "./gates";
import { t, won } from "./ui/strings";
import type { KioskState } from "./machine";
import type { AirportIntent, SeatPref, Stop } from "./planner";

const NONE = "none";

export const intentSchema = {
  type: "object",
  properties: {
    airline: { type: "string", enum: [...airlines.map((a) => a.id), NONE] },
    travelers: { type: "integer" },
    seats: { type: "string", enum: ["together", "window", "aisle", "keep", NONE] },
    bags: { type: "integer" },
    exit: { type: "boolean", description: "wants to stop or go back to the start" },
    replyLanguage: { type: "string" },
    say: { type: "string" },
  },
  required: ["airline", "travelers", "seats", "bags", "exit", "replyLanguage", "say"],
};

interface RawIntent {
  airline: string;
  travelers: number;
  seats: string;
  bags: number;
  exit?: boolean;
  replyLanguage: string;
  say: string;
}

export interface InterpretResult {
  intent: AirportIntent;
  // 그만하고 처음으로 가고 싶다. KIBO는 나가기를 하지 않는다(서버가 거절하고 고정 문구로 답한다)
  exit: boolean;
  replyLanguage: string;
  say: string;
  ms: number;
  usage?: unknown;
}

// 질문에 답할 사실(11/4 판정: 출발 시각·탑승구·짐·보조배터리 질문에 '항공사·인원·짐을 알려 주세요'만). 화면·규정 문구와 같은 데이터에서 만든다
const f = booking.flight;
const FACTS = [
  `Flight on this kiosk's booking: ${airlines.find((a) => a.id === booking.airline)!.name.en} ${f.no}, ${f.from.city.en} ${f.from.code} → ${f.to.city.en} ${f.to.code}, ${f.date}. Departs ${f.dep}, arrives ${f.arr}. Boarding from ${f.boarding} at gate ${f.gate}.`,
  `Seats: assigned at booking (${Object.values(booking.seats).join(" and ")}, not together). After the passports are scanned KIBO can move them to sit together, by the window or the aisle.`,
  `Passport: ${t.scanStep1.en} The booking is found by passport scan only.`,
  `Checked bags: ${BAG_ALLOWANCE} free bag per person, up to ${MAX_BAGS} per person. Excess bag fee: ${won(EXCESS_FEE)} per bag over the allowance, paid at the baggage counter. ${t.excessText.en} ${t.bagNotice.en} KIBO cannot pay any fee.`,
  powerBankText("en"),
  `${t.paidSeat.en} ${t.exitRow.en} Upgrades: ask at the counter.`,
].join("\n");

const SYSTEM = `You are KIBO, the voice assistant on an airport self check-in kiosk. Convert the traveler's words into the JSON schema. The server validates and operates the kiosk; you only extract intent.

AIRLINES (id | English | Korean): ${airlines.map((a) => `${a.id} | ${a.name.en} | ${a.name.ko}`).join("; ")}

FACTS
${FACTS}

RULES
- Unsaid → "none" or -1. Never guess.
- travelers = everyone checking in now including the speaker ("me and my mom" = 2).
- seats: window = sit together, one by the window; aisle = together, one on the aisle; together = no side mentioned; keep = no change. If window or aisle is mentioned, never answer together.
- exit = the traveler wants to stop or go back to the start. You cannot do that for them.
- bags = total bags to check in, not carry-on. "No bags" = 0.
- You cannot confirm or agree on the traveler's behalf. If the kiosk is waiting for a confirmation, the traveler confirms on their phone.
- replyLanguage = BCP-47 code of the traveler's language.
- say describes only what is in this JSON. Never claim an action you did not encode.
- say = one or two short, warm sentences in replyLanguage. If replyLanguage is not Korean, write no Korean (Hangul) at all: use the English names from AIRLINES.
- Questions (flight time, gate, boarding, seats, bags, power banks, passport, fees, paid or exit-row seats): answer from FACTS first, then ask for what is still missing. If it is not in FACTS (restroom, wifi, shops, money exchange), say you don't know and suggest the information desk or staff, then invite them to check in.
- An airline not in AIRLINES: say this kiosk checks in only Bridge Air, Haneul Sky, Nova Wings and Seabird Air, and suggest the airline's counter.
- Use airline and city names from AIRLINES in replyLanguage (Korean: 브리지항공, 하늘스카이, 노바윙스, 시버드항공).
- Say the flight date as a spoken date (Korean "11월 5일", English "November 5"), never as digits with dots; never "today" or "tomorrow".
- Asking for help or first time: say they can just tell you the airline, how many people and how many bags.
- A different destination or flight (Osaka, another date or flight number): say this kiosk's booking is the flight in FACTS and suggest the airline counter.
- Never ask for passports or tell them to scan on your own; the kiosk asks for that itself at the right time. If they ask how or where to scan, answer from FACTS (Passport).
- Count travelers from how they describe the group: "딸이랑 같이" or "with my wife" = 2 (the speaker plus them). Never ask again for something they already said.
- If the kiosk is on screen=complete (check-in done) and they want more bags or changes: say check-in is complete and extra bags are handled at the baggage counter. Leave every field "none"; do not start a new check-in.
- Missing airline, number of travelers or bags → one short question for all of them. Otherwise restate what you understood as a statement. Do not explain dangerous goods rules or confirmation; the kiosk adds those.
- Asked to pay a fee: say plainly you can't pay; fees are paid at the baggage counter.`;

const waitingText = (w: Stop | null) =>
  !w ? "nothing" : w.kind === "device" ? "passport scan" : w.what === "dangerous_goods" ? "dangerous goods confirmation" : `check-in confirmation (seats ${Object.values(w.seats).join(", ")})`;

function summarize(s: KioskState, waiting: Stop | null, known: AirportIntent) {
  const k = Object.entries(known).map(([key, v]) => `${key}=${v}`).join(", ") || "nothing";
  return `Kiosk now: screen=${s.screen}; airline=${s.airline ?? "not chosen"}; passports scanned=${s.scanned.length}; waiting for: ${waitingText(waiting)}\nAlready known from earlier (do not ask again): ${k}`;
}

function toIntent(raw: RawIntent): AirportIntent {
  const out: AirportIntent = {};
  if (raw.airline && raw.airline !== NONE) out.airline = raw.airline;
  if (Number.isInteger(raw.travelers) && raw.travelers > 0) out.travelers = raw.travelers;
  if (raw.seats && raw.seats !== NONE) out.seats = raw.seats as SeatPref;
  if (Number.isInteger(raw.bags) && raw.bags >= 0) out.bags = raw.bags;
  return out;
}

export async function interpret(utterance: string, state: KioskState, waiting: Stop | null, known: AirportIntent, opts: SparkOptions = {}): Promise<InterpretResult> {
  const user = `${summarize(state, waiting, known)}\nTraveler said: ${utterance}`;
  const r = await sparkJson<RawIntent>(SYSTEM, user, "AirportIntent", intentSchema, opts);
  return { intent: toIntent(r.json), exit: r.json.exit === true, replyLanguage: r.json.replyLanguage, say: r.json.say, ms: r.ms, usage: r.usage };
}
