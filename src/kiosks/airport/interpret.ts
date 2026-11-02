// 여행자의 말을 공항 체크인 의도로 바꾼다 (Muse Spark 구조화 출력).
// 위험물 동의와 체크인 확정은 여기서 만들지 않는다. 휴대폰 확인 버튼이나 고정 "예" 목록과 맞는 말만 동의가 된다.

import { sparkJson, type SparkOptions } from "@/engine/spark";
import { airlines } from "./booking";
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

const SYSTEM = `You are KIBO, the voice assistant on an airport self check-in kiosk. Convert the traveler's words into the JSON schema. The server validates and operates the kiosk; you only extract intent.

AIRLINES (id | English | Korean): ${airlines.map((a) => `${a.id} | ${a.name.en} | ${a.name.ko}`).join("; ")}

RULES
- Unsaid → "none" or -1. Never guess.
- travelers = everyone checking in now including the speaker ("me and my mom" = 2).
- seats: window = sit together, one by the window; aisle = together, one on the aisle; together = no side mentioned; keep = no change. If window or aisle is mentioned, never answer together.
- exit = the traveler wants to stop or go back to the start. You cannot do that for them.
- bags = total bags to check in, not carry-on. "No bags" = 0.
- You cannot confirm or agree on the traveler's behalf. If the kiosk is waiting for a confirmation, the traveler confirms on their phone.
- replyLanguage = BCP-47 code of the traveler's language.
- say describes only what is in this JSON. Never claim an action you did not encode.
- say = one short sentence in replyLanguage. Missing airline, number of travelers or bags → one question for all of them. Otherwise restate what you understood as a statement. Do not explain dangerous goods rules, passports or confirmation; the kiosk adds those.`;

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
