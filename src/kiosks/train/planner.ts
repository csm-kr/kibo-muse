// KIBO 화면 경로 계획 — 기차 승차권 발매기.
// 의도를 받아 지금 화면에서부터 누를 버튼 순서를 만들고, 사람이 해야 하는 관문에서 멈춘다.
// 관문: 원하는 시각보다 1시간 넘게 늦은 열차(본인 확인), 결제하기·결제 수단(사람만), 카드 투입(기기).
// 버튼 하나를 계획할 때마다 상태 기계에 실제로 돌려 보므로, 계획이 나왔다면 실행할 수 있다.

import { allListed, step, type KioskEvent, type KioskState, type Reservation } from "./machine";
import {
  AISLE,
  DAYS_AHEAD,
  FIRST_HOUR,
  LAST_HOUR,
  MAX_PASSENGERS,
  WINDOW,
  TRAINS_PER_PAGE,
  cars,
  defaultCar,
  findStation,
  freeSeats,
  hhmm,
  isSold,
  parseSeatId,
  paxTotal,
  seatId,
  stationPage,
  type Leg,
  type Pax,
  type SeatClass,
  type Train,
} from "./rail";

export type SeatPref = "window" | "aisle" | "together" | "auto";

export interface TrainIntent {
  from?: string;
  to?: string;
  day?: number; // 0 = 오늘, 1 = 내일
  hour?: number;
  // 시 안의 분(9시 반 = 30). 화면은 시만 고르고, 목록에서 이 시각 이후 열차를 고른다
  minute?: number;
  adults?: number;
  children?: number;
  seniors?: number;
  // 어른·경로 없이 어린이만 타는 표라고 사용자가 확인함
  childrenOnly?: boolean;
  seatClass?: SeatClass;
  trainType?: "express" | "local" | "any";
  seats?: SeatPref;
  // 사용자가 늦은 열차로 가겠다고 휴대폰에서 확인함. 그 열차·그날에만 묶는다(날이나 열차가 바뀌면 다시 묻는다)
  acceptLaterTrain?: { trainNo: number; day: number };
}

export type Stop =
  | { kind: "ack"; what: "later_train"; trainNo: number; dep: string }
  | { kind: "human"; what: "pay"; reservation: Reservation }
  | { kind: "device"; what: "card" };

// child_only: 어른·경로 없이 어린이만 남았다(정정 해석이 어른을 0으로 낸 것일 수 있다). 어린이만인지 묻는다
export type Missing = "to" | "date" | "passengers" | "child_only";

export type PlanResult =
  | { kind: "plan"; events: KioskEvent[]; final: KioskState; stop: Stop | null; notes: string[] }
  | { kind: "clarify"; missing: Missing[] }
  | { kind: "reject"; reason: string };

// 원하는 시각에서 이만큼 넘게 늦은 열차는 사람에게 묻는다 【추론】
const LATE_MINUTES = 60;

