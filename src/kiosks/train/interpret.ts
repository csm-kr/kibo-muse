// 승객의 말을 기차 승차권 의도로 바꾼다 (Muse Spark 구조화 출력).
// 늦은 열차 동의는 여기서 만들지 않는다. 휴대폰 확인 버튼이나 고정 "예" 목록과 맞는 말만 동의가 된다.
// 왕복·환불·변경, 화면에 없는 할인은 KIBO가 하지 않는다(unsupported). 결제는 계획이 결제하기 앞에서 멈추므로 따로 거절하지 않는다.

import { sparkJson, type SparkOptions } from "@/engine/spark";
import type { KioskState } from "./machine";
import type { SeatPref, Stop, TrainIntent } from "./planner";
import { DAYS_AHEAD, FIRST_HOUR, LAST_HOUR, findStation, stations } from "./rail";

const NONE = "none";
const UNSUPPORTED = [NONE, "round_trip", "refund_or_change", "other_discount"] as const;

export const intentSchema = {
  type: "object",
  properties: {
    from: { type: "string", enum: [...stations.map((s) => s.id), NONE] },
    to: { type: "string", enum: [...stations.map((s) => s.id), NONE] },
    day: { type: "integer", description: "0 = today, 1 = tomorrow, … 6; -1 = not said" },
    hour: { type: "integer", description: "24-hour clock; -1 = not said" },
    minute: { type: "integer", description: "minutes past the hour if said (9:30 → 30); -1 = not said" },
    adults: { type: "integer" },
    children: { type: "integer" },
    seniors: { type: "integer" },
    childrenOnly: { type: "boolean", description: "true only when the traveler says the tickets are for children with no adult or senior travelling" },
    seatClass: { type: "string", enum: ["general", "first", NONE] },
    trainType: { type: "string", enum: ["express", "local", "any", NONE] },
    seats: { type: "string", enum: ["window", "aisle", "together", NONE] },
    unknownFrom: { type: "string", description: "a departure station the traveler named that is not in STATIONS, as said; else empty" },
    unknownTo: { type: "string", description: "a destination the traveler named that is not in STATIONS, as said; else empty" },
    unsupported: { type: "string", enum: [...UNSUPPORTED] },
    exit: { type: "boolean", description: "wants to stop or go back to the start" },
    replyLanguage: { type: "string" },
    say: { type: "string" },
  },
  required: ["from", "to", "day", "hour", "minute", "adults", "children", "seniors", "childrenOnly", "seatClass", "trainType", "seats", "unknownFrom", "unknownTo", "unsupported", "exit", "replyLanguage", "say"],
};

interface RawIntent {
  from: string;
  to: string;
  day: number;
  hour: number;
  minute?: number;
  adults: number;
  children: number;
  seniors: number;
  childrenOnly?: boolean;
  seatClass: string;
  trainType: string;
  seats: string;
  unknownFrom?: string;
  unknownTo?: string;
  unsupported?: string;
  exit?: boolean;
  replyLanguage: string;
  say: string;
}

export interface InterpretResult {
  intent: TrainIntent;
  unknownFrom: string;
  unknownTo: string;
  unsupported: string;
  exit: boolean;
  replyLanguage: string;
  say: string;
  ms: number;
  usage?: unknown;
}

