// 공항 셀프 체크인 키오스크 상태 기계.
// 사람의 터치, KIBO의 조작, 기기(여권 리더기·프린터)의 사건이 모두 이 함수 하나를 거친다.
// 여권 스캔과 발급 완료는 기기만 알릴 수 있다. KIBO는 사람 대신 여권을 넣을 수 없다.

import {
  BAG_ALLOWANCE,
  FIRST_ROW,
  MAX_BAGS,
  MAX_OFFSET,
  MAX_TRAVELERS,
  SCROLL_ROWS,
  VISIBLE_ROWS,
  airlines,
  booking,
  findPassenger,
  isExit,
  isPaid,
  isRealSeat,
  isTakenByOthers,
  parseSeat,
  type Lang,
} from "./booking";

export type Screen =
  | "idle" // S01 항공사 선택 (대기 화면)
  | "dangerous_goods" // S02 항공기 반입 금지 위험물 안내 (+ 보조배터리 카드)
  | "lookup" // S02b 조회 방법 선택: 여권 / 예약번호 / QR·바코드 / 전자항공권 번호 (근거: 인천공항 시니어 안내 영상 프레임)
  | "passport" // S03 여권 스캔
  | "passengers" // S04 체크인할 승객
  | "add_passenger" // S05 승객 추가
  | "flight_info" // S06 승객 리스트와 항공편 상세 정보
  | "seat_map" // S07 좌석 변경
  | "bags_question" // S08 수하물 여부
  | "bag_count" // S09 수하물 개수
  | "printing" // S10 발급 중
  | "complete"; // S11 체크인 완료

// end_adding: 「일행 추가를 종료하시겠습니까? [아니오(일행추가)] [네(좌석선택)]」 (근거: 에어서울 키오스크 프레임)
export type Popup = "exit_confirm" | "help" | "allowance" | "paid_seat" | "exit_row" | "excess" | "mileage" | "end_adding";
// passport_only: 이 시연은 여권 조회만 된다【추론】
export type Banner = "no_booking" | "already_added" | "seat_changed" | "passport_only";

export const LOOKUPS = ["passport", "booking_ref", "qr", "eticket"] as const;

export type Target =
  | "airline"
  | "language"
  | "accept_dangerous_goods"
  | "lookup"
  | "scan_passport"
  | "add_companion"
  | "cancel_add"
  | "proceed"
  | "end_add_no"
  | "end_add_yes"
  | "open_seat_map"
  | "mileage"
  | "select_passenger"
  | "seat"
  | "scroll_up"
  | "scroll_down"
  | "seat_back"
  | "seat_continue"
  | "confirm_checkin"
  | "bags_none"
  | "bags_yes"
  | "set_bags"
  | "show_allowance"
  | "bags_continue"
  | "excess_ok"
  | "print_done"
  | "finish"
  | "exit"
  | "exit_yes"
  | "help"
  | "close_popup"
  // 휴대폰에서 사람이 한 동의(확인 버튼, 또는 고정 "예" 목록과 맞는 말). KIBO의 동의·확정에 쓰는 증표를 만든다
  | "consent";

export interface KioskEvent {
  by: "touch" | "kibo" | "device" | "phone";
  target: Target;
  value?: string;
}

export interface KioskState {
  screen: Screen;
  lang: Lang;
  popup: Popup | null;
  banner: Banner | null;
  airline: string | null;
  // 체크인할 승객. 여권을 넣은 순서 (①, ②…)
  scanned: string[];
  // 일행 추가 화면이 끝나면 돌아갈 화면
  addReturn: "passengers" | "flight_info";
  seats: Record<string, string>;
  // 좌석맵에서 바꾸는 중인 좌석. 「계속」을 눌러야 seats에 반영된다
  seatDraft: Record<string, string> | null;
  seatSel: string | null;
  // 좌석맵 맨 위에 보이는 열의 순번 (0 = 31열)
  seatOffset: number;
  checkedIn: boolean;
  bags: Record<string, number>;
  // 휴대폰에서 받은 동의 증표. KIBO는 이 id를 값으로 보내야 위험물 동의·체크인 확정을 누를 수 있다. 화면이 바뀌면 사라진다
  consent: { what: "dangerous_goods" | "confirm_checkin"; id: string } | null;
  consentSeq: number;
}

export type StepResult = { ok: true; state: KioskState } | { ok: false; error: string };

export function initialState(lang: Lang = "en"): KioskState {
  return {
    screen: "idle",
    lang,
    popup: null,
    banner: null,
    airline: null,
    scanned: [],
    addReturn: "passengers",
    seats: { ...booking.seats },
    seatDraft: null,
    seatSel: null,
    seatOffset: 0,
    checkedIn: false,
    bags: {},
    consent: null,
    consentSeq: 0,
  };
}

const DEVICE_ONLY: Target[] = ["scan_passport", "print_done"];
const GLOBAL: Target[] = ["language", "exit", "help"];

