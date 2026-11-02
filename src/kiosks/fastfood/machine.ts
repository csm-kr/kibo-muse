// 패스트푸드 키오스크 상태 기계.
// 사람이 누르는 터치와 KIBO가 대신 누르는 동작이 모두 이 함수 하나를 거친다.
// 화면마다 누를 수 있는 버튼이 정해져 있고, 결제는 사람만 누를 수 있다.

import { REQUIRED_INGREDIENTS, addOns, findItem, isBurger, itemsIn, type CategoryId, type Lang, type Size } from "./menu";

export type Screen =
  | "idle"
  | "order_type"
  | "menu"
  | "set_choice"
  | "set_size"
  | "set_side"
  | "set_drink"
  | "confirm"
  | "customize"
  | "added"
  | "upsell"
  | "review"
  | "payment";

export type Target =
  | "start"
  | "language"
  | "order_type"
  | "category"
  | "item"
  | "set_choice"
  | "size"
  | "side"
  | "drink"
  | "customize"
  | "toggle_ingredient"
  | "toggle_addon"
  | "customize_done"
  | "qty_plus"
  | "qty_minus"
  | "add_to_cart"
  | "cancel"
  | "added_ok"
  | "order_details"
  | "upsell_no_thanks"
  | "upsell_add"
  | "add_more"
  | "remove_line"
  | "pay"
  | "start_over";

export interface KioskEvent {
  by: "touch" | "kibo";
  target: Target;
  value?: string;
}

export interface Draft {
  menuId: string;
  mode: "set" | "single" | null;
  size: Size | null;
  side: string | null;
  drink: string | null;
  remove: string[];
  add: string[];
  qty: number;
}

export interface CartLine {
  menuId: string;
  mode: "set" | "single";
  size: Size | null;
  side: string | null;
  drink: string | null;
  remove: string[];
  add: string[];
  qty: number;
  unitPrice: number;
}

export interface KioskState {
  screen: Screen;
  lang: Lang;
  orderType: "eat_in" | "take_out" | null;
  category: CategoryId;
  draft: Draft | null;
  cart: CartLine[];
  upsellShown: boolean;
}

export type StepResult = { ok: true; state: KioskState } | { ok: false; error: string };

export const MAX_QTY = 10;

export function initialState(lang: Lang = "en"): KioskState {
  return { screen: "idle", lang, orderType: null, category: "recommended", draft: null, cart: [], upsellShown: false };
}

// 화면마다 누를 수 있는 버튼. 실제 키오스크처럼 지금 화면에 없는 버튼은 누를 수 없다.
const allowed: Record<Screen, Target[]> = {
  idle: ["start", "language"],
  order_type: ["order_type", "language", "start_over"],
  menu: ["category", "item", "order_details", "start_over"],
  set_choice: ["set_choice", "cancel", "start_over"],
  set_size: ["size", "cancel", "start_over"],
  set_side: ["side", "cancel", "start_over"],
  set_drink: ["drink", "cancel", "start_over"],
  confirm: ["customize", "qty_plus", "qty_minus", "add_to_cart", "cancel", "start_over"],
  customize: ["toggle_ingredient", "toggle_addon", "customize_done"],
  added: ["added_ok"],
  upsell: ["upsell_no_thanks", "upsell_add"],
  review: ["pay", "add_more", "remove_line", "start_over"],
  payment: ["start_over"],
};

export function unitPrice(d: Draft): number {
  const item = findItem(d.menuId);
  if (!item) throw new Error(`unknown item ${d.menuId}`);
  let price = item.price;
  if (d.mode === "set" && isBurger(item) && d.size) {
    price = item.setPrice[d.size];
    price += (findItem(d.side ?? "") as { setUpcharge?: number } | undefined)?.setUpcharge ?? 0;
    price += (findItem(d.drink ?? "") as { setUpcharge?: number } | undefined)?.setUpcharge ?? 0;
  }
  for (const a of d.add) price += addOns.find((x) => x.id === a)?.price ?? 0;
  return price;
}

const fail = (error: string): StepResult => ({ ok: false, error });
const ok = (state: KioskState): StepResult => ({ ok: true, state });

function setChoiceItem(id: string | undefined, category: "sides" | "drinks") {
  const item = id ? findItem(id) : undefined;
  if (!item || isBurger(item) || item.category !== category || item.setUpcharge === null) return null;
  return item;
}

