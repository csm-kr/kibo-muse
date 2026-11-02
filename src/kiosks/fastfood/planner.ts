// KIBO 화면 경로 계획 — 패스트푸드.
// Spark가 뽑은 주문 의도를 받아, 지금 화면에서부터 사람이 누를 버튼 순서를 만든다.
// 버튼 하나를 계획할 때마다 상태 기계에 실제로 돌려 보므로, 계획이 나왔다면 실행할 수 있다.

import { step, type KioskEvent, type KioskState } from "./machine";
import { DEFAULT_SET_SIDE, findItem, isBurger, itemsIn, type Size } from "./menu";

export interface IntentLine {
  menuId: string;
  mode?: "set" | "single";
  size?: Size;
  side?: string;
  drink?: string;
  remove?: string[];
  addOns?: string[];
  qty?: number;
}

export interface FastfoodIntent {
  orderType?: "eat_in" | "take_out";
  items?: IntentLine[];
  // 주문 확인 화면까지 간다
  checkout?: boolean;
  // 결제를 부탁받음. KIBO는 결제를 누르지 않고 사람에게 넘긴다
  requestPayment?: boolean;
}

export type Missing = { field: "orderType" } | { field: "mode" | "size" | "drink"; line: number };

// 말하지 않아서 기본값으로 채운 것. 확인 문장에서 사용자에게 밝힌다
export interface Assumed {
  field: "side";
  line: number;
  value: string;
}

export type PlanResult =
  | { kind: "plan"; events: KioskEvent[]; final: KioskState; paymentHandoff: boolean; assumed: Assumed[] }
  | { kind: "clarify"; missing: Missing[] }
  | { kind: "reject"; reason: string; line?: number };

class PlanError extends Error {
  constructor(
    public reason: string,
    public line?: number,
  ) {
    super(reason);
  }
}

export function plan(start: KioskState, intent: FastfoodIntent): PlanResult {
  const items = intent.items ?? [];

  // 1. 메뉴에 없는 상품은 거절한다
  for (const [i, line] of items.entries()) {
    if (!findItem(line.menuId)) return { kind: "reject", reason: "unknown_item", line: i };
  }
  if (start.screen === "payment") return { kind: "reject", reason: "payment_in_progress" };

  // 2. 빠진 정보는 한 번에 모아 되묻는다
  const missing: Missing[] = [];
  if (!start.orderType && !intent.orderType && items.length > 0) missing.push({ field: "orderType" });
  for (const [i, line] of items.entries()) {
    if (!isBurger(findItem(line.menuId)!)) continue;
    if (!line.mode) missing.push({ field: "mode", line: i });
    if (line.mode === "set") {
      if (!line.size) missing.push({ field: "size", line: i });
      if (!line.drink) missing.push({ field: "drink", line: i });
    }
  }
  if (missing.length) return { kind: "clarify", missing };

  const assumed: Assumed[] = [];
  for (const [i, line] of items.entries()) {
    if (line.mode === "set" && !line.side) assumed.push({ field: "side", line: i, value: DEFAULT_SET_SIDE });
  }

  // 3. 버튼 순서를 계획하면서 상태 기계로 검증한다
  const events: KioskEvent[] = [];
  let cur = start;
  let lineNo: number | undefined;
  const press = (target: KioskEvent["target"], value?: string) => {
    const e: KioskEvent = value === undefined ? { by: "kibo", target } : { by: "kibo", target, value };
    const r = step(cur, e);
    if (!r.ok) throw new PlanError(r.error, lineNo);
    events.push(e);
    cur = r.state;
  };

  try {
    // 지금 화면에서 메뉴 화면으로 간다
    switch (cur.screen) {
      case "idle":
        press("start");
        press("order_type", intent.orderType ?? cur.orderType ?? undefined);
        break;
      case "order_type":
        press("order_type", intent.orderType ?? undefined);
        break;
      case "set_choice":
      case "set_size":
      case "set_side":
      case "set_drink":
      case "confirm":
        press("cancel");
        break;
      case "customize":
        press("customize_done");
        press("cancel");
        break;
      case "added":
        press("added_ok");
        break;
      case "upsell":
        press("upsell_no_thanks");
        if (items.length) press("add_more");
        break;
      case "review":
        if (items.length) press("add_more");
        break;
    }

    for (const [i, line] of items.entries()) {
      lineNo = i;
      const item = findItem(line.menuId)!;
      if (!itemsIn(cur.category).some((x) => x.id === item.id)) press("category", item.category);
      press("item", item.id);
      if (isBurger(item)) {
        press("set_choice", line.mode);
        if (line.mode === "set") {
          press("size", line.size);
          press("side", line.side ?? DEFAULT_SET_SIDE);
          press("drink", line.drink);
        }
      }
      if (line.remove?.length || line.addOns?.length) {
        press("customize");
        for (const ing of line.remove ?? []) press("toggle_ingredient", ing);
        for (const a of line.addOns ?? []) press("toggle_addon", a);
        press("customize_done");
      }
      for (let q = 1; q < (line.qty ?? 1); q++) press("qty_plus");
      press("add_to_cart");
      press("added_ok");
    }
    lineNo = undefined;

    if ((intent.checkout || intent.requestPayment) && cur.screen !== "review") {
      press("order_details");
      // 실제 키오스크처럼 추천 팝업이 뜨면 거절한다
      if (cur.screen === "upsell") press("upsell_no_thanks");
    }
  } catch (err) {
    if (err instanceof PlanError) return err.line === undefined ? { kind: "reject", reason: err.reason } : { kind: "reject", reason: err.reason, line: err.line };
    throw err;
  }

  return { kind: "plan", events, final: cur, paymentHandoff: !!intent.requestPayment, assumed };
}
