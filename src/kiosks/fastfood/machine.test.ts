import { describe, expect, it } from "vitest";
import { initialState, step, type KioskEvent, type KioskState } from "./machine";

// 사람이 터치로 누르는 이벤트
const tap = (target: KioskEvent["target"], value?: string): KioskEvent => ({ by: "touch", target, value });

function replay(events: KioskEvent[]): { state: KioskState; screens: string[] } {
  let state = initialState();
  const screens = [state.screen];
  for (const e of events) {
    const r = step(state, e);
    if (!r.ok) throw new Error(`${e.target}(${e.value ?? ""}) 실패: ${r.error}`);
    state = r.state;
    if (screens[screens.length - 1] !== state.screen) screens.push(state.screen);
  }
  return { state, screens };
}

// 대표 주문 (a): 더블치즈버거 라지 세트, 음료는 제로콜라, 피클 빼고, 매장 식사
const touchOrderA: KioskEvent[] = [
  tap("start"),
  tap("order_type", "eat_in"),
  tap("category", "burgers"),
  tap("item", "double_cheese"),
  tap("set_choice", "set"),
  tap("size", "L"),
  tap("side", "fries"),
  tap("drink", "zero_cola"),
  tap("customize"),
  tap("toggle_ingredient", "pickle"),
  tap("customize_done"),
  tap("add_to_cart"),
  tap("added_ok"),
  tap("order_details"),
  tap("upsell_no_thanks"),
];

describe("패스트푸드 키오스크 — 실제 화면 흐름", () => {
  it("터치로 대표 주문 (a)를 하면 실제 키오스크의 화면 순서를 거쳐 장바구니가 정확히 채워진다", () => {
    const { state, screens } = replay(touchOrderA);

    expect(screens).toEqual([
      "idle",
      "order_type",
      "menu",
      "set_choice",
      "set_size",
      "set_side",
      "set_drink",
      "confirm",
      "customize",
      "confirm",
      "added",
      "menu",
      "upsell",
      "review",
    ]);
    expect(state.orderType).toBe("eat_in");
    expect(state.cart).toEqual([
      {
        menuId: "double_cheese",
        mode: "set",
        size: "L",
        side: "fries",
        drink: "zero_cola",
        remove: ["pickle"],
        add: [],
        qty: 1,
        unitPrice: 8300,
      },
    ]);
  });

  it("KIBO는 결제를 누를 수 없다. 결제는 사람만 한다", () => {
    const { state } = replay(touchOrderA);
    const byKibo = step(state, { by: "kibo", target: "pay" });
    expect(byKibo.ok).toBe(false);

    const byTouch = step(state, tap("pay"));
    expect(byTouch.ok).toBe(true);
    if (byTouch.ok) expect(byTouch.state.screen).toBe("payment");
  });

  it("지금 화면에 없는 버튼은 누를 수 없다", () => {
    const r = step(initialState(), tap("size", "L"));
    expect(r.ok).toBe(false);
  });
});
