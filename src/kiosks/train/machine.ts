// 기차 승차권 발매기 상태 기계 (한국 차세대 세로형, 명세 K01–K11).
// 사람의 터치, KIBO의 조작, 기기(카드 단말기·발권기)의 사건이 모두 이 함수 하나를 거친다.
// 결제하기와 결제 수단은 사람만 누를 수 있고, 카드 투입과 발권은 기기만 알릴 수 있다.

import {
  DAYS_AHEAD,
  FIRST_HOUR,
  HOME_STATION,
  LAST_HOUR,
  MAX_PASSENGERS,
  STATIONS_PER_PAGE,
  TRAINS_PER_PAGE,
  cars,
  defaultCar,
  fareFor,
  findStation,
  freeSeats,
  isSold,
  legs,
  parseSeatId,
  paxTotal,
  stations,
  trains,
  type Lang,
  type Leg,
  type Pax,
  type SeatClass,
} from "./rail";

export type Screen =
  | "idle" // K01 첫 화면
  | "journey" // K02 여정 입력 (허브)
  | "station" // K03 출/도착역 선택 (팝업)
  | "datetime" // K04 가는날·시간 (【추론】 JR T07·T08로 채움)
  | "passengers" // K05 인원 −/+
  | "train_list" // K06 열차 목록
  | "train_info" // K07 열차 정보 (팝업)
  | "seat_select" // K08 좌석 선택 (【추론】 JR T12·T13으로 채움)
  | "reservation" // K09 예약 확인 (10분 안에 결제)
  | "pay_method" // K10 결제 수단
  | "card_insert" // K11 카드 투입 (30초)
  | "printing"
  | "complete";

export type Popup = "operator" | "not_enough_seats";

export type Target =
  | "start_reserve"
  | "language"
  | "open_from"
  | "open_to"
  | "swap"
  | "open_date"
  | "open_pax"
  | "search"
  | "station"
  | "page_next"
  | "page_prev"
  | "station_done"
  | "station_cancel"
  | "day"
  | "hour"
  | "datetime_done"
  | "datetime_cancel"
  | "pax_plus"
  | "pax_minus"
  | "pax_done"
  | "pax_cancel"
  | "fare"
  | "prev_day"
  | "next_day"
  | "open_seats"
  | "reserve"
  | "info_cancel"
  | "car"
  | "seat"
  | "seats_done"
  | "seats_cancel"
  | "pay"
  | "cancel_reservation"
  | "pay_method"
  | "card_inserted"
  | "print_done"
  | "finish"
  | "back"
  | "home"
  | "operator"
  | "close_popup";

export interface KioskEvent {
  by: "touch" | "kibo" | "device";
  target: Target;
  value?: string;
}

export interface Reservation {
  trainNo: number;
  cls: SeatClass;
  seats: string[];
  total: number;
}

export interface KioskState {
  screen: Screen;
  lang: Lang;
  popup: Popup | null;
  // 발매기의 현재 시각(정시). 오늘의 지난 시각은 고를 수 없다
  nowHour: number;
  from: string;
  to: string | null;
  day: number;
  hour: number;
  pax: Pax;
  // 팝업에서 고치는 중인 값
  stationField: "from" | "to" | null;
  draftStation: string | null;
  stationPage: number;
  draftDay: number;
  draftHour: number;
  draftPax: Pax;
  listPage: number;
  pick: { trainNo: number; cls: SeatClass } | null;
  seatCar: number | null;
  seatPicks: string[];
  chosenSeats: string[] | null;
  reservation: Reservation | null;
  payMethod: string | null;
}

export type StepResult = { ok: true; state: KioskState } | { ok: false; error: string };

export function initialState(lang: Lang = "en", nowHour = 13): KioskState {
  const pax = { adult: 1, child: 0, senior: 0 };
  return {
    screen: "idle",
    lang,
    popup: null,
    nowHour,
    from: HOME_STATION,
    to: null,
    day: 0,
    hour: nowHour,
    pax,
    stationField: null,
    draftStation: null,
    stationPage: 0,
    draftDay: 0,
    draftHour: nowHour,
    draftPax: pax,
    listPage: 0,
    pick: null,
    seatCar: null,
    seatPicks: [],
    chosenSeats: null,
    reservation: null,
    payMethod: null,
  };
}

