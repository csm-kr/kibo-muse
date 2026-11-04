// 사용자의 말을 패스트푸드 주문 의도로 바꾼다 (Muse Spark 구조화 출력).
// 메뉴 id는 enum으로 묶어 메뉴에 없는 값을 만들지 못하게 하고,
// 메뉴에 없는 상품은 비슷한 상품으로 바꾸지 말고 unknownItems에 그대로 적게 한다.

import { sparkJson, type SparkOptions } from "@/engine/spark";
import type { Draft, KioskState } from "./machine";
import { addOns, burgers, findItem, isBurger, simpleItems } from "./menu";
import type { FastfoodIntent, IntentLine } from "./planner";

const NONE = "none";
const setSides = simpleItems.filter((i) => i.category === "sides" && i.setUpcharge !== null);
const setDrinks = simpleItems.filter((i) => i.category === "drinks" && i.setUpcharge !== null);
const allIngredients = [...new Set(burgers.flatMap((b) => b.ingredients))].filter((x) => x !== "bun" && x !== "patty");

const lineFields = {
    mode: { type: "string", enum: ["set", "single", NONE] },
    size: { type: "string", enum: ["M", "L", NONE] },
    side: { type: "string", enum: [...setSides.map((i) => i.id), NONE] },
    drink: { type: "string", enum: [...setDrinks.map((i) => i.id), NONE] },
    remove: { type: "array", items: { type: "string", enum: allIngredients } },
    addOns: { type: "array", items: { type: "string", enum: addOns.map((a) => a.id) } },
    qty: { type: "integer" },
};
const lineSchema = {
  type: "object",
  properties: { menuId: { type: "string", enum: [...burgers, ...simpleItems].map((i) => i.id) }, ...lineFields },
  required: ["menuId", ...Object.keys(lineFields)],
};
// 사람이 화면에서 고르다 멈춘 상품에 대한 말
const currentSchema = { type: "object", properties: lineFields, required: Object.keys(lineFields) };

export const intentSchema = {
  type: "object",
  properties: {
    orderType: { type: "string", enum: ["eat_in", "take_out", NONE] },
    items: { type: "array", items: lineSchema },
    current: currentSchema,
    dropCurrent: { type: "boolean" },
    unknownItems: { type: "array", items: { type: "string" } },
    checkout: { type: "boolean" },
    requestPayment: { type: "boolean" },
    // 담긴 줄 바꾸기·빼기·주문 취소는 KIBO가 하지 않는다. 이런 요청이면 서버가 거절하고 고정 문구로 답한다
    unsupported: { type: "string", enum: [NONE, "change_cart_item", "remove_cart_item", "cancel_order"] },
    replyLanguage: { type: "string" },
    say: { type: "string" },
  },
  required: ["orderType", "items", "current", "dropCurrent", "unknownItems", "checkout", "requestPayment", "unsupported", "replyLanguage", "say"],
};

// 화면에 고르던 상품이 없으면 current·dropCurrent는 늘 none·false다(계획기도 쓰지 않는다). 그 칸을 빼면
// Spark 출력이 약 100토큰 줄어 요청 하나가 1초 남짓 빨라진다(11/4 측정: 출력 653→371자, 단일 요청 p50 8.5→7.3초)
const DRAFT_ONLY = ["current", "dropCurrent"];
const noDraftSchema = {
  ...intentSchema,
  properties: Object.fromEntries(Object.entries(intentSchema.properties).filter(([k]) => !DRAFT_ONLY.includes(k))),
  required: intentSchema.required.filter((k) => !DRAFT_ONLY.includes(k)),
};

interface RawLine {
  menuId: string;
  mode: string;
  size: string;
  side: string;
  drink: string;
  remove: string[];
  addOns: string[];
  qty: number;
}

interface RawIntent {
  orderType: string;
  items: RawLine[];
  current?: Omit<RawLine, "menuId">;
  dropCurrent?: boolean;
  unknownItems: string[];
  checkout: boolean;
  requestPayment: boolean;
  unsupported?: string;
  replyLanguage: string;
  say: string;
}

export interface InterpretResult {
  intent: FastfoodIntent;
  unknownItems: string[];
  // none이 아니면 KIBO가 하지 않는 요청(담긴 줄 바꾸기·빼기·주문 취소)
  unsupported: string;
  replyLanguage: string;
  say: string;
  ms: number;
  usage?: unknown;
}

// 메뉴판은 고정 부분이라 프롬프트 맨 앞에 두어 캐시를 탄다
const catalog = [
  "BURGERS (id | English | Korean | single ₩ | set M ₩ | set L ₩ | ingredients)",
  ...burgers.map((b) => `${b.id} | ${b.name.en} | ${b.name.ko} | ${b.price} | ${b.setPrice.M} | ${b.setPrice.L} | ${b.ingredients.join(",")}`),
  "OTHER ITEMS (id | category | English | Korean | ₩ | set upcharge or n/a)",
  ...simpleItems.map((i) => `${i.id} | ${i.category} | ${i.name.en} | ${i.name.ko} | ${i.price} | ${i.setUpcharge ?? "n/a"}`),
  "ADD-ONS: " + addOns.map((a) => `${a.id} (${a.name.en}, +${a.price})`).join("; "),
].join("\n");

