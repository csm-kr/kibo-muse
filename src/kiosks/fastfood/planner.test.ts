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
      // 아는 만큼 먼저 누른다: 매장·포장을 모르니 [Order here]만 눌러 그 화면에서 멈춘다
      events: [{ by: "kibo", target: "start" }],
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
    expect(plan(stuck, { current: { size: "L" } })).toEqual({ kind: "clarify", missing: [{ field: "drink", line: "current" }], events: [{ by: "kibo", target: "size", value: "L" }, { by: "kibo", target: "side", value: "fries" }] });
    expect(plan(stuck, { items: [{ menuId: "apple_pie" }] })).toEqual({ kind: "clarify", missing: [{ field: "size", line: "current" }, { field: "drink", line: "current" }], events: [] });
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

describe("아는 만큼 먼저 누르기 — 되물을 때도 빠진 것을 고르는 화면까지 누르고 멈춘다", () => {
  const SAFE = ["start", "order_type", "added_ok", "upsell_no_thanks", "add_more", "category", "item", "set_choice", "size", "side", "drink"];
  const lead = (start: KioskState, intent: FastfoodIntent) => {
    const r = plan(start, intent);
    if (r.kind !== "clarify") throw new Error(r.kind);
    // 담기·주문 확인·결제·취소 같은 버튼은 되물을 때 누르지 않는다
    expect(r.events.filter((e) => !SAFE.includes(e.target))).toEqual([]);
    return { r, state: replayByKibo(start, r.events).state };
  };
  const cart = (r: ReturnType<typeof plan>) => (r.kind === "plan" ? r.final.cart.map((l) => [l.menuId, l.mode, l.size, l.side, l.drink, l.qty]) : r);

  it("예 1) '더블 치즈버거 세트, 먹고 갈게요': 사이즈 화면에서 멈추고, 다음 대답은 거기서 이어 같은 상품을 한 번만 담는다", () => {
    const said: FastfoodIntent = { orderType: "eat_in", items: [{ menuId: "double_cheese", mode: "set", qty: 1 }] };
    const t1 = lead(initialState(), said);
    expect(t1.state.screen).toBe("set_size");
    expect(t1.r.events.slice(0, 2).map((e) => e.target)).toEqual(["start", "order_type"]);
    // 다음 턴 "L": Spark가 상품을 다시 적어도(실측) 진행 중 상품으로 이어 간다. 음료가 아직 없어 음료 화면에서 멈춘다
    const p2 = mergeIntent(said, { items: [{ menuId: "double_cheese", mode: "set", size: "L", qty: 1 }] });
    const t2 = lead(t1.state, p2);
    expect(t2.r.events).toEqual([{ by: "kibo", target: "size", value: "L" }, { by: "kibo", target: "side", value: "fries" }]);
    expect(t2.state.screen).toBe("set_drink");
    expect(cart(plan(t2.state, mergeIntent(p2, { current: { drink: "cola" } })))).toEqual([["double_cheese", "set", "L", "fries", "cola", 1]]);
    // 다음 턴에 사이즈·음료를 한꺼번에 말해도(진행 중 상품으로) 한 번만 담는다
    expect(cart(plan(t1.state, mergeIntent(said, { current: { size: "L", drink: "cola" } })))).toEqual([["double_cheese", "set", "L", "fries", "cola", 1]]);
  });

  it("예 2) 상품은 있고 매장·포장이 없으면 [Order here]만 눌러 매장·포장 화면에서 멈춘다", () => {
    const said: FastfoodIntent = { items: [{ menuId: "bulgogi", mode: "set", size: "M", drink: "cola", qty: 1 }] };
    const t1 = lead(initialState(), said);
    expect(t1.r.events).toEqual([{ by: "kibo", target: "start" }]);
    expect(t1.state.screen).toBe("order_type");
    expect(cart(plan(t1.state, mergeIntent(said, { orderType: "take_out" })))).toEqual([["bulgogi", "set", "M", "fries", "cola", 1]]);
  });

  it("관문 앞에서는 누르지 않는다: 주문 확인에서 상품을 더 말하면 빠진 것을 고르는 화면까지만 가고 담기·결제는 누르지 않는다. 사람이 고르던 상품을 버려야 하거나 다른 상품을 물으면 아무것도 누르지 않는다", () => {
    const done = plan(initialState(), { orderType: "eat_in", items: [{ menuId: "apple_pie", qty: 1 }], checkout: true });
    if (done.kind !== "plan") throw new Error(done.kind);
    expect(done.final.screen).toBe("review");
    const t = lead(done.final, { items: [{ menuId: "bulgogi", mode: "set", qty: 1 }], checkout: true });
    expect(t.state.screen).toBe("set_size");
    expect(t.state.cart).toHaveLength(1);
    // 사람이 고르다 멈춘 상품(사이즈 화면)과 다른 상품의 빠진 값만 물으면, 진행 중 상품을 두고 아무것도 누르지 않는다
    const stuck = replayByKibo(initialState(), [
      { by: "kibo", target: "start" },
      { by: "kibo", target: "order_type", value: "eat_in" },
      { by: "kibo", target: "category", value: "burgers" },
      { by: "kibo", target: "item", value: "double_cheese" },
      { by: "kibo", target: "set_choice", value: "set" },
      { by: "kibo", target: "size", value: "L" },
      { by: "kibo", target: "side", value: "fries" },
      { by: "kibo", target: "drink", value: "cola" },
    ]).state;
    expect(lead(stuck, { items: [{ menuId: "bulgogi", qty: 1 }] }).r.events).toEqual([]);
    // 고른 값과 다르게 말해 처음부터 다시 담아야 하면(취소가 필요) 되물을 때는 누르지 않는다
    expect(lead(stuck, { current: { size: "M" }, items: [{ menuId: "bulgogi", qty: 1 }] }).r.events).toEqual([]);
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
