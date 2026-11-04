// KIBO 화면 경로 계획 — 패스트푸드.
// Spark가 뽑은 주문 의도를 받아, 지금 화면에서부터 사람이 누를 버튼 순서를 만든다.
// 버튼 하나를 계획할 때마다 상태 기계에 실제로 돌려 보므로, 계획이 나왔다면 실행할 수 있다.

import { MAX_QTY, step, type Draft, type KioskEvent, type KioskState } from "./machine";
import { DEFAULT_SET_SIDE, REQUIRED_INGREDIENTS, findItem, isBurger, itemsIn, type Size } from "./menu";

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
  // 사람이 화면에서 고르다 멈춘 상품(아직 장바구니에 없음)에 대해 한 말
  current?: Omit<IntentLine, "menuId">;
  // 고르다 멈춘 상품을 버린다
  dropCurrent?: boolean;
  // 주문 확인 화면까지 간다
  checkout?: boolean;
  // 결제를 부탁받음. KIBO는 결제를 누르지 않고 사람에게 넘긴다
  requestPayment?: boolean;
}

export type Missing = { field: "orderType" } | { field: "mode" | "size" | "drink"; line: number | "current" };

// 말하지 않아서 기본값으로 채운 것. 확인 문장에서 사용자에게 밝힌다
export interface Assumed {
  field: "side";
  line: number;
  value: string;
}

// 그 버거에 없거나 뺄 수 없는 재료라 빼지 않은 것. 사용자에게 알린다
export interface Dropped {
  line: number | "current";
  ingredient: string;
}

export type PlanResult =
  | { kind: "plan"; events: KioskEvent[]; final: KioskState; paymentHandoff: boolean; assumed: Assumed[]; dropped: Dropped[] }
  // events: 되물을 때도 아는 만큼 먼저 누른 버튼(빠진 것을 고르는 화면에서 멈춤). 담기·주문 확인·결제는 없다
  | { kind: "clarify"; missing: Missing[]; events: KioskEvent[] }
  | { kind: "reject"; reason: string; line?: number };

class PlanError extends Error {
  constructor(
    public reason: string,
    public line?: number,
  ) {
    super(reason);
  }
}

// 되물을 때 먼저 누르기를 멈춘다(빠진 값을 고르는 화면, 또는 고르는 버튼이 아닌 버튼 앞)
class Stop extends Error {}

// 되물을 때 누를 수 있는 버튼. 값 없이 넘어가는 버튼과, 아는 값을 고르는 버튼뿐이다(담기·주문 확인·결제·취소·재료 바꾸기는 없다)
const LEAD_TAP: KioskEvent["target"][] = ["start", "added_ok", "upsell_no_thanks", "add_more"];
const LEAD_PICK: KioskEvent["target"][] = ["order_type", "category", "item", "set_choice", "size", "side", "drink"];

// 되묻기 다음 턴: 앞 의도에 새 답을 합친다. Spark는 앞 상품을 답과 함께 다시 돌려주게 되어 있고, 비어 있으면 앞 상품을 둔다
export function mergeIntent(prev: FastfoodIntent, next: FastfoodIntent): FastfoodIntent {
  const out: FastfoodIntent = { ...prev };
  if (next.orderType) out.orderType = next.orderType;
  if (next.items?.length) out.items = next.items;
  if (next.current) out.current = { ...prev.current, ...next.current };
  if (next.checkout) out.checkout = true;
  if (next.requestPayment) out.requestPayment = true;
  if (next.dropCurrent) out.dropCurrent = true;
  return out;
}

// 그 버거에서 뺄 수 있는 재료만 남긴다(없는 재료, 빵·패티 같은 주재료는 뺄 수 없다)
function removable(menuId: string, remove: string[]) {
  const item = findItem(menuId);
  const ok = (x: string) => !!item && isBurger(item) && item.ingredients.includes(x) && !REQUIRED_INGREDIENTS.includes(x);
  return { keep: remove.filter(ok), drop: remove.filter((x) => !ok(x)) };
}

// 사람이 고르다 멈춘 상품에 이번 말을 합친다
function currentLine(d: Draft, c: FastfoodIntent["current"] = {}): IntentLine {
  const line: IntentLine = { menuId: d.menuId, remove: [...new Set([...d.remove, ...(c.remove ?? [])])], addOns: [...new Set([...d.add, ...(c.addOns ?? [])])], qty: c.qty ?? d.qty };
  const mode = c.mode ?? d.mode ?? undefined;
  const size = c.size ?? d.size ?? undefined;
  const side = c.side ?? d.side ?? undefined;
  const drink = c.drink ?? d.drink ?? undefined;
  if (mode) line.mode = mode;
  if (size) line.size = size;
  if (side) line.side = side;
  if (drink) line.drink = drink;
  return line;
}