// 화면마다 누를 수 있는 버튼. 지금 화면에 없는 버튼은 누를 수 없다
const allowed: Record<Screen, Target[]> = {
  idle: ["airline", "language"],
  dangerous_goods: ["accept_dangerous_goods", "consent", ...GLOBAL],
  lookup: ["lookup", ...GLOBAL],
  passport: ["scan_passport", ...GLOBAL],
  passengers: ["add_companion", "proceed", ...GLOBAL],
  add_passenger: ["scan_passport", "cancel_add", ...GLOBAL],
  flight_info: ["add_companion", "open_seat_map", "mileage", "confirm_checkin", "consent", ...GLOBAL],
  seat_map: ["select_passenger", "seat", "scroll_up", "scroll_down", "seat_back", "seat_continue", ...GLOBAL],
  bags_question: ["bags_none", "bags_yes", ...GLOBAL],
  bag_count: ["set_bags", "show_allowance", "bags_continue", ...GLOBAL],
  printing: ["print_done"],
  complete: ["finish", "language"],
};

const popupTargets: Record<Popup, Target[]> = {
  exit_confirm: ["exit_yes", "close_popup"],
  help: ["close_popup"],
  allowance: ["close_popup"],
  paid_seat: ["close_popup"],
  exit_row: ["close_popup"],
  excess: ["excess_ok"],
  mileage: ["close_popup"],
  end_adding: ["end_add_no", "end_add_yes"],
};

const fail = (error: string): StepResult => ({ ok: false, error });
const ok = (state: KioskState): StepResult => ({ ok: true, state });

export const offsetFor = (seat: string) => Math.min(Math.max(parseSeat(seat).row - FIRST_ROW - 3, 0), MAX_OFFSET);
export const rowVisible = (s: KioskState, seat: string) => {
  const i = parseSeat(seat).row - FIRST_ROW;
  return i >= s.seatOffset && i < s.seatOffset + VISIBLE_ROWS;
};

// 이 승객 말고 다른 사람이 쓰는 좌석인가 (예약은 같아도 이번에 체크인하지 않는 승객 포함)
export function seatHolder(s: KioskState, seat: string): string | null {
  const seats = { ...s.seats, ...(s.seatDraft ?? {}) };
  return Object.keys(seats).find((p) => seats[p] === seat) ?? null;
}

export function step(s: KioskState, e: KioskEvent): StepResult {
  const r = inner(s, e);
  if (r.ok && r.state.screen !== s.screen && r.state.consent) return ok({ ...r.state, consent: null });
  return r;
}

// KIBO가 사람 대신 동의·확정하려면 지금 화면의 증표가 필요하다. 사람이 키오스크를 직접 누르는 것은 그 자체로 동의다
const consented = (s: KioskState, e: KioskEvent, what: "dangerous_goods" | "confirm_checkin") => e.by !== "kibo" || (s.consent?.what === what && e.value === s.consent.id);