const SYSTEM = `You are KIBO, the voice assistant on a train ticket machine (Bridge Rail, one-way reserved tickets). Convert the traveler's words into the JSON schema. The server validates and operates the machine; you only extract intent.

STATIONS (id | English | Korean): ${stations.map((s) => `${s.id} | ${s.name.en} | ${s.name.ko}`).join("; ")}
The machine stands at ${stations[0].name.en}; "from" is only set when the traveler names a different departure station.

RULES
- Unsaid → "none" or -1. Never guess.
- day = days from today (today 0, tomorrow 1, up to ${DAYS_AHEAD - 1}). A weekday name means its next date from today. hour = 24-hour clock ${FIRST_HOUR}–${LAST_HOUR} ("9 in the morning" = 9, "3 pm" = 15, "around 9" = 9). minute = minutes past that hour ("9:30", "half past 9", "after 9:30" → hour 9, minute 30), else -1. "Now", "right away" or "the next/earliest train" without a time → day 0 and hour = the machine clock hour.
- adults / children / seniors = the exact number said for each, even above 9. Never lower or cap it; the server refuses it and tells the traveler. Everyone travelling counts, including the speaker ("me and my mom" = adults 2 unless a senior is said). If only a total is said, put it in adults. childrenOnly = true only when the traveler says the tickets are just for the children ("yes, only the child"); otherwise false.
- seats: window = sit together, one by the window; aisle = together, one on the aisle; together = no side mentioned. If window or aisle is mentioned, never answer together.
- trainType: express = fast/high-speed train, local = slow/regular train, any = traveler says any train is fine.
- seatClass: first = first class / premium; general = standard.
- A station that is not in STATIONS goes in unknownFrom (departure) or unknownTo (destination), as said, and that from/to field stays "none".
- You cannot book round trips or refund or change tickets. refund_or_change is only for a ticket already paid or issued; correcting this booking before payment ("make that Stone Gate instead") is a normal request, so fill the new value and unsupported = "none".
- The machine sells only adult, child and senior fares. Any other fare or discount (disability, companion of a disabled traveler, student, military, …) → unsupported = "other_discount"; never book them as adults.
- If any of these is asked, set unsupported and never say you did it. Otherwise unsupported = "none".
- You never pay. If asked to pay, still fill the rest; the machine stops before payment and the traveler pays.
- exit = the traveler wants to stop or go back to the start. You cannot do that for them.
- You cannot agree to a later train on the traveler's behalf. If the machine is waiting for that confirmation, the traveler confirms on their phone.
- replyLanguage = BCP-47 code of the traveler's language.
- say describes only what is in this JSON. Never claim an action you did not encode.
- say = one short sentence in replyLanguage. Missing destination, date and time, or number of people → one question for all of them. Otherwise restate what you understood as a statement. Do not mention payment; the machine adds that.`;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const waitingText = (w: Stop | null) => (!w ? "nothing" : w.kind === "ack" ? `confirmation to take the later train ${w.trainNo} at ${w.dep}` : w.kind === "device" ? "card insertion" : "the traveler to tap Pay");

function summarize(s: KioskState, waiting: Stop | null, known: TrainIntent, now: Date) {
  const k = Object.entries(known).map(([key, v]) => `${key}=${v}`).join(", ") || "nothing";
  return `Today is ${WEEKDAYS[now.getDay()]} ${ymd(now)}. Machine clock: ${String(s.nowHour).padStart(2, "0")}:00 (today = day 0).\nMachine now: screen=${s.screen}; from=${s.from}; to=${s.to ?? "not chosen"}; waiting for: ${waitingText(waiting)}\nAlready known from earlier (do not ask again): ${k}`;
}

const count = (n: number) => (Number.isInteger(n) && n >= 0 ? n : undefined);

function toIntent(raw: RawIntent): TrainIntent {
  const out: TrainIntent = {};
  if (raw.from !== NONE && findStation(raw.from)) out.from = raw.from;
  if (raw.to !== NONE && findStation(raw.to)) out.to = raw.to;
  if (Number.isInteger(raw.day) && raw.day >= 0) out.day = raw.day;
  // 새 시를 말하면 분은 말한 값, 아니면 0(앞에서 말한 분이 남지 않게)
  if (Number.isInteger(raw.hour) && raw.hour >= 0) {
    out.hour = raw.hour;
    out.minute = Number.isInteger(raw.minute) && raw.minute! >= 0 && raw.minute! < 60 ? raw.minute : 0;
  }
  const [adults, children, seniors] = [count(raw.adults), count(raw.children), count(raw.seniors)];
  // 세 권종이 모두 0이면 Spark가 말하지 않은 인원을 0으로 낸 것이다. 앞에서 말한 인원을 지우지 않게 뺀다
  if (adults || children || seniors) {
    if (adults !== undefined) out.adults = adults;
    if (children !== undefined) out.children = children;
    if (seniors !== undefined) out.seniors = seniors;
  }
  if (raw.childrenOnly === true) out.childrenOnly = true;
  if (raw.seatClass === "general" || raw.seatClass === "first") out.seatClass = raw.seatClass;
  if (raw.trainType === "express" || raw.trainType === "local" || raw.trainType === "any") out.trainType = raw.trainType;
  if (raw.seats && raw.seats !== NONE) out.seats = raw.seats as SeatPref;
  return out;
}

export async function interpret(utterance: string, state: KioskState, waiting: Stop | null, known: TrainIntent, opts: SparkOptions = {}, now = new Date()): Promise<InterpretResult> {
  const user = `${summarize(state, waiting, known, now)}\nTraveler said: ${utterance}`;
  const r = await sparkJson<RawIntent>(SYSTEM, user, "TrainIntent", intentSchema, opts);
  const unsupported = UNSUPPORTED.includes(r.json.unsupported as (typeof UNSUPPORTED)[number]) ? r.json.unsupported! : NONE;
  return { intent: toIntent(r.json), unknownFrom: r.json.unknownFrom ?? "", unknownTo: r.json.unknownTo ?? "", unsupported, exit: r.json.exit === true, replyLanguage: r.json.replyLanguage, say: r.json.say, ms: r.ms, usage: r.usage };
}
