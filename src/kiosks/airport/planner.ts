// KIBO 화면 경로 계획 — 공항 체크인.
// 의도를 받아 지금 화면에서부터 누를 버튼 순서를 만들고, 사람이 해야 하는 관문에서 멈춘다.
// 관문: 위험물 동의(본인 확인), 여권 스캔(몸으로 하는 일), 체크인 확정(본인 확인).
// 본인 확인은 의도(Spark)로 받지 않는다. 사람이 휴대폰에서 동의하면 상태 기계에 증표가 생기고, KIBO는 그 증표로만 누른다.
// 버튼 하나를 계획할 때마다 상태 기계에 실제로 돌려 보므로, 계획이 나왔다면 실행할 수 있다.

import { AISLE, BAG_ALLOWANCE, BLOCKS, FIRST_ROW, MAX_BAGS, MAX_TRAVELERS, ROWS, WINDOW, airlines, isExit, isPaid, isTakenByOthers, parseSeat } from "./booking";
import { rowVisible, seatHolder, step, type KioskEvent, type KioskState } from "./machine";

export type SeatPref = "together" | "window" | "aisle" | "keep";

export interface AirportIntent {
  airline?: string;
  travelers?: number;
  seats?: SeatPref;
  bags?: number;
}

export type Stop =
  | { kind: "ack"; what: "dangerous_goods" }
  | { kind: "device"; what: "passport"; who: "self" | "companion" }
  | { kind: "ack"; what: "confirm_checkin"; seats: Record<string, string>; bags: Record<string, number> };

export type Missing = "airline" | "travelers" | "bags";

export type PlanResult =
  | { kind: "plan"; events: KioskEvent[]; final: KioskState; stop: Stop | null; notes: string[] }
  | { kind: "clarify"; missing: Missing[] }
  | { kind: "reject"; reason: string };

