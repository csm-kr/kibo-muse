// 사용자의 말을 패스트푸드 주문 의도로 바꾼다 (Muse Spark 구조화 출력).
// 메뉴 id는 enum으로 묶어 메뉴에 없는 값을 만들지 못하게 하고,
// 메뉴에 없는 상품은 비슷한 상품으로 바꾸지 말고 unknownItems에 그대로 적게 한다.

import { sparkJson, type SparkOptions } from "@/engine/spark";
import type { KioskState } from "./machine";
import { addOns, burgers, findItem, simpleItems } from "./menu";
import type { FastfoodIntent, IntentLine } from "./planner";

const NONE = "none";
const setSides = simpleItems.filter((i) => i.category === "sides" && i.setUpcharge !== null);
const setDrinks = simpleItems.filter((i) => i.category === "drinks" && i.setUpcharge !== null);
const allIngredients = [...new Set(burgers.flatMap((b) => b.ingredients))].filter((x) => x !== "bun" && x !== "patty");

const lineSchema = {
  type: "object",
  properties: {
    menuId: { type: "string", enum: [...burgers, ...simpleItems].map((i) => i.id) },
    mode: { type: "string", enum: ["set", "single", NONE] },
    size: { type: "string", enum: ["M", "L", NONE] },
    side: { type: "string", enum: [...setSides.map((i) => i.id), NONE] },
    drink: { type: "string", enum: [...setDrinks.map((i) => i.id), NONE] },
    remove: { type: "array", items: { type: "string", enum: allIngredients } },
    addOns: { type: "array", items: { type: "string", enum: addOns.map((a) => a.id) } },
    qty: { type: "integer" },
  },
  required: ["menuId", "mode", "size", "side", "drink", "remove", "addOns", "qty"],
};

export const intentSchema = {
  type: "object",
  properties: {
    orderType: { type: "string", enum: ["eat_in", "take_out", NONE] },
    items: { type: "array", items: lineSchema },
    unknownItems: { type: "array", items: { type: "string" } },
    checkout: { type: "boolean" },
    requestPayment: { type: "boolean" },
    replyLanguage: { type: "string" },
    say: { type: "string" },
  },
  required: ["orderType", "items", "unknownItems", "checkout", "requestPayment", "replyLanguage", "say"],
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
  unknownItems: string[];
  checkout: boolean;
  requestPayment: boolean;
  replyLanguage: string;
  say: string;
}

export interface InterpretResult {
  intent: FastfoodIntent;
  unknownItems: string[];
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
- items = only new items. replyLanguage = BCP-47 code of the customer's language.
- say = short, in replyLanguage. Missing required info → one question for all of it. Otherwise confirm (mention fries if unsaid, items not on menu, and that they tap Pay if asked).`;

function summarize(state: KioskState): string {
  const cart = state.cart.map((l) => `${l.qty}x ${findItem(l.menuId)?.name.en} (${l.mode}${l.size ? " " + l.size : ""})`).join(", ");
  return `Kiosk now: screen=${state.screen}; orderType=${state.orderType ?? "not chosen"}; cart=[${cart}]`;
}

const opt = <T extends string>(v: string): T | undefined => (v === NONE || v == null ? undefined : (v as T));

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
    line.qty = Math.max(1, l.qty || 1);
    return line;
  });
  const intent: FastfoodIntent = { items, checkout: raw.checkout, requestPayment: raw.requestPayment };
  const orderType = opt<"eat_in" | "take_out">(raw.orderType);
  if (orderType) intent.orderType = orderType;
  return intent;
}

export async function interpret(utterance: string, state: KioskState, opts: SparkOptions = {}): Promise<InterpretResult> {
  const user = `${summarize(state)}\nCustomer said: ${utterance}`;
  const r = await sparkJson<RawIntent>(SYSTEM, user, "FastfoodIntent", intentSchema, opts);
  return { intent: toIntent(r.json), unknownItems: r.json.unknownItems ?? [], replyLanguage: r.json.replyLanguage, say: r.json.say, ms: r.ms, usage: r.usage };
}