const SYSTEM = `You are KIBO, the voice ordering assistant of the "Bridge Burger" self-order kiosk.
Convert the customer's words into the JSON schema. The server validates and operates the kiosk; you only extract intent.

MENU
${catalog}

RULES
- Map words in any language to menu ids. Unsaid → "none". Not on menu → unknownItems, never substitute.
- Set/meal/combo = burger + side + drink; unsaid side means fries. remove = leave out; addOns = paid extras.
- Required: orderType unless already chosen; set or single per burger; size and drink per set.
- checkout = customer is done. requestPayment = asks you to pay (you can't; they tap Pay).
- items = only new items. qty = the exact number the customer said, even above 10. Never lower or cap it; the server refuses it and tells the customer.
- You cannot change or remove items already in the cart or cancel the order. If asked, set unsupported, leave items empty, and never say you did it. Otherwise unsupported = "none".
- "N in total" / "make it N" for an item already in the cart = add only the difference (N minus what is in the cart) as new items. This is an add, not a change. If the difference is 0 or less (they want fewer), that is a change: set unsupported.
- replyLanguage = BCP-47 code of the customer's language.
- If an item is in progress on screen, words about it (set or single, size, side, drink, remove, extras, quantity) go in current, not items. dropCurrent = the customer wants to cancel that item. Otherwise current is all "none"/[]/0 and dropCurrent false.
- If you asked a question last turn and the customer answers it, return those pending items again in items with the answers filled in.
- say describes only what is in this JSON. Never claim an action you did not encode.
- say = short, in replyLanguage. Missing required info → one question for all of it. Otherwise state what you added, as a statement, not a question (mention fries if unsaid, items not on menu, and that they tap Pay if asked).`;

function draftText(d: Draft) {
  const item = findItem(d.menuId);
  const parts = [item?.name.en ?? d.menuId];
  if (item && isBurger(item)) {
    parts.push(d.mode ?? "set or single ?");
    if (d.mode === "set") parts.push(`size ${d.size ?? "?"}`, `side ${d.side ?? "?"}`, `drink ${d.drink ?? "?"}`);
  }
  if (d.remove.length) parts.push(`without ${d.remove.join(" and ")}`);
  if (d.add.length) parts.push(`plus ${d.add.join(" and ")}`);
  if (d.qty > 1) parts.push(`qty ${d.qty}`);
  return parts.join(", ");
}

function summarize(state: KioskState, pending: FastfoodIntent | undefined): string {
  const cart = state.cart.map((l) => `${l.qty}x ${findItem(l.menuId)?.name.en} (${l.mode}${l.size ? " " + l.size : ""})`).join(", ");
  const lines = [`Kiosk now: screen=${state.screen}; orderType=${state.orderType ?? "not chosen"}; cart=[${cart}]`];
  if (state.draft) lines.push(`In progress on screen (not in cart yet): ${draftText(state.draft)}`);
  if (pending && Object.keys(pending).length) lines.push(`Asked a question last turn about: ${JSON.stringify(pending)}`);
  return lines.join("\n");
}

const opt = <T extends string>(v: string): T | undefined => (v === NONE || v == null ? undefined : (v as T));

function toCurrent(c: Omit<RawLine, "menuId">): FastfoodIntent["current"] {
  const out: NonNullable<FastfoodIntent["current"]> = {};
  const mode = opt<"set" | "single">(c.mode);
  const size = opt<"M" | "L">(c.size);
  const side = opt<string>(c.side);
  const drink = opt<string>(c.drink);
  if (mode) out.mode = mode;
  if (size) out.size = size;
  if (side) out.side = side;
  if (drink) out.drink = drink;
  if (c.remove?.length) out.remove = c.remove;
  if (c.addOns?.length) out.addOns = c.addOns;
  if (c.qty > 0) out.qty = c.qty;
  return Object.keys(out).length ? out : undefined;
}

function toIntent(raw: RawIntent): FastfoodIntent {
  const items: IntentLine[] = raw.items.map((l) => {
    const line: IntentLine = { menuId: l.menuId };
    const mode = opt<"set" | "single">(l.mode);
    const size = opt<"M" | "L">(l.size);
    const side = opt<string>(l.side);
    const drink = opt<string>(l.drink);
    if (mode) line.mode = mode;
    if (size) line.size = size;
    if (side) line.side = side;
    if (drink) line.drink = drink;
    line.remove = l.remove ?? [];
    line.addOns = l.addOns ?? [];
    // 말하지 않은 수량(0)은 1개. 10개를 넘으면 계획기가 거절한다
    line.qty = l.qty > 0 ? l.qty : 1;
    return line;
  });
  const intent: FastfoodIntent = { items, checkout: raw.checkout, requestPayment: raw.requestPayment };
  const current = raw.current ? toCurrent(raw.current) : undefined;
  if (current) intent.current = current;
  if (raw.dropCurrent) intent.dropCurrent = true;
  const orderType = opt<"eat_in" | "take_out">(raw.orderType);
  if (orderType) intent.orderType = orderType;
  return intent;
}

export async function interpret(utterance: string, state: KioskState, pending?: FastfoodIntent, opts: SparkOptions = {}): Promise<InterpretResult> {
  const user = `${summarize(state, pending)}\nCustomer said: ${utterance}`;
  const r = await sparkJson<RawIntent>(SYSTEM, user, "FastfoodIntent", state.draft ? intentSchema : noDraftSchema, opts);
  return { intent: toIntent(r.json), unknownItems: r.json.unknownItems ?? [], unsupported: r.json.unsupported ?? NONE, replyLanguage: r.json.replyLanguage, say: r.json.say, ms: r.ms, usage: r.usage };
}
