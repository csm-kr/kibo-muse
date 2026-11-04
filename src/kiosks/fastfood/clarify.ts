// 패스트푸드 고정 되묻기 문구(6개 언어). Spark 되묻기 문장이 다른 언어 문자를 섞었을 때 대신 쓴다.
// 담을 품목 이름(메뉴 데이터)을 넣어, 말한 것과 다른 상품으로 바꿔 담는 일이 휴대폰에서 보이게 한다.
// 메뉴 이름은 영어·한국어뿐이라(키오스크 화면과 같다) 한국어는 한국어 이름, 나머지 언어는 영어 이름을 쓴다.
import { langOf, type Lang } from "@/engine/turn";
import type { Draft, KioskState } from "./machine";
import { addOns, findItem } from "./menu";
import { ingredientName } from "./ui/strings";
import type { Answer } from "@/sync/link";
import { plan, type FastfoodIntent, type IntentLine, type Missing } from "./planner";

type Field = Missing["field"];
type Line = Pick<IntentLine, "menuId" | "mode" | "qty">;

// x: 2개 이상일 때만 붙이는 수량 표시(1개는 말하지 않는다)
const x = (q: number) => (q > 1 ? ` ×${q}` : "");

// ask: 빠진 칸이 하나일 때의 질문. noun·many: 여럿이면 질문 하나로 묶는다(11/4 판정: 질문 세 개를 늘어놓음)
// lead: 계획 앞에 말할 알아들은 내용. setName(이름, 사이즈, 사이드·음료), here: 매장·포장, none: 메뉴에 없는 말
const text: Record<
  Lang,
  {
    item: (name: string, mode: Line["mode"], qty: number) => string;
    sep: string;
    head: (items: string) => string;
    ask: Record<Field, string>;
    noun: Record<Field, string>;
    many: (nouns: string[]) => string;
    lead: { set: (name: string, size: string, parts: string[]) => string; qty: (s: string, q: number) => string; here: Record<"eat_in" | "take_out", string>; none: (names: string[]) => string; custom: (rm: string[], add: string[]) => string; end: string };
  }