export function mergeIntent(prev: AirportIntent, next: AirportIntent): AirportIntent {
  const out: AirportIntent = { ...prev };
  for (const [k, v] of Object.entries(next)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

// 짐을 1인 허용량까지 앞 승객부터 나누고, 남는 짐은 첫 승객에게 둔다
export function splitBags(total: number, pax: string[]): Record<string, number> {
  const out = Object.fromEntries(pax.map((p) => [p, 0]));
  let left = total;
  for (const p of pax) {
    const n = Math.min(left, BAG_ALLOWANCE);
    out[p] = n;
    left -= n;
  }
  if (pax.length) out[pax[0]] += left;
  return out;
}

// 점수 배열을 앞에서부터 비교한다
function lexLess(a: number[], b: number[]) {
  const k = a.findIndex((v, i) => v !== b[i]);
  return k >= 0 && a[k] < b[k];
}

const blockOf = (letter: string) => BLOCKS.find((b) => b.includes(letter))!;

// 같은 열, 같은 블록 안에서 이어진 좌석인가
function contiguous(seats: string[]) {
  if (seats.length < 2) return true;
  const ps = seats.map(parseSeat);
  if (ps.some((p) => p.row !== ps[0].row)) return false;
  const block = blockOf(ps[0].letter);
  if (ps.some((p) => !block.includes(p.letter))) return false;
  const idx = ps.map((p) => block.indexOf(p.letter)).sort((a, b) => a - b);
  return idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
}

function fits(seats: string[], pref: SeatPref) {
  if (pref === "keep") return true;
  if (!contiguous(seats)) return false;
  const letters = seats.map((s) => parseSeat(s).letter);
  if (pref === "window") return letters.some((l) => WINDOW.includes(l));
  if (pref === "aisle") return letters.some((l) => AISLE.includes(l));
  return true;
}

// 원하는 좌석 배치를 찾는다. 이미 맞으면 지금 좌석을 그대로 돌려준다. 못 찾으면 null
export function chooseSeats(s: KioskState, pref: SeatPref): Record<string, string> | null {
  const pax = s.scanned;
  const current = Object.fromEntries(pax.map((p) => [p, s.seats[p]]));
  if (fits(Object.values(current), pref)) return current;

  // 우리 일행이 쓰거나 비어 있는 일반 좌석. 유료·비상구는 사람 확인이 필요해 고르지 않는다
  const usable = (seat: string) => {
    const holder = seatHolder(s, seat);
    if (holder) return pax.includes(holder);
    return !isTakenByOthers(seat) && !isPaid(seat) && !isExit(seat);
  };
  const anchor = parseSeat(current[pax[0]]).row;
  let best: { seats: Record<string, string>; score: number[] } | null = null;
  for (const row of ROWS) {
    for (const block of BLOCKS) {
      for (let i = 0; i + pax.length <= block.length; i++) {
        const set = block.slice(i, i + pax.length).map((l) => `${row}${l}`);
        if (!set.every(usable) || !fits(set, pref)) continue;
        // 이미 이 자리에 앉은 사람은 그대로 두고, 나머지를 순서대로 앉힌다
        const assign: Record<string, string> = {};
        const free = set.filter((seat) => !pax.some((p) => current[p] === seat));
        for (const p of pax) assign[p] = set.includes(current[p]) ? current[p] : free.shift()!;
        const moves = pax.filter((p) => assign[p] !== current[p]).length;
        const score = [moves, Math.abs(row - anchor), block.length === 2 ? 0 : 1, row];
        if (!best || lexLess(score, best.score)) best = { seats: assign, score };
      }
    }
  }
  return best?.seats ?? null;
}

class PlanError extends Error {}

export function plan(start: KioskState, intent: AirportIntent): PlanResult {
  const early = ["idle", "dangerous_goods", "lookup", "passport", "passengers", "add_passenger"].includes(start.screen);
  const missing: Missing[] = [];
  if (start.screen === "idle" && !intent.airline) missing.push("airline");
  if (early && intent.travelers === undefined) missing.push("travelers");
  if (!["printing", "complete"].includes(start.screen) && intent.bags === undefined) missing.push("bags");
  if (missing.length) return { kind: "clarify", missing };

  if (intent.airline && !airlines.some((a) => a.id === intent.airline)) return { kind: "reject", reason: "unknown_airline" };
  const travelers = intent.travelers ?? start.scanned.length;
  if (travelers < 1 || travelers > MAX_TRAVELERS) return { kind: "reject", reason: "bad_travelers" };
  const bags = intent.bags ?? 0;
  if (bags < 0 || bags > MAX_BAGS * travelers) return { kind: "reject", reason: "bad_bags" };
  const pref = intent.seats ?? "keep";

  const events: KioskEvent[] = [];
  const notes: string[] = [];
  let cur = start;
  const press = (target: KioskEvent["target"], value?: string) => {
    const e: KioskEvent = value === undefined ? { by: "kibo", target } : { by: "kibo", target, value };
    const r = step(cur, e);
    if (!r.ok) throw new PlanError(r.error);
    events.push(e);
    cur = r.state;
  };
  const done = (stop: Stop | null): PlanResult => ({ kind: "plan", events, final: cur, stop, notes });

  try {
    if (cur.popup === "excess") press("excess_ok");
    else if (cur.popup && cur.popup !== "end_adding") press("close_popup");

    let seatsDecided = false;
    for (let guard = 0; guard < 80; guard++) {
      // 「일행 추가를 종료하시겠습니까?」: 스캔한 인원이 말한 인원과 같을 때만 「네」. 모자라면 「아니오」로 일행을 더 받고, 넘치면 멈춘다
      if (cur.popup === "end_adding") {
        if (cur.scanned.length > travelers) throw new PlanError("more_travelers_scanned");
        press(cur.scanned.length === travelers ? "end_add_yes" : "end_add_no");
        continue;
      }
      switch (cur.screen) {
        case "idle":
          press("airline", intent.airline);
          break;
        case "dangerous_goods":
          if (cur.consent?.what !== "dangerous_goods") return done({ kind: "ack", what: "dangerous_goods" });
          press("accept_dangerous_goods", cur.consent.id);
          break;
        case "lookup":
          press("lookup", "passport");
          break;
        case "passport":
          return done({ kind: "device", what: "passport", who: "self" });
        case "passengers":
          if (cur.scanned.length > travelers) throw new PlanError("more_travelers_scanned");
          press(cur.scanned.length < travelers ? "add_companion" : "proceed");
          break;
        case "add_passenger":
          if (cur.scanned.length < travelers) return done({ kind: "device", what: "passport", who: "companion" });
          press("cancel_add");
          break;
        case "flight_info": {
          if (cur.scanned.length < travelers) {
            press("add_companion");
            break;
          }
          if (!seatsDecided) {
            seatsDecided = true;
            const want = chooseSeats(cur, pref);
            if (!want) notes.push("no_matching_seats");
            else if (cur.scanned.some((p) => want[p] !== cur.seats[p])) {
              press("open_seat_map");
              for (const p of cur.scanned) {
                if (cur.seatDraft![p] === want[p]) continue;
                if (cur.seatSel !== p) press("select_passenger", p);
                const i = parseSeat(want[p]).row - FIRST_ROW;
                while (!rowVisible(cur, want[p])) press(i < cur.seatOffset ? "scroll_up" : "scroll_down");
                press("seat", want[p]);
              }
              press("seat_continue");
            }
            break;
          }
          if (cur.consent?.what !== "confirm_checkin") {
            const seats = Object.fromEntries(cur.scanned.map((p) => [p, cur.seats[p]]));
            return done({ kind: "ack", what: "confirm_checkin", seats, bags: splitBags(bags, cur.scanned) });
          }
          press("confirm_checkin", cur.consent.id);
          break;
        }
        case "seat_map":
          // 사람이 좌석맵을 열어 둔 상태. 바꾸던 것은 버리고 정보 화면에서 다시 정한다
          press("seat_back");
          break;
        case "bags_question":
          press(bags === 0 ? "bags_none" : "bags_yes");
          break;
        case "bag_count": {
          const want = splitBags(bags, cur.scanned);
          for (const p of cur.scanned) if (cur.bags[p] !== want[p]) press("set_bags", `${p}:${want[p]}`);
          press("bags_continue");
          if (cur.popup === "excess") press("excess_ok");
          break;
        }
        case "printing":
        case "complete":
          return done(null);
      }
    }
    throw new PlanError("plan_too_long");
  } catch (err) {
    if (err instanceof PlanError) return { kind: "reject", reason: err.message };
    throw err;
  }
}
