import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { initialState, step, type KioskEvent, type KioskState, type Target } from "./machine";
import { addOns, allItems, burgers, categories, simpleItems } from "./menu";
import { mergeIntent, plan, type FastfoodIntent } from "./planner";

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

describe("대화 — 진행 중 상품, 되묻기 다음 턴, 재료, 수량", () => {
  const touch = (events: [KioskEvent["target"], string?][], start = initialState()) =>
    events.reduce((s, [target, value]) => {
      const r = step(s, value === undefined ? { by: "touch", target } : { by: "touch", target, value });
      if (!r.ok) throw new Error(`${target} ${r.error}`);
      return r.state;
    }, start);
  // 사람이 터치로 더블 치즈버거 세트를 고르다 사이즈 화면에서 멈췄다
  const stuck = touch([["start"], ["order_type", "eat_in"], ["category", "burgers"], ["item", "double_cheese"], ["set_choice", "set"]]);
  const cartOf = (r: ReturnType<typeof plan>) => (r.kind === "plan" ? r.final.cart.map((l) => [l.menuId, l.mode, l.size, l.side, l.drink, l.remove.join("+")]) : r);

  it("사람이 고르다 멈춘 상품은 버리지 않는다: 말한 값으로 이어 채워 담고, 빠진 값은 그 상품을 되묻고, 버리라고 할 때만 버린다", () => {
    const r = plan(stuck, { current: { size: "L", drink: "cola" }, checkout: true });
    expect(r.kind === "plan" && r.events[0]).toEqual({ by: "kibo", target: "size", value: "L" });
    expect(cartOf(r)).toEqual([["double_cheese", "set", "L", "fries", "cola", ""]]);
    // Spark가 진행 중 상품을 새 상품 목록에도 다시 적으면(실측) 같은 상품으로 보고 한 번만 담는다
    const twice = plan(stuck, { current: { size: "L", drink: "cola" }, items: [{ menuId: "double_cheese", mode: "set", size: "L", side: "fries", drink: "cola", qty: 1 }], checkout: true });
    expect(cartOf(twice)).toEqual([["double_cheese", "set", "L", "fries", "cola", ""]]);
    // 새 상품만 말해도 진행 중인 상품의 빠진 값을 먼저 묻는다
    expect(plan(stuck, { current: { size: "L" } })).toEqual({ kind: "clarify", missing: [{ field: "drink", line: "current" }] });
    expect(plan(stuck, { items: [{ menuId: "apple_pie" }] })).toEqual({ kind: "clarify", missing: [{ field: "size", line: "current" }, { field: "drink", line: "current" }] });
    expect(cartOf(plan(stuck, { dropCurrent: true, items: [{ menuId: "apple_pie" }], checkout: true }))).toEqual([["apple_pie", "single", null, null, null, ""]]);
    // 담기 직전 화면에서 "이걸로 주문할게요" → 담고 주문 확인으로. 이미 고른 값과 다르게 말하면 그 상품을 처음부터 다시 담는다
    const atConfirm = touch([["size", "L"], ["side", "fries"], ["drink", "zero_cola"]], stuck);
    expect(cartOf(plan(atConfirm, { checkout: true }))).toEqual([["double_cheese", "set", "L", "fries", "zero_cola", ""]]);
    expect(cartOf(plan(atConfirm, { current: { size: "M", remove: ["pickle"] }, checkout: true }))).toEqual([["double_cheese", "set", "M", "fries", "zero_cola", "pickle"]]);
  });

  it("되묻기 다음 턴: 앞 의도에 새 답을 합친다. 새 상품 목록이 비면 앞 상품을 두고, 끝내기·결제 부탁은 한 번 말하면 남는다", () => {
    const pending: FastfoodIntent = { items: [{ menuId: "classic", mode: "set" }], checkout: true, current: { size: "L" } };
    expect(mergeIntent(pending, { orderType: "eat_in", items: [], checkout: false, current: { drink: "cola" } })).toEqual({
      orderType: "eat_in",
      items: [{ menuId: "classic", mode: "set" }],
      checkout: true,
      current: { size: "L", drink: "cola" },
    });
    expect(mergeIntent(pending, { items: [{ menuId: "classic", mode: "set", size: "L", drink: "cola" }] }).items).toEqual([{ menuId: "classic", mode: "set", size: "L", drink: "cola" }]);
  });

  it("재료는 줄마다 그 버거 기준: 없는 재료는 빼고 알리고, 빵·패티·치킨 같은 주재료는 뺄 수 없다. 수량은 1–10", () => {
    const r = plan(initialState(), {
      orderType: "eat_in",
      items: [
        { menuId: "double_cheese", mode: "single", remove: ["pickle"] },
        { menuId: "spicy_chicken", mode: "single", remove: ["pickle", "chicken", "mayo"] },
      ],
      checkout: true,
    });
    expect(cartOf(r)).toEqual([
      ["double_cheese", "single", null, null, null, "pickle"],
      ["spicy_chicken", "single", null, null, null, "mayo"],
    ]);
    expect(r.kind === "plan" && r.dropped).toEqual([
      { line: 1, ingredient: "pickle" },
      { line: 1, ingredient: "chicken" },
    ]);
    const custom = touch([["start"], ["order_type", "eat_in"], ["category", "burgers"], ["item", "spicy_chicken"], ["set_choice", "single"], ["customize"]]);
    expect(step(custom, { by: "touch", target: "toggle_ingredient", value: "chicken" })).toEqual({ ok: false, error: "ingredient_required" });
    expect(plan(initialState(), { orderType: "eat_in", items: [{ menuId: "apple_pie", qty: 11 }] })).toEqual({ kind: "reject", reason: "bad_qty", line: 0 });
    expect(plan(initialState(), { orderType: "eat_in", items: [{ menuId: "apple_pie", qty: 0 }] })).toEqual({ kind: "reject", reason: "bad_qty", line: 0 });
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

  // 키오스크가 받아 주는 KIBO 조작 중에서 하나씩 골라 걷는다. 거절될 조작만 고르는 헛걸음 없이 주문 확인 화면에 실제로 닿게 하고,
  // 닿은 상태마다 KIBO의 결제를 찔러 본다
  it("걷기: KIBO가 받아 주는 버튼을 어떤 순서로 눌러도 결제는 거절되고 결제 화면에 가지 않는다. 주문 확인 도달률을 출력한다", () => {
    const targets: Target[] = ["start", "language", "order_type", "category", "item", "set_choice", "size", "side", "drink", "customize", "toggle_ingredient", "toggle_addon", "customize_done", "qty_plus", "qty_minus", "add_to_cart", "cancel", "added_ok", "order_details", "upsell_no_thanks", "upsell_add", "add_more", "remove_line", "start_over"];
    const valuesFor: Partial<Record<Target, string[]>> = {
      language: ["en", "ko"],
      order_type: ["eat_in", "take_out"],
      category: categories.map((c) => c.id),
      item: allItems.map((i) => i.id),
      set_choice: ["set", "single"],
      size: ["M", "L"],
      side: simpleItems.filter((i) => i.category === "sides").map((i) => i.id),
      drink: simpleItems.filter((i) => i.category === "drinks").map((i) => i.id),
      toggle_ingredient: [...new Set(burgers.flatMap((b) => b.ingredients))],
      toggle_addon: addOns.map((a) => a.id),
      remove_line: ["0", "1"],
    };
    const candidates = targets.flatMap((target) => (valuesFor[target] ?? [undefined]).map((value): KioskEvent => ({ by: "kibo", target, value })));
    const reach = { review: 0, runs: 0 };
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: 150, maxLength: 250 }), (choices) => {
        let s = initialState();
        let seenReview = false;
        for (const c of choices) {
          seenReview ||= s.screen === "review";
          expect(step(s, { by: "kibo", target: "pay" })).toEqual({ ok: false, error: "payment_requires_human" });
          const next = candidates.flatMap((e) => {
            const r = step(s, e);
            return r.ok ? [r.state] : [];
          });
          s = next[c % next.length];
          expect(s.screen).not.toBe("payment");
        }
        reach.runs++;
        if (seenReview) reach.review++;
      }),
      // 기본 60회. 영상 숫자(PROP_RUNS)는 PROP_RUNS=1000으로 따로 돌린 실측
      { numRuns: Number(process.env.PROP_RUNS ?? 60) },
    );
    console.log("패스트푸드 걷기 주문 확인 도달률", reach.review / reach.runs);
    expect(reach.review / reach.runs).toBeGreaterThanOrEqual(0.3);
  });
});