> = {
  en: {
    item: (n, m, q) => `${n}${m === "set" ? " meal" : m === "single" ? " (single)" : ""}${x(q)}`,
    sep: ", ",
    head: (s) => `I'll add ${s}.`,
    ask: { orderType: "Eat in or take out?", mode: "Meal or single?", size: "Which size, M or L?", drink: "Which drink would you like?" },
    noun: { orderType: "eat in or take out", mode: "meal or single", size: "size (M or L)", drink: "drink" },
    many: (ns) => `Please tell me: ${ns.join(", ")}.`,
    lead: { set: (n, z, ps) => `${n} meal ${z} (${ps.join(", ")})`, qty: (s, q) => `${s}${x(q)}`, here: { eat_in: "eat in", take_out: "take out" }, none: (ns) => `${ns.join(", ")} ${ns.length > 1 ? "aren't" : "isn't"} on the menu.`, custom: (rm, ad) => [rm.length ? `without ${rm.join(" and ").toLowerCase()}` : "", ad.length ? `with ${ad.join(" and ").toLowerCase()}` : ""].filter(Boolean).join(", "), end: "." },
  },
  ko: {
    item: (n, m, q) => `${n}${m === "set" ? " 세트" : m === "single" ? " 단품" : ""}${x(q)}`,
    sep: ", ",
    head: (s) => `${s} 담을게요.`,
    ask: { orderType: "매장에서 드시나요, 포장하시나요?", mode: "세트로 할까요, 단품으로 할까요?", size: "사이즈는 M, L 중 무엇으로 할까요?", drink: "음료는 무엇으로 할까요?" },
    noun: { orderType: "매장·포장", mode: "세트·단품", size: "사이즈(M·L)", drink: "음료" },
    many: (ns) => `${ns.join(", ")}만 알려 주세요.`,
    lead: { set: (n, z, ps) => `${n} 세트 ${z}(${ps.join("·")})`, qty: (s, q) => (q > 1 ? `${s} ${q}개` : s), here: { eat_in: "매장 식사", take_out: "포장" }, none: (ns) => `${ns.join(", ")}${batchim(ns.at(-1)!) ? "은" : "는"} 메뉴에 없어요.`, custom: (rm, ad) => [rm.length ? `${rm.join("·")} 빼고` : "", ...ad].filter(Boolean).join(" "), end: "." },
  },
  ja: {
    item: (n, m, q) => `${n}${m === "set" ? " セット" : m === "single" ? " 単品" : ""}${x(q)}`,
    sep: "、",
    head: (s) => `${s}をカートに入れます。`,
    ask: { orderType: "店内でお召し上がりですか、お持ち帰りですか？", mode: "セットにしますか、単品にしますか？", size: "サイズはM、Lのどちらにしますか？", drink: "お飲み物は何にしますか？" },
    noun: { orderType: "店内かお持ち帰りか", mode: "セットか単品か", size: "サイズ（MかL）", drink: "お飲み物" },
    many: (ns) => `${ns.join("、")}を教えてください。`,
    lead: { set: (n, z, ps) => `${n} セット ${z}（${ps.join("・")}）`, qty: (s, q) => `${s}${x(q)}`, here: { eat_in: "店内", take_out: "お持ち帰り" }, none: (ns) => `${ns.join("、")}はメニューにありません。`, custom: (rm, ad) => `（${[rm.length ? `${rm.join("・")}抜き` : "", ad.length ? `${ad.join("・")}追加` : ""].filter(Boolean).join("、")}）`, end: "。" },
  },
  vi: {
    item: (n, m, q) => (m === "set" ? `combo ${n}${x(q)}` : `${n}${m === "single" ? " (món lẻ)" : ""}${x(q)}`),
    sep: ", ",
    head: (s) => `Tôi sẽ thêm ${s}.`,
    ask: { orderType: "Bạn ăn tại chỗ hay mang đi?", mode: "Bạn muốn combo hay món lẻ?", size: "Bạn chọn cỡ M hay L?", drink: "Bạn muốn uống gì?" },
    noun: { orderType: "ăn tại chỗ hay mang đi", mode: "combo hay món lẻ", size: "cỡ M hay L", drink: "đồ uống" },
    many: (ns) => `Cho tôi biết: ${ns.join(", ")}.`,
    lead: { set: (n, z, ps) => `combo ${n} ${z} (${ps.join(", ")})`, qty: (s, q) => `${s}${x(q)}`, here: { eat_in: "ăn tại chỗ", take_out: "mang đi" }, none: (ns) => `Thực đơn không có ${ns.join(", ")}.`, custom: (rm, ad) => [rm.length ? `không ${rm.join(", ")}` : "", ad.length ? `thêm ${ad.join(", ")}` : ""].filter(Boolean).join(", "), end: "." },
  },
  zh: {
    item: (n, m, q) => `${n}${m === "set" ? " 套餐" : m === "single" ? " 单点" : ""}${x(q)}`,
    sep: "、",
    head: (s) => `为您添加 ${s}。`,
    ask: { orderType: "请问是堂食还是外带？", mode: "要套餐还是单点？", size: "请问要M还是L？", drink: "请问饮料要哪一种？" },
    noun: { orderType: "堂食还是外带", mode: "套餐还是单点", size: "M还是L", drink: "饮料" },
    many: (ns) => `请告诉我：${ns.join("、")}。`,
    lead: { set: (n, z, ps) => `${n} 套餐 ${z}（${ps.join("、")}）`, qty: (s, q) => `${s}${x(q)}`, here: { eat_in: "堂食", take_out: "外带" }, none: (ns) => `菜单上没有${ns.join("、")}。`, custom: (rm, ad) => `（${[rm.length ? `不要${rm.join("、")}` : "", ad.length ? `加${ad.join("、")}` : ""].filter(Boolean).join("，")}）`, end: "。" },
  },
  es: {
    item: (n, m, q) => (m === "set" ? `menú ${n}${x(q)}` : `${n}${m === "single" ? " solo" : ""}${x(q)}`),
    sep: ", ",
    head: (s) => `Voy a añadir ${s}.`,
    ask: { orderType: "¿Para comer aquí o para llevar?", mode: "¿En menú o solo?", size: "¿Qué tamaño, M o L?", drink: "¿Qué bebida quiere?" },
    noun: { orderType: "para comer aquí o para llevar", mode: "menú o solo", size: "tamaño M o L", drink: "bebida" },
    many: (ns) => `Dígame: ${ns.join(", ")}.`,
    lead: { set: (n, z, ps) => `menú ${n} ${z} (${ps.join(", ")})`, qty: (s, q) => `${s}${x(q)}`, here: { eat_in: "para comer aquí", take_out: "para llevar" }, none: (ns) => `${ns.join(", ")} no ${ns.length > 1 ? "están" : "está"} en el menú.`, custom: (rm, ad) => [rm.length ? `sin ${rm.join(" ni ").toLowerCase()}` : "", ad.length ? `con ${ad.join(" y ").toLowerCase()}` : ""].filter(Boolean).join(", "), end: "." },
  },
};