export function step(s: KioskState, e: KioskEvent): StepResult {
  if (e.target === "pay" && e.by !== "touch") return fail("payment_requires_human");
  if (!allowed[s.screen].includes(e.target)) return fail(`not_on_screen:${s.screen}`);

  const d = s.draft;
  switch (e.target) {
    case "start":
      return ok({ ...s, screen: "order_type" });

    case "language":
      if (e.value !== "en" && e.value !== "ko") return fail("bad_language");
      return ok({ ...s, lang: e.value });

    case "order_type":
      if (e.value !== "eat_in" && e.value !== "take_out") return fail("bad_order_type");
      return ok({ ...s, orderType: e.value, screen: "menu", category: "recommended" });

    case "category": {
      const ids: CategoryId[] = ["recommended", "burgers", "sides", "drinks", "desserts"];
      if (!ids.includes(e.value as CategoryId)) return fail("bad_category");
      return ok({ ...s, category: e.value as CategoryId });
    }

    case "item": {
      const item = itemsIn(s.category).find((i) => i.id === e.value);
      if (!item) return fail("item_not_visible");
      const draft: Draft = { menuId: item.id, mode: null, size: null, side: null, drink: null, remove: [], add: [], qty: 1 };
      if (isBurger(item)) return ok({ ...s, draft, screen: "set_choice" });
      return ok({ ...s, draft: { ...draft, mode: "single" }, screen: "confirm" });
    }

    case "set_choice":
      if (!d) return fail("no_draft");
      if (e.value === "set") return ok({ ...s, draft: { ...d, mode: "set" }, screen: "set_size" });
      if (e.value === "single") return ok({ ...s, draft: { ...d, mode: "single" }, screen: "confirm" });
      return fail("bad_set_choice");

    case "size":
      if (!d) return fail("no_draft");
      if (e.value !== "M" && e.value !== "L") return fail("bad_size");
      return ok({ ...s, draft: { ...d, size: e.value }, screen: "set_side" });

    case "side": {
      if (!d) return fail("no_draft");
      const side = setChoiceItem(e.value, "sides");
      if (!side) return fail("bad_side");
      return ok({ ...s, draft: { ...d, side: side.id }, screen: "set_drink" });
    }

    case "drink": {
      if (!d) return fail("no_draft");
      const drink = setChoiceItem(e.value, "drinks");
      if (!drink) return fail("bad_drink");
      return ok({ ...s, draft: { ...d, drink: drink.id }, screen: "confirm" });
    }

    case "customize": {
      const item = d && findItem(d.menuId);
      if (!item || !isBurger(item)) return fail("not_customizable");
      return ok({ ...s, screen: "customize" });
    }

    case "toggle_ingredient": {
      const item = d && findItem(d.menuId);
      if (!d || !item || !isBurger(item) || !e.value || !item.ingredients.includes(e.value)) return fail("bad_ingredient");
      if (REQUIRED_INGREDIENTS.includes(e.value)) return fail("ingredient_required");
      const remove = d.remove.includes(e.value) ? d.remove.filter((x) => x !== e.value) : [...d.remove, e.value];
      return ok({ ...s, draft: { ...d, remove } });
    }

    case "toggle_addon": {
      if (!d || !addOns.some((a) => a.id === e.value)) return fail("bad_addon");
      const add = d.add.includes(e.value!) ? d.add.filter((x) => x !== e.value) : [...d.add, e.value!];
      return ok({ ...s, draft: { ...d, add } });
    }

    case "customize_done":
      return ok({ ...s, screen: "confirm" });

    case "qty_plus":
      if (!d) return fail("no_draft");
      if (d.qty >= MAX_QTY) return fail("qty_limit");
      return ok({ ...s, draft: { ...d, qty: d.qty + 1 } });

    case "qty_minus":
      if (!d) return fail("no_draft");
      if (d.qty <= 1) return fail("qty_min");
      return ok({ ...s, draft: { ...d, qty: d.qty - 1 } });

    case "add_to_cart": {
      if (!d || !d.mode) return fail("no_draft");
      if (d.mode === "set" && (!d.size || !d.side || !d.drink)) return fail("set_incomplete");
      const line: CartLine = {
        menuId: d.menuId,
        mode: d.mode,
        size: d.size,
        side: d.side,
        drink: d.drink,
        remove: d.remove,
        add: d.add,
        qty: d.qty,
        unitPrice: unitPrice(d),
      };
      return ok({ ...s, cart: [...s.cart, line], draft: null, screen: "added" });
    }

    case "cancel":
      return ok({ ...s, draft: null, screen: "menu" });

    case "added_ok":
      return ok({ ...s, screen: "menu" });

    case "order_details":
      if (s.cart.length === 0) return fail("cart_empty");
      // 실제 키오스크처럼 결제 전에 추천 팝업이 한 번 뜬다.
      if (!s.upsellShown) return ok({ ...s, screen: "upsell", upsellShown: true });
      return ok({ ...s, screen: "review" });

    case "upsell_no_thanks":
      return ok({ ...s, screen: "review" });

    case "upsell_add": {
      const item = e.value ? findItem(e.value) : undefined;
      if (!item || item.category !== "desserts") return fail("bad_upsell_item");
      const line: CartLine = { menuId: item.id, mode: "single", size: null, side: null, drink: null, remove: [], add: [], qty: 1, unitPrice: item.price };
      return ok({ ...s, cart: [...s.cart, line], screen: "review" });
    }

    case "add_more":
      return ok({ ...s, screen: "menu" });

    case "remove_line": {
      const i = Number(e.value);
      if (!Number.isInteger(i) || i < 0 || i >= s.cart.length) return fail("bad_line");
      const cart = s.cart.filter((_, j) => j !== i);
      return ok({ ...s, cart, screen: cart.length ? "review" : "menu" });
    }

    case "pay":
      return ok({ ...s, screen: "payment" });

    case "start_over":
      return ok(initialState(s.lang));
  }
}
