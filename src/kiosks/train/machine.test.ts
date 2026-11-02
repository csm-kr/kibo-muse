import { describe, expect, it } from "vitest";
import { initialState, step, type KioskEvent, type KioskState } from "./machine";

const tap = (target: KioskEvent["target"], value?: string): KioskEvent => (value === undefined ? { by: "touch", target } : { by: "touch", target, value });

function replay(events: KioskEvent[], start: KioskState = initialState()) {
  let state = start;
  const screens = [state.screen];
  for (const e of events) {
    const r = step(state, e);
    if (!r.ok) throw new Error(`${e.target}(${e.value ?? ""}) 실패: ${r.error}`);
    state = r.state;
    if (screens[screens.length - 1] !== state.screen) screens.push(state.screen);
  }
  return { state, screens };
}

// 대표 과업: 내일 9시쯤 브리지중앙 → 등대항 고속열차, 어른 2명, 창가 쪽 나란히 (명세 3-6, 한국 차세대 세로형)
const touchTask: KioskEvent[] = [
  tap("start_reserve"),
  tap("open_to"),
  tap("station", "harbor"),
  tap("station_done"),
  tap("open_date"),
  tap("day", "1"),
  tap("hour", "9"),
  tap("datetime_done"),
  tap("open_pax"),
  tap("pax_plus", "adult"),
  tap("pax_done"),
  tap("search"),
  tap("fare", "113:general"),
  tap("open_seats"),
  tap("seat", "7-1A"),
  tap("seat", "7-1B"),
  tap("seats_done"),
  tap("reserve"),
  tap("pay"),
  tap("pay_method", "domestic_card"),
];

describe("기차 승차권 발매기 — 실제 화면 흐름", () => {
  it("터치로 대표 과업을 하면 명세의 화면 15번을 거쳐 카드 투입 화면에 닿고, 탭은 20회다", () => {
    expect(touchTask).toHaveLength(20);
    const { state, screens } = replay(touchTask);
    expect(screens).toEqual([
      "idle",
      "journey",
      "station",
      "journey",
      "datetime",
      "journey",
      "passengers",
      "journey",
      "train_list",
      "train_info",
      "seat_select",
      "train_info",
      "reservation",
      "pay_method",
      "card_insert",
    ]);
    expect(state.reservation).toEqual({ trainNo: 113, cls: "general", seats: ["7-1A", "7-1B"], total: 105600 });

    // 카드를 넣고 발권하는 것은 기기가 알린다
    const done = replay([{ by: "device", target: "card_inserted" }, { by: "device", target: "print_done" }], state).state;
    expect(done.screen).toBe("complete");
  });

  it("결제하기와 결제 수단은 사람만 누를 수 있고, 카드 투입·발권은 기기만 알릴 수 있다", () => {
    const atReservation = replay(touchTask.slice(0, 18)).state;
    expect(atReservation.screen).toBe("reservation");
    expect(step(atReservation, { by: "kibo", target: "pay" })).toEqual({ ok: false, error: "payment_requires_human" });
    const atMethod = replay([tap("pay")], atReservation).state;
    expect(step(atMethod, { by: "kibo", target: "pay_method", value: "domestic_card" })).toEqual({ ok: false, error: "payment_requires_human" });
    const atCard = replay([tap("pay_method", "domestic_card")], atMethod).state;
    expect(step(atCard, { by: "touch", target: "card_inserted" })).toEqual({ ok: false, error: "device_only" });
    expect(step(atCard, { by: "kibo", target: "card_inserted" })).toEqual({ ok: false, error: "device_only" });
  });

  it("좌석 선택: 팔린 좌석은 고를 수 없고, 인원만큼 골라야 완료되며, 다시 누르면 선택이 풀린다", () => {
    const atSeats = replay(touchTask.slice(0, 14)).state;
    expect(atSeats.screen).toBe("seat_select");
    expect(atSeats.seatCar).toBe(7);
    expect(step(atSeats, tap("seat", "7-1C"))).toEqual({ ok: false, error: "seat_sold" });
    expect(step(atSeats, tap("seat", "5-1A"))).toEqual({ ok: false, error: "seat_not_in_car" });
    const one = replay([tap("seat", "7-1A")], atSeats).state;
    expect(step(one, tap("seats_done"))).toEqual({ ok: false, error: "pick_2_seats" });
    expect(replay([tap("seat", "7-1A")], one).state.seatPicks).toEqual([]);
  });

  it("역 격자는 한 쪽에 9개씩이고, 다음 쪽의 역은 넘겨야 누를 수 있다. 오늘 지난 시각은 고를 수 없다", () => {
    const atStations = replay([tap("start_reserve"), tap("open_to")]).state;
    expect(step(atStations, tap("station", "pinecoast"))).toEqual({ ok: false, error: "station_not_visible" });
    expect(replay([tap("page_next"), tap("station", "pinecoast"), tap("station_done")], atStations).state.to).toBe("pinecoast");

    const atDate = replay([tap("start_reserve"), tap("open_date")]).state;
    expect(step(replay([tap("hour", "9")], atDate).state, tap("datetime_done"))).toEqual({ ok: false, error: "past_time" });
  });

  it("처음으로는 어느 화면에서든 입력을 버리고 첫 화면으로 간다", () => {
    const mid = replay(touchTask.slice(0, 13)).state;
    expect(replay([tap("home")], mid).state).toEqual(initialState());
  });
});
