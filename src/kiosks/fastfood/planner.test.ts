import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { initialState, step, type KioskEvent, type KioskState } from "./machine";
import { burgers, simpleItems } from "./menu";
import { plan, type FastfoodIntent } from "./planner";

function replayByKibo(start: KioskState, events: KioskEvent[]) {
  let state = start;
  const screens = [state.screen];
  for (const e of events) {
    expect(e.by).toBe("kibo");
    const r = step(state, e);
    if (!r.ok) throw new Error(`${e.target}(${e.value ?? ""}) 실패: ${r.error}`);
    state = r.state;
    if (screens[screens.length - 1] !== state.screen) screens.push(state.screen);
  }
  return { state, screens };
}

const orderA: FastfoodIntent = {
  orderType: "eat_in",
  items: [{ menuId: "double_cheese", mode: "set", size: "L", side: "fries", drink: "zero_cola", remove: ["pickle"], qty: 1 }],
  checkout: true,
};

describe("KIBO 화면 경로 계획 — 패스트푸드", () => {
  it("대표 주문 (a) 의도를 받으면 사람이 누를 버튼 순서를 계획하고, 실제 화면 13장을 거쳐 주문 확인에서 멈춘다", () => {
    const r = plan(initialState(), orderA);
    expect(r.kind).toBe("plan");
    if (r.kind !== "plan") return;

    const { state, screens } = replayByKibo(initialState(), r.events);
    expect(screens).toHaveLength(14);
    expect(state.screen).toBe("review");
    expect(state.cart).toEqual([
      { menuId: "double_cheese", mode: "set", size: "L", side: "fries", drink: "zero_cola", remove: ["pickle"], add: [], qty: 1, unitPrice: 8300 },
    ]);
    expect(r.final).toEqual(state);
  });

  it("빠진 정보는 지어내지 않고 한 번에 모아 되묻는다. 세트 사이드는 기본 구성(감자튀김)이라 묻지 않는다", () => {
    const r = plan(initialState(), { items: [{ menuId: "double_cheese", mode: "set" }] });
    expect(r).toEqual({
      kind: "clarify",
      missing: [
        { field: "orderType" },
        { field: "size", line: 0 },
        { field: "drink", line: 0 },
      ],
    });
  });

  it("세트 사이드를 말하지 않으면 기본 구성(감자튀김)으로 채우고, 채웠다는 사실을 돌려준다", () => {
    const r = plan(initialState(), { orderType: "eat_in", items: [{ menuId: "bulgogi", mode: "set", size: "M", drink: "cola" }] });
    expect(r.kind).toBe("plan");
    if (r.kind !== "plan") return;
    expect(r.final.cart[0].side).toBe("fries");
    expect(r.assumed).toEqual([{ field: "side", line: 0, value: "fries" }]);
  });

  it("메뉴에 없는 상품은 거절한다", () => {
    const r = plan(initialState(), { orderType: "take_out", items: [{ menuId: "big_mac", mode: "single" }] });
    expect(r).toEqual({ kind: "reject", reason: "unknown_item", line: 0 });
  });

  it("결제를 부탁받아도 주문 확인 화면에서 멈추고 사람에게 넘긴다", () => {
    const r = plan(initialState(), { ...orderA, requestPayment: true });
    expect(r.kind).toBe("plan");
    if (r.kind !== "plan") return;
    expect(r.events.some((e) => e.target === "pay")).toBe(false);
    expect(r.final.screen).toBe("review");
    expect(r.paymentHandoff).toBe(true);
  });

  it("사람이 담아 둔 장바구니에 이어서 추가한다", () => {
    const first = plan(initialState(), orderA);
    if (first.kind !== "plan") throw new Error("plan expected");
    const r = plan(first.final, { items: [{ menuId: "apple_pie", qty: 2 }], checkout: true });
    expect(r.kind).toBe("plan");
    if (r.kind !== "plan") return;
    expect(r.final.cart.map((l) => [l.menuId, l.qty])).toEqual([
      ["double_cheese", 1],
      ["apple_pie", 2],
    ]);
    expect(r.final.screen).toBe("review");
  });
});

describe("속성 테스트", () => {
  const sides = simpleItems.filter((i) => i.category === "sides" && i.setUpcharge !== null).map((i) => i.id);
  const drinks = simpleItems.filter((i) => i.category === "drinks" && i.setUpcharge !== null).map((i) => i.id);

  const setLine = fc.record({
    menuId: fc.constantFrom(...burgers.map((b) => b.id)),
    mode: fc.constant("set" as const),
    size: fc.constantFrom("M" as const, "L" as const),
    side: fc.constantFrom(...sides),
    drink: fc.constantFrom(...drinks),
    qty: fc.integer({ min: 1, max: 3 }),
  });
  const singleLine = fc.record({
    menuId: fc.constantFrom(...[...burgers, ...simpleItems].map((i) => i.id)),
    mode: fc.constant("single" as const),
    qty: fc.integer({ min: 1, max: 3 }),
  });

  it("완전한 의도라면 언제나 실행 가능한 계획이 나오고, 장바구니가 의도와 같으며, 결제 화면에 가지 않는다", () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(setLine, singleLine), { minLength: 1, maxLength: 4 }), fc.constantFrom("eat_in" as const, "take_out" as const), (items, orderType) => {
        const r = plan(initialState(), { orderType, items, checkout: true });
        expect(r.kind).toBe("plan");
        if (r.kind !== "plan") return;
        const { state } = replayByKibo(initialState(), r.events);
        expect(state.screen).toBe("review");
        expect(state.cart.map((l) => [l.menuId, l.mode, l.qty])).toEqual(items.map((i) => [i.menuId, i.mode, i.qty]));
      }),
    );
  });

  it("KIBO가 어떤 버튼을 어떤 순서로 눌러도 결제 화면에는 도달하지 않는다", () => {
    const targets = ["start", "language", "order_type", "category", "item", "set_choice", "size", "side", "drink", "customize", "toggle_ingredient", "toggle_addon", "customize_done", "qty_plus", "qty_minus", "add_to_cart", "cancel", "added_ok", "order_details", "upsell_no_thanks", "upsell_add", "add_more", "remove_line", "pay", "start_over"] as const;
    const values = ["en", "ko", "eat_in", "take_out", "burgers", "sides", "drinks", "desserts", "recommended", "double_cheese", "fries", "zero_cola", "set", "single", "L", "M", "pickle", "bacon", "sundae", "0", undefined];
    const event = fc.record({ target: fc.constantFrom(...targets), value: fc.constantFrom(...values) });

    fc.assert(
      fc.property(fc.array(event, { maxLength: 60 }), (events) => {
        let state = initialState();
        for (const e of events) {
          const r = step(state, { by: "kibo", ...e });
          if (r.ok) state = r.state;
          expect(state.screen).not.toBe("payment");
        }
      }),
    );
  });
});