const DEVICE_ONLY: Target[] = ["card_inserted", "print_done"];
const HUMAN_ONLY: Target[] = ["pay", "pay_method"];
const GLOBAL: Target[] = ["home", "operator"];
const PAY_METHODS = ["domestic_card", "overseas_card", "zero_pay", "union_pay"];

const allowed: Record<Screen, Target[]> = {
  idle: ["start_reserve", "language"],
  journey: ["open_from", "open_to", "swap", "open_date", "open_pax", "search", "back", ...GLOBAL],
  station: ["station", "page_next", "page_prev", "station_done", "station_cancel", ...GLOBAL],
  datetime: ["day", "hour", "datetime_done", "datetime_cancel", ...GLOBAL],
  passengers: ["pax_plus", "pax_minus", "pax_done", "pax_cancel", ...GLOBAL],
  train_list: ["fare", "prev_day", "next_day", "page_next", "page_prev", "back", ...GLOBAL],
  train_info: ["open_seats", "reserve", "info_cancel", ...GLOBAL],
  seat_select: ["car", "seat", "seats_done", "seats_cancel", ...GLOBAL],
  reservation: ["pay", "cancel_reservation", ...GLOBAL],
  pay_method: ["pay_method", "back", ...GLOBAL],
  card_insert: ["card_inserted", "back", ...GLOBAL],
  printing: ["print_done"],
  complete: ["finish"],
};

const fail = (error: string): StepResult => ({ ok: false, error });
const ok = (state: KioskState): StepResult => ({ ok: true, state });

// 열차 목록에 지금 보이는 열차 (고른 시각 이후, 한 쪽 5편)
export function listed(s: KioskState): Leg[] {
  if (!s.to) return [];
  return legs(s.from, s.to)
    .filter((l) => l.dep >= s.hour * 60)
    .slice(s.listPage * TRAINS_PER_PAGE, (s.listPage + 1) * TRAINS_PER_PAGE);
}
export const allListed = (s: KioskState) => (s.to ? legs(s.from, s.to).filter((l) => l.dep >= s.hour * 60) : []);
export const trainByNo = (no: number) => trains.find((t) => t.no === no)!;
export const pickedLeg = (s: KioskState) => (s.pick && s.to ? legs(s.from, s.to).find((l) => l.train.no === s.pick!.trainNo) ?? null : null);

// 좌석을 고르지 않고 예매하면 기본 호차부터 앞줄 순으로 배정한다 【추론】
export function autoAssign(s: KioskState): string[] {
  const t = trainByNo(s.pick!.trainNo);
  const first = defaultCar(t, s.day, s.pick!.cls);
  const free = freeSeats(t, s.day, s.pick!.cls);
  const ordered = [...free.filter((x) => parseSeatId(x).car === first), ...free.filter((x) => parseSeatId(x).car !== first)];
  return ordered.slice(0, paxTotal(s.pax));
}

const PAX_KEYS = ["adult", "child", "senior"] as const;