function inner(s: KioskState, e: KioskEvent): StepResult {
  if (DEVICE_ONLY.includes(e.target) !== (e.by === "device")) return fail(e.by === "device" ? "not_a_device_event" : "device_only");
  if ((e.target === "consent") !== (e.by === "phone")) return fail(e.by === "phone" ? "not_a_phone_event" : "phone_only");
  if (s.popup && !popupTargets[s.popup].includes(e.target)) return fail(`popup_open:${s.popup}`);
  if (!s.popup && !allowed[s.screen].includes(e.target)) return fail(`not_on_screen:${s.screen}`);

  switch (e.target) {
    case "airline":
      if (!airlines.some((a) => a.id === e.value)) return fail("bad_airline");
      return ok({ ...s, airline: e.value!, screen: "dangerous_goods" });

    case "language":
      if (e.value !== "en" && e.value !== "ko") return fail("bad_language");
      return ok({ ...s, lang: e.value });

    case "consent": {
      const what = s.screen === "dangerous_goods" ? "dangerous_goods" : "confirm_checkin";
      if (e.value !== what) return fail("bad_consent");
      return ok({ ...s, consent: { what, id: `${what}#${s.consentSeq + 1}` }, consentSeq: s.consentSeq + 1 });
    }

    case "accept_dangerous_goods":
      if (!consented(s, e, "dangerous_goods")) return fail("consent_required");
      return ok({ ...s, screen: "lookup" });

    case "lookup":
      if (!LOOKUPS.includes(e.value as (typeof LOOKUPS)[number])) return fail("bad_lookup");
      if (e.value !== "passport") return ok({ ...s, banner: "passport_only" });
      return ok({ ...s, screen: "passport", banner: null });

    case "scan_passport": {
      const p = e.value ? findPassenger(e.value) : undefined;
      // 이 항공사에 예약이 없는 여권 (다른 항공사를 골랐을 때 포함)
      if (!p || s.airline !== booking.airline) return ok({ ...s, banner: "no_booking" });
      if (s.scanned.includes(p.id)) return ok({ ...s, banner: "already_added" });
      if (s.scanned.length >= MAX_TRAVELERS) return fail("too_many_travelers");
      const next = s.screen === "passport" ? "passengers" : s.addReturn;
      return ok({ ...s, scanned: [...s.scanned, p.id], screen: next, banner: null });
    }

    case "add_companion":
      return ok({ ...s, screen: "add_passenger", addReturn: s.screen === "flight_info" ? "flight_info" : "passengers", banner: null });

    case "cancel_add":
      return ok({ ...s, screen: s.addReturn, banner: null });

    // 승객 화면의 다음: 일행을 더 넣을지 먼저 묻는다
    case "proceed":
      return ok({ ...s, popup: "end_adding", banner: null });

    case "end_add_no":
      return ok({ ...s, popup: null, screen: "add_passenger", addReturn: "passengers" });

    case "end_add_yes":
      return ok({ ...s, popup: null, screen: "flight_info" });

    case "open_seat_map": {
      const first = s.scanned[0];
      const draft = Object.fromEntries(s.scanned.map((p) => [p, s.seats[p]]));
      return ok({ ...s, screen: "seat_map", seatDraft: draft, seatSel: first, seatOffset: offsetFor(s.seats[first]), banner: null });
    }

    case "mileage":
      return ok({ ...s, popup: "mileage" });

    case "select_passenger":
      if (!e.value || !s.scanned.includes(e.value)) return fail("bad_passenger");
      return ok({ ...s, seatSel: e.value });

    case "seat": {
      const seat = e.value ?? "";
      if (!isRealSeat(seat)) return fail("bad_seat");
      if (!rowVisible(s, seat)) return fail("row_not_visible");
      const draft = s.seatDraft!;
      const sel = s.seatSel!;
      const holder = seatHolder(s, seat);
      if (holder === sel) return ok(s);
      if (holder && !s.scanned.includes(holder)) return fail("seat_taken");
      if (!holder && isTakenByOthers(seat)) return fail("seat_taken");
      if (!holder && isPaid(seat)) return ok({ ...s, popup: "paid_seat" });
      if (!holder && isExit(seat)) return ok({ ...s, popup: "exit_row" });
      // 일행이 앉은 좌석이면 맞바꾼다
      const next = { ...draft, [sel]: seat };
      if (holder) next[holder] = draft[sel];
      return ok({ ...s, seatDraft: next });
    }

    case "scroll_up":
      return ok({ ...s, seatOffset: Math.max(s.seatOffset - SCROLL_ROWS, 0) });

    case "scroll_down":
      return ok({ ...s, seatOffset: Math.min(s.seatOffset + SCROLL_ROWS, MAX_OFFSET) });

    case "seat_back":
      return ok({ ...s, screen: "flight_info", seatDraft: null, seatSel: null });

    case "seat_continue": {
      const draft = s.seatDraft!;
      const changed = Object.keys(draft).some((p) => draft[p] !== s.seats[p]);
      return ok({ ...s, screen: "flight_info", seats: { ...s.seats, ...draft }, seatDraft: null, seatSel: null, banner: changed ? "seat_changed" : null });
    }

    case "confirm_checkin":
      if (!consented(s, e, "confirm_checkin")) return fail("consent_required");
      return ok({ ...s, screen: "bags_question", checkedIn: true, banner: null });

    case "bags_none":
      return ok({ ...s, bags: Object.fromEntries(s.scanned.map((p) => [p, 0])), screen: "printing" });

    case "bags_yes":
      return ok({ ...s, bags: Object.fromEntries(s.scanned.map((p) => [p, 0])), screen: "bag_count" });

    case "set_bags": {
      const [p, n] = (e.value ?? "").split(":");
      const count = Number(n);
      if (!s.scanned.includes(p) || !Number.isInteger(count) || count < 0 || count > MAX_BAGS) return fail("bad_bags");
      return ok({ ...s, bags: { ...s.bags, [p]: count } });
    }

    case "show_allowance":
      return ok({ ...s, popup: "allowance" });

    case "bags_continue":
      if (Object.values(s.bags).some((n) => n > BAG_ALLOWANCE)) return ok({ ...s, popup: "excess" });
      return ok({ ...s, screen: "printing" });

    case "excess_ok":
      return ok({ ...s, popup: null, screen: "printing" });

    case "print_done":
      return ok({ ...s, screen: "complete" });

    case "finish":
      return ok(initialState(s.lang));

    case "exit":
      return ok({ ...s, popup: "exit_confirm" });

    case "exit_yes":
      return ok(initialState(s.lang));

    case "help":
      return ok({ ...s, popup: "help" });

    case "close_popup":
      return ok({ ...s, popup: null });
  }
}