const ORDER: Field[] = ["orderType", "mode", "size", "drink"];

// Spark 한국어 되묻기에서 영문 사이즈 글자 뒤 조사를 읽는 소리에 맞춘다(엘로, 엠으로). 11/4 회귀: "M으로 할까요 L으로 할까요?"
export const koParticles = (s: string) => s.replace(/L으로/g, "L로").replace(/M로/g, "M으로");

// 휴대폰 답 칩 종류: 되묻는 순서의 첫 빠진 칸. 음료는 고를 것이 많아 칩을 두지 않는다
export const answerKind = (missing: Missing[]) => {
  const f = ORDER.find((x) => missing.some((m) => m.field === x));
  return f === "drink" ? undefined : f;
};

// 칩 답(Spark 없음)을 의도 조각으로 바꾼다. mergeIntent(pending, 조각)이 다음 계획의 의도다.
// 지금 키오스크 상태에서 그 칸이 아직 빠져 있을 때만 만든다. 아니면(그새 사람이 골랐다 등) null → Spark 길.
// '그게 다예요'는 메뉴 화면에 담은 것이 있고 고르는 중인 상품이 없을 때만, 주문 확인까지(checkout. 결제 부탁은 넣지 않는다)
export function answerPatch(a: Answer, state: KioskState, pending: FastfoodIntent | undefined): FastfoodIntent | null {
  if (a.field === "more") return state.screen === "menu" && state.cart.length > 0 && !state.draft ? { checkout: true } : null;
  // 키오스크가 매장·포장 화면이면(인사에 [Order here]를 누름) 앞 의도가 없어도 그 답 하나로 계획한다
  if (a.field === "orderType" && state.screen === "order_type") return { orderType: a.value };
  if (!pending) return null;
  const p = plan(state, pending);
  const m = p.kind === "clarify" ? p.missing.find((x) => x.field === a.field) : undefined;
  if (!m) return null;
  if (m.field === "orderType") return { orderType: a.value as FastfoodIntent["orderType"] };
  const patch = { [a.field]: a.value };
  if (m.line === "current") return { current: { ...pending.current, ...patch } };
  // 계획기의 줄 번호는 고르다 멈춘 상품과 합친 의도 줄을 뺀 목록 기준이다(clarifySay와 같은 판정)
  const items = pending.items ?? [];
  const d = pending.dropCurrent ? null : state.draft;
  const k = d ? items.findIndex((i) => i.menuId === d.menuId && compatible(draftLine(d), i)) : -1;
  const at = k >= 0 && m.line >= k ? m.line + 1 : m.line;
  return { items: items.map((l, i) => (i === at ? { ...l, ...patch } : l)) };
}