export function step(s: KioskState, e: KioskEvent): StepResult {
  if (DEVICE_ONLY.includes(e.target) !== (e.by === "device")) return fail(e.by === "device" ? "not_a_device_event" : "device_only");
  if (HUMAN_ONLY.includes(e.target) && e.by !== "touch") return fail("payment_requires_human");
  if (s.popup && e.target !== "close_popup") return fail(`popup_open:${s.popup}`);
  if (!s.popup && !allowed[s.screen].includes(e.target)) return fail(`not_on_screen:${s.screen}`);
  const n = paxTotal(s.pax);

  switch (e.target) {
    case "start_reserve":
      return ok({ ...s, screen: "journey" });

    case "language":
      if (e.value !== "en" && e.value !== "ko") return fail("bad_language");
      return ok({ ...s, lang: e.value });

    case "open_from":
    case "open_to": {
      const field = e.target === "open_from" ? "from" : "to";
      const cur = field === "from" ? s.from : s.to;
      return ok({ ...s, screen: "station", stationField: field, draftStation: cur, stationPage: cur ? Math.floor(stations.findIndex((x) => x.id === cur) / STATIONS_PER_PAGE) : 0 });
    }

    case "swap":
      if (!s.to) return fail("no_arrival");
      return ok({ ...s, from: s.to, to: s.from });

    case "station": {
      const i = stations.findIndex((x) => x.id === e.value);
      if (i < 0) return fail("bad_station");
      if (Math.floor(i / STATIONS_PER_PAGE) !== s.stationPage) return fail("station_not_visible");
      return ok({ ...s, draftStation: e.value! });
    }

    case "page_next":
      if (s.screen === "station") return (s.stationPage + 1) * STATIONS_PER_PAGE < stations.length ? ok({ ...s, stationPage: s.stationPage + 1 }) : fail("last_page");
      return (s.listPage + 1) * TRAINS_PER_PAGE < allListed(s).length ? ok({ ...s, listPage: s.listPage + 1 }) : fail("last_page");

    case "page_prev":
      if (s.screen === "station") return s.stationPage > 0 ? ok({ ...s, stationPage: s.stationPage - 1 }) : fail("first_page");
      return s.listPage > 0 ? ok({ ...s, listPage: s.listPage - 1 }) : fail("first_page");

    case "station_done": {
      const id = s.draftStation;
      if (!id || !findStation(id)) return fail("no_station");
      const other = s.stationField === "from" ? s.to : s.from;
      if (id === other) return fail("same_station");
      return ok({ ...s, screen: "journey", [s.stationField!]: id, stationField: null, draftStation: null });
    }

    case "station_cancel":
      return ok({ ...s, screen: "journey", stationField: null, draftStation: null });

    case "open_date":
      return ok({ ...s, screen: "datetime", draftDay: s.day, draftHour: s.hour });

    case "day": {
      const d = Number(e.value);
      if (!Number.isInteger(d) || d < 0 || d >= DAYS_AHEAD) return fail("bad_day");
      return ok({ ...s, draftDay: d });
    }

    case "hour": {
      const h = Number(e.value);
      if (!Number.isInteger(h) || h < FIRST_HOUR || h > LAST_HOUR) return fail("bad_hour");
      return ok({ ...s, draftHour: h });
    }

    case "datetime_done":
      if (s.draftDay === 0 && s.draftHour < s.nowHour) return fail("past_time");
      return ok({ ...s, screen: "journey", day: s.draftDay, hour: s.draftHour });

    case "datetime_cancel":
      return ok({ ...s, screen: "journey" });

    case "open_pax":
      return ok({ ...s, screen: "passengers", draftPax: s.pax });

    case "pax_plus":
    case "pax_minus": {
      const k = PAX_KEYS.find((x) => x === e.value);
      if (!k) return fail("bad_pax_type");
      const d = e.target === "pax_plus" ? 1 : -1;
      const next = { ...s.draftPax, [k]: s.draftPax[k] + d };
      if (next[k] < 0) return fail("pax_min");
      if (paxTotal(next) > MAX_PASSENGERS) return fail("pax_max");
      return ok({ ...s, draftPax: next });
    }

    case "pax_done":
      if (paxTotal(s.draftPax) < 1) return fail("no_passengers");
      return ok({ ...s, screen: "journey", pax: s.draftPax });

    case "pax_cancel":
      return ok({ ...s, screen: "journey" });

    case "search":
      if (!s.to) return fail("no_arrival");
      return ok({ ...s, screen: "train_list", listPage: 0, pick: null, chosenSeats: null });

    case "prev_day":
      if (s.day === 0) return fail("first_day");
      return ok({ ...s, day: s.day - 1, hour: s.day - 1 === 0 ? Math.max(s.hour, s.nowHour) : s.hour, listPage: 0 });

    case "next_day":
      if (s.day >= DAYS_AHEAD - 1) return fail("last_day");
      return ok({ ...s, day: s.day + 1, listPage: 0 });

    case "fare": {
      const [no, cls] = (e.value ?? "").split(":");
      const leg = listed(s).find((l) => l.train.no === Number(no));
      if (!leg) return fail("train_not_visible");
      if (cls !== "general" && cls !== "first") return fail("bad_class");
      if (leg.fare[cls] === null) return fail("no_such_class");
      const free = freeSeats(leg.train, s.day, cls).length;
      if (free === 0) return fail("sold_out");
      // 인원만큼 자리가 없으면 안내만 한다 【추론】
      if (free < n) return ok({ ...s, popup: "not_enough_seats" });
      return ok({ ...s, screen: "train_info", pick: { trainNo: leg.train.no, cls }, chosenSeats: null });
    }

    case "info_cancel":
      return ok({ ...s, screen: "train_list", pick: null, chosenSeats: null });

    case "open_seats": {
      const t = trainByNo(s.pick!.trainNo);
      const car = s.chosenSeats ? parseSeatId(s.chosenSeats[0]).car : defaultCar(t, s.day, s.pick!.cls);
      return ok({ ...s, screen: "seat_select", seatCar: car, seatPicks: s.chosenSeats ?? [] });
    }

    case "car": {
      const t = trainByNo(s.pick!.trainNo);
      const c = cars(t).find((x) => x.car === Number(e.value));
      if (!c || c.cls !== s.pick!.cls) return fail("bad_car");
      return ok({ ...s, seatCar: c.car });
    }

    case "seat": {
      const t = trainByNo(s.pick!.trainNo);
      const seat = e.value ?? "";
      const spec = cars(t).find((c) => c.car === parseSeatId(seat).car);
      const { row, letter } = parseSeatId(seat);
      if (!spec || !(row >= 1 && row <= spec.rows) || !spec.blocks.flat().includes(letter)) return fail("bad_seat");
      if (spec.car !== s.seatCar) return fail("seat_not_in_car");
      if (isSold(t, s.day, seat)) return fail("seat_sold");
      if (s.seatPicks.includes(seat)) return ok({ ...s, seatPicks: s.seatPicks.filter((x) => x !== seat) });
      if (s.seatPicks.length >= n) return fail("too_many_seats");
      return ok({ ...s, seatPicks: [...s.seatPicks, seat] });
    }

    case "seats_done":
      if (s.seatPicks.length !== n) return fail(`pick_${n}_seats`);
      return ok({ ...s, screen: "train_info", chosenSeats: s.seatPicks, seatPicks: [], seatCar: null });

    case "seats_cancel":
      return ok({ ...s, screen: "train_info", seatPicks: [], seatCar: null });

    case "reserve": {
      const leg = pickedLeg(s)!;
      const seats = s.chosenSeats ?? autoAssign(s);
      if (seats.length < n) return fail("not_enough_seats");
      return ok({ ...s, screen: "reservation", reservation: { trainNo: leg.train.no, cls: s.pick!.cls, seats, total: fareFor(leg.fare[s.pick!.cls]!, s.pax) } });
    }

    case "pay":
      return ok({ ...s, screen: "pay_method" });

    case "cancel_reservation":
      return ok(initialState(s.lang, s.nowHour));

    case "pay_method":
      if (!PAY_METHODS.includes(e.value ?? "")) return fail("bad_pay_method");
      return ok({ ...s, screen: "card_insert", payMethod: e.value! });

    case "card_inserted":
      return ok({ ...s, screen: "printing" });

    case "print_done":
      return ok({ ...s, screen: "complete" });

    case "finish":
      return ok(initialState(s.lang, s.nowHour));

    case "back": {
      const prev: Partial<Record<Screen, Screen>> = { journey: "idle", train_list: "journey", pay_method: "reservation", card_insert: "pay_method" };
      return ok({ ...s, screen: prev[s.screen]! });
    }

    case "home":
      return ok(initialState(s.lang, s.nowHour));

    case "operator":
      return ok({ ...s, popup: "operator" });

    case "close_popup":
      return ok({ ...s, popup: null });
  }
}