// 화면에서 이미 고른 값과 다르게 말했으면 이어 채울 수 없다(실제 키오스크엔 뒤로 가기가 없다). 그 상품을 처음부터 다시 담는다
const conflicts = (d: Draft, l: IntentLine) => (d.mode && d.mode !== l.mode) || (d.size && d.size !== l.size) || (d.side && d.side !== l.side) || (d.drink && d.drink !== l.drink);

// 두 줄이 같은 상품을 다르게 말한 것이 아닌가 (둘 다 정한 값이 서로 다르지 않다)
const compatible = (a: IntentLine, b: IntentLine) => (["mode", "size", "side", "drink"] as const).every((k) => !a[k] || !b[k] || a[k] === b[k]);

export function plan(start: KioskState, intent: FastfoodIntent): PlanResult {
  let items = intent.items ?? [];
  const draft = start.draft && !intent.dropCurrent ? start.draft : null;
  let current = intent.current;
  // Spark가 고르다 멈춘 상품을 새 상품 목록에 다시 적는 일이 있다(실측). 같은 상품이면 진행 중 상품으로 합쳐 한 번만 담는다.
  // 같은 상품인지는 화면에서 이미 고른 값으로만 본다. 이번 말의 current는 고치는 말이라 다시 적힌 줄보다 앞선다
  // (11/4 실음성 v6: 사이즈 화면에서 "콜라 말고 제로 콜라로요" → 앞 상품(콜라)과 current(제로 콜라)가 두 줄로 나뉘었다)
  if (draft) {
    const k = items.findIndex((l) => l.menuId === draft.menuId && compatible(currentLine(draft), l));
    if (k >= 0) {
      const { mode, size, side, drink, remove, addOns, qty } = items[k];
      current = { mode, size, side, drink, remove, addOns, qty, ...current };
      items = items.filter((_, i) => i !== k);
    }
  }
  const cur0 = draft ? currentLine(draft, current) : null;
  const lines: { key: number | "current"; line: IntentLine }[] = [...(cur0 ? [{ key: "current" as const, line: cur0 }] : []), ...items.map((line, i) => ({ key: i, line }))];

  // 1. 메뉴에 없는 상품과 수량 범위를 거른다
  for (const [i, line] of items.entries()) {
    if (!findItem(line.menuId)) return { kind: "reject", reason: "unknown_item", line: i };
  }
  for (const { key, line } of lines) {
    const q = line.qty ?? 1;
    if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) return key === "current" ? { kind: "reject", reason: "bad_qty" } : { kind: "reject", reason: "bad_qty", line: key };
  }
  if (start.screen === "payment") return { kind: "reject", reason: "payment_in_progress" };

  // 2. 빠진 정보는 한 번에 모아 되묻는다. 고르다 멈춘 상품이 먼저다
  const missing: Missing[] = [];
  if (!start.orderType && !intent.orderType && items.length > 0) missing.push({ field: "orderType" });
  for (const { key, line } of lines) {
    if (!isBurger(findItem(line.menuId)!)) continue;
    if (!line.mode) missing.push({ field: "mode", line: key });
    if (line.mode === "set") {
      if (!line.size) missing.push({ field: "size", line: key });
      if (!line.drink) missing.push({ field: "drink", line: key });
    }
  }
  // 빠진 정보가 있으면 아는 만큼만 누른다(lead): 빠진 값이 있는 첫 줄(매장·포장만 빠졌으면 null)만 손대고,
  // 빠진 값이나 고르는 버튼이 아닌 버튼 앞에서 멈춘 뒤 되묻는다
  const first = missing.find((m) => m.field !== "orderType");
  const lead = missing.length ? { key: first && "line" in first ? first.line : null } : null;

  const assumed: Assumed[] = [];
  for (const [i, line] of items.entries()) {
    if (line.mode === "set" && !line.side) assumed.push({ field: "side", line: i, value: DEFAULT_SET_SIDE });
  }
  // 3. 재료는 줄마다 그 버거 기준으로 거른다
  const dropped: Dropped[] = [];
  const clean = lines.map(({ key, line }) => {
    const { keep, drop } = removable(line.menuId, line.remove ?? []);
    for (const ingredient of drop) dropped.push({ line: key, ingredient });
    return { key, line: { ...line, remove: keep } };
  });

  // 4. 버튼 순서를 계획하면서 상태 기계로 검증한다
  const events: KioskEvent[] = [];
  let cur = start;
  let lineNo: number | undefined;
  const press = (target: KioskEvent["target"], value?: string) => {
    if (lead && !LEAD_TAP.includes(target) && !(LEAD_PICK.includes(target) && value !== undefined)) throw new Stop();
    const e: KioskEvent = value === undefined ? { by: "kibo", target } : { by: "kibo", target, value };
    const r = step(cur, e);
    if (!r.ok) throw new PlanError(r.error, lineNo);
    events.push(e);
    cur = r.state;
  };
  // 담기 직전 화면(confirm·customize)에서 재료·추가·수량을 맞추고 담는다
  const finishLine = (line: IntentLine) => {
    const want = { remove: line.remove ?? [], add: line.addOns ?? [] };
    const d = () => cur.draft!;
    const diff = (have: string[], w: string[]) => [...have.filter((x) => !w.includes(x)), ...w.filter((x) => !have.includes(x))];
    if (diff(d().remove, want.remove).length || diff(d().add, want.add).length) {
      if (cur.screen !== "customize") press("customize");
      for (const ing of diff(d().remove, want.remove)) press("toggle_ingredient", ing);
      for (const a of diff(d().add, want.add)) press("toggle_addon", a);
    }
    if (cur.screen === "customize") press("customize_done");
    while (d().qty < (line.qty ?? 1)) press("qty_plus");
    while (d().qty > (line.qty ?? 1)) press("qty_minus");
    press("add_to_cart");
    press("added_ok");
  };
  // 메뉴 화면에서 한 줄을 처음부터 담는다
  const addLine = (line: IntentLine) => {
    const item = findItem(line.menuId)!;
    if (!itemsIn(cur.category).some((x) => x.id === item.id)) press("category", item.category);
    press("item", item.id);
    if (isBurger(item)) press("set_choice", line.mode);
    if (line.mode === "set" && isBurger(item)) {
      press("size", line.size);
      press("side", line.side ?? DEFAULT_SET_SIDE);
      press("drink", line.drink);
    }
    finishLine(line);
  };

  try {
    // 고르다 멈춘 상품: 이어 채우거나, 고른 값과 다르면 처음부터 다시, 버리라고 했으면 버린다
    const head = clean[0]?.key === "current" ? clean.shift()!.line : null;
    const redo = !!(head && start.draft && conflicts(start.draft, head));
    if (start.draft && (!head || redo)) {
      if (cur.screen === "customize") press("customize_done");
      press("cancel");
    }
    if (head && !redo) {
      // 되물을 때 빠진 값이 진행 중 상품의 것이 아니면 진행 중 상품에 손대지 않는다
      if (lead && lead.key !== "current") throw new Stop();
      if (cur.screen === "set_choice") press("set_choice", head.mode);
      if (cur.screen === "set_size") press("size", head.size);
      if (cur.screen === "set_side") press("side", head.side ?? DEFAULT_SET_SIDE);
      if (cur.screen === "set_drink") press("drink", head.drink);
      finishLine(head);
    }

    // 지금 화면에서 메뉴 화면으로 간다
    const queue = redo ? [{ key: "current" as const, line: head! }, ...clean] : clean;
    const more = queue.length > 0;
    switch (cur.screen) {
      case "idle":
        press("start");
        press("order_type", intent.orderType ?? cur.orderType ?? undefined);
        break;
      case "order_type":
        press("order_type", intent.orderType ?? undefined);
        break;
      case "added":
        press("added_ok");
        break;
      case "upsell":
        press("upsell_no_thanks");
        if (more) press("add_more");
        break;
      case "review":
        if (more) press("add_more");
        break;
    }
    for (const { key, line } of queue) {
      // 되물을 때는 빠진 값이 있는 첫 줄만 들어간다(다 아는 줄을 먼저 담으면 다음 턴에 두 번 담길 수 있다)
      if (lead && key !== lead.key) throw new Stop();
      lineNo = typeof key === "number" ? key : undefined;
      addLine(line);
    }
    lineNo = undefined;

    if ((intent.checkout || intent.requestPayment) && cur.screen !== "review") {
      press("order_details");
      // 실제 키오스크처럼 추천 팝업이 뜨면 거절한다
      if (cur.screen === "upsell") press("upsell_no_thanks");
    }
  } catch (err) {
    if (lead && err instanceof Stop) return { kind: "clarify", missing, events };
    // 되물을 때 상태 기계가 거절하면 아무것도 누르지 않는다
    if (lead && err instanceof PlanError) return { kind: "clarify", missing, events: [] };
    if (err instanceof PlanError) return err.line === undefined ? { kind: "reject", reason: err.reason } : { kind: "reject", reason: err.reason, line: err.line };
    throw err;
  }

  if (lead) return { kind: "clarify", missing, events };
  return { kind: "plan", events, final: cur, paymentHandoff: !!intent.requestPayment, assumed, dropped };
}