export function mergeIntent(prev: TrainIntent, next: TrainIntent): TrainIntent {
  const out: TrainIntent = { ...prev };
  for (const [k, v] of Object.entries(next)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

// 본인 확인은 키오스크가 바로 그 확인을 기다릴 때 한 말만 받아들인다 (먼저 안내를 듣고 동의해야 한다)
export function guardAcks(said: TrainIntent, waiting: Stop | null): TrainIntent {
  const out = { ...said };
  if (!(waiting?.kind === "ack" && waiting.what === "later_train")) delete out.acceptLaterTrain;
  return out;
}

// 점수 배열을 앞에서부터 비교한다
function lexLess(a: number[], b: number[]) {
  const k = a.findIndex((v, i) => v !== b[i]);
  return k >= 0 && a[k] < b[k];
}

// 한 줄의 좌석 글자에서 k개를 고르는 모든 조합(앞 글자부터)
function combos(letters: string[], k: number): string[][] {
  if (k === 0) return [[]];
  return letters.flatMap((l, i) => combos(letters.slice(i + 1), k - 1).map((rest) => [l, ...rest]));
}

// 같은 호차 같은 줄의 n자리 중 원하는 배치를 찾는다. 한 블록 안에 나란히가 먼저, 안 되면 통로를 건너 같은 줄(3명 이상).
// 그다음 처음 보이는 호차, 앞줄, 좁게 붙은 자리 순. 2명 이상은 좌석을 말하지 않아도 같은 줄을 찾는다
export function chooseSeats(t: Train, day: number, cls: SeatClass, n: number, pref: SeatPref): string[] | null {
  if (pref === "auto" && n < 2) return null;
  const first = defaultCar(t, day, cls);
  let best: { seats: string[]; score: number[] } | null = null;
  for (const c of cars(t).filter((x) => x.cls === cls)) {
    const row1 = c.blocks.flat();
    for (let row = 1; row <= c.rows; row++) {
      for (const letters of combos(row1, n)) {
        if (pref === "window" && !letters.some((l) => WINDOW.includes(l))) continue;
        if (pref === "aisle" && !letters.some((l) => AISLE.includes(l))) continue;
        const seats = letters.map((l) => seatId(c.car, row, l));
        if (seats.some((s) => isSold(t, day, s))) continue;
        const inBlock = c.blocks.some((b) => letters.every((l) => b.includes(l)));
        const span = row1.indexOf(letters[letters.length - 1]) - row1.indexOf(letters[0]);
        const score = [inBlock ? 0 : 1, c.car === first ? 0 : 1, c.car, row, span];
        if (!best || lexLess(score, best.score)) best = { seats, score };
      }
    }
  }
  return best?.seats ?? null;
}

interface Want {
  from: string;
  to: string;
  day: number;
  hour: number;
  minute: number;
  pax: Pax;
  cls: SeatClass;
  type: "express" | "local" | "any";
  pref: SeatPref;
}

const samePax = (a: Pax, b: Pax) => a.adult === b.adult && a.child === b.child && a.senior === b.senior;
const journeyOk = (s: KioskState, w: Want) => s.from === w.from && s.to === w.to && s.day === w.day && s.hour === w.hour && samePax(s.pax, w.pax);

// 목록에서 탈 열차: 원하는 시각(분까지) 이후, 종류·등급이 맞고 인원만큼 자리가 남은 첫 열차
function targetFor(s: KioskState, w: Want): { leg: Leg; index: number; seats: string[] | null } | null {
  const n = paxTotal(s.pax);
  const list = allListed(s);
  const index = list.findIndex((l) => l.dep >= w.hour * 60 + w.minute && (w.type === "any" || l.train.type === w.type) && l.fare[w.cls] !== null && freeSeats(l.train, s.day, w.cls).length >= n);
  if (index < 0) return null;
  const leg = list[index];
  return { leg, index, seats: chooseSeats(leg.train, s.day, w.cls, n, w.pref) };
}

class PlanError extends Error {}

export function plan(start: KioskState, intent: TrainIntent): PlanResult {
  const fresh = start.screen === "idle";
  // 한 권종이라도 1명 이상이어야 인원을 말한 것이다(모두 0은 말하지 않은 것)
  const named = [intent.adults, intent.children, intent.seniors].some((v) => (v ?? 0) > 0);
  const to = intent.to ?? start.to;
  const day = intent.day ?? (fresh ? undefined : start.day);
  const hour = intent.hour ?? (fresh ? undefined : start.hour);
  const pax = named ? { adult: intent.adults ?? 0, child: intent.children ?? 0, senior: intent.seniors ?? 0 } : fresh ? undefined : start.pax;
  const missing: Missing[] = [];
  if (!to) missing.push("to");
  if (day === undefined || hour === undefined) missing.push("date");
  if (!pax) missing.push("passengers");
  if (missing.length) return { kind: "clarify", missing };

  const w: Want = { from: intent.from ?? start.from, to: to!, day: day!, hour: hour!, minute: intent.minute ?? 0, pax: pax!, cls: intent.seatClass ?? "general", type: intent.trainType ?? "any", pref: intent.seats ?? "auto" };
  if (!findStation(w.from) || !findStation(w.to)) return { kind: "reject", reason: "unknown_station" };
  if (w.from === w.to) return { kind: "reject", reason: "same_station" };
  if (w.day < 0 || w.day >= DAYS_AHEAD) return { kind: "reject", reason: "bad_day" };
  if (w.hour < FIRST_HOUR || w.hour > LAST_HOUR) return { kind: "reject", reason: "bad_hour" };
  if (Object.values(w.pax).some((v) => v < 0) || paxTotal(w.pax) < 1 || paxTotal(w.pax) > MAX_PASSENGERS) return { kind: "reject", reason: "bad_passengers" };
  if (w.pax.adult === 0 && w.pax.senior === 0 && !intent.childrenOnly) return { kind: "clarify", missing: ["child_only"] };

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
  const target = () => {
    const t = targetFor(cur, w);
    if (!t) throw new PlanError("no_trains_available");
    return t;
  };
  const isPick = (leg: Leg) => cur.pick?.trainNo === leg.train.no && cur.pick.cls === w.cls;

  try {
    if (cur.popup) press("close_popup");

    for (let guard = 0; guard < 120; guard++) {
      switch (cur.screen) {
        case "idle":
          press("start_reserve");
          break;

        case "journey":
          if (cur.from === w.to && cur.to === w.from) press("swap");
          // 출발역을 지금 도착역으로 바꾸려면 도착역부터 바꿔야 한다
          else if (cur.from !== w.from) press(w.from === cur.to ? "open_to" : "open_from");
          else if (cur.to !== w.to) press("open_to");
          else if (cur.day !== w.day || cur.hour !== w.hour) press("open_date");
          else if (!samePax(cur.pax, w.pax)) press("open_pax");
          else press("search");
          break;

        case "station": {
          const id = cur.stationField === "from" ? w.from : w.to;
          if (cur.draftStation !== id) {
            while (cur.stationPage !== stationPage(id)) press(cur.stationPage < stationPage(id) ? "page_next" : "page_prev");
            press("station", id);
          }
          press("station_done");
          break;
        }

        case "datetime":
          if (cur.draftDay !== w.day) press("day", String(w.day));
          if (cur.draftHour !== w.hour) press("hour", String(w.hour));
          press("datetime_done");
          break;

        case "passengers": {
          const keys = ["adult", "child", "senior"] as const;
          // 9명 상한에 걸리지 않게 줄이는 것부터 한다
          for (const k of keys) while (cur.draftPax[k] > w.pax[k]) press("pax_minus", k);
          for (const k of keys) while (cur.draftPax[k] < w.pax[k]) press("pax_plus", k);
          press("pax_done");
          break;
        }

        case "train_list": {
          if (!journeyOk(cur, w)) {
            press("back");
            break;
          }
          const t = target();
          const agreed = intent.acceptLaterTrain?.trainNo === t.leg.train.no && intent.acceptLaterTrain.day === w.day;
          if (t.leg.dep > w.hour * 60 + w.minute + LATE_MINUTES && !agreed) return done({ kind: "ack", what: "later_train", trainNo: t.leg.train.no, dep: hhmm(t.leg.dep) });
          const page = Math.floor(t.index / TRAINS_PER_PAGE);
          while (cur.listPage !== page) press(cur.listPage < page ? "page_next" : "page_prev");
          press("fare", `${t.leg.train.no}:${w.cls}`);
          break;
        }

        case "train_info": {
          if (!journeyOk(cur, w) || !isPick(target().leg)) {
            press("info_cancel");
            break;
          }
          const { seats } = target();
          if (!seats && (w.pref !== "auto" || paxTotal(w.pax) >= 2) && !notes.includes("no_matching_seats")) notes.push("no_matching_seats");
          const chosen = cur.chosenSeats;
          if (!seats || (chosen && chosen.length === seats.length && seats.every((x) => chosen.includes(x)))) press("reserve");
          else press("open_seats");
          break;
        }

        case "seat_select": {
          const seats = journeyOk(cur, w) && isPick(target().leg) ? target().seats : null;
          if (!seats) {
            press("seats_cancel");
            break;
          }
          // 사람이 이미 고른 다른 자리는 다시 눌러 풀고, 원하는 자리를 고른다. 다른 호차의 자리는 호차를 바꿔야 누를 수 있다
          const tapSeat = (x: string) => {
            const car = parseSeatId(x).car;
            if (cur.seatCar !== car) press("car", String(car));
            press("seat", x);
          };
          for (const x of cur.seatPicks.filter((p) => !seats.includes(p))) tapSeat(x);
          for (const x of seats.filter((p) => !cur.seatPicks.includes(p))) tapSeat(x);
          press("seats_done");
          break;
        }

        case "reservation":
          // 사람이 다른 여정으로 예약해 둔 것이면 결제 전이니 취소하고 처음부터 한다
          if (!journeyOk(cur, w)) {
            press("cancel_reservation");
            break;
          }
          return done({ kind: "human", what: "pay", reservation: cur.reservation! });

        case "pay_method":
          return done({ kind: "human", what: "pay", reservation: cur.reservation! });

        case "card_insert":
          return done({ kind: "device", what: "card" });

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