// 계획기(planner.ts의 currentLine·compatible)와 같은 판정. 고르다 멈춘 상품은 의도 속 같은 메뉴와 화면에서 고른 값이 서로 다르지 않을 때만 합친다
const KEYS = ["mode", "size", "side", "drink"] as const;
const draftLine = (d: Draft) => Object.fromEntries(KEYS.map((k) => [k, d[k] ?? undefined])) as Pick<IntentLine, (typeof KEYS)[number]>;
const compatible = (a: Pick<IntentLine, (typeof KEYS)[number]>, b: IntentLine) => KEYS.every((k) => !a[k] || !b[k] || a[k] === b[k]);

// missing: 계획기가 돌려준 빠진 칸. 품목은 고르다 멈춘 상품(화면) 다음에 의도 속 상품
export function clarifySay(missing: Missing[], intent: FastfoodIntent, state: KioskState, language: string) {
  const l = langOf(language);
  const t = text[l];
  let items = intent.items ?? [];
  let cur = intent.current;
  const d = intent.dropCurrent ? null : state.draft;
  if (d) {
    const k = items.findIndex((i) => i.menuId === d.menuId && compatible(draftLine(d), i));
    if (k >= 0) {
      cur = { ...items[k], ...cur };
      items = items.filter((_, i) => i !== k);
    }
  }
  const lines: Line[] = [...(d ? [{ menuId: d.menuId, mode: cur?.mode ?? d.mode ?? undefined, qty: cur?.qty ?? d.qty }] : []), ...items];
  const names = lines.map((i) => t.item(findItem(i.menuId)?.name[l === "ko" ? "ko" : "en"] ?? i.menuId, i.mode, i.qty ?? 1));
  const fields = ORDER.filter((f) => missing.some((m) => m.field === f));
  const asks = fields.length > 1 ? [t.many(fields.map((f) => t.noun[f]))] : fields.map((f) => t.ask[f]);
  // 일본어·중국어는 문장 사이에 공백을 두지 않는다
  return [...(names.length ? [t.head(names.join(t.sep))] : []), ...asks].join(l === "ja" || l === "zh" ? "" : " ");
}

// 한국어 받침 유무(은/는). 한글이 아니면(영문 이름 등) 받침 없음으로 본다
const batchim = (w: string) => {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
};

// 계획 앞에 말할 알아들은 내용: 이번 계획으로 담기는 줄(before → final 장바구니 차이)과 새로 정한 매장·포장.
// 메뉴에 없는 말(unknown)은 먼저 없다고 한다(11/4 판정: 사이다를 말없이 레몬 소다로 담음). 담는 것도 정한 것도 없으면 빈 문자열
export function orderLead(before: KioskState, final: KioskState, language: string, unknown: string[]) {
  const l = langOf(language);
  const t = text[l];
  const name = (id: string | null) => (id ? (findItem(id)?.name[l === "ko" ? "ko" : "en"] ?? id) : "");
  const parts = final.cart.flatMap((line, i) => {
    const q = line.qty - (before.cart[i]?.menuId === line.menuId ? before.cart[i].qty : 0);
    if (q <= 0) return [];
    const set = line.mode === "set" && line.size ? t.lead.set(name(line.menuId), line.size, [name(line.side), name(line.drink)].filter(Boolean)) : name(line.menuId);
    // 뺀 재료·추가(11/4 판정: "피클 빼고"가 되말하기에 없음). 재료 이름은 한국어·영어만 있다
    const nl = l === "ko" ? "ko" : "en";
    const rm = line.remove.map((id) => ingredientName[id]?.[nl] ?? id);
    const ad = line.add.map((id) => addOns.find((a) => a.id === id)?.name[nl] ?? id);
    const base = rm.length || ad.length ? `${set}${l === "ja" || l === "zh" ? "" : " "}${t.lead.custom(rm, ad)}` : set;
    return [t.lead.qty(base, q)];
  });
  if (final.orderType && final.orderType !== before.orderType) parts.push(t.lead.here[final.orderType]);
  const sep = l === "ja" || l === "zh" ? "" : " ";
  const said = parts.length ? `${parts.join(l === "ja" || l === "zh" ? "、" : ", ")}${t.lead.end}` : "";
  return [unknown.length ? t.lead.none(unknown) : "", said].filter(Boolean).join(sep);
}
