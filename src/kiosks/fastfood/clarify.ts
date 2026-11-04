// 패스트푸드 고정 되묻기 문구(6개 언어). Spark 되묻기 문장이 다른 언어 문자를 섞었을 때 대신 쓴다.
// 담을 품목 이름(메뉴 데이터)을 넣어, 말한 것과 다른 상품으로 바꿔 담는 일이 휴대폰에서 보이게 한다.
// 메뉴 이름은 영어·한국어뿐이라(키오스크 화면과 같다) 한국어는 한국어 이름, 나머지 언어는 영어 이름을 쓴다.
import { langOf, type Lang } from "@/engine/turn";
import type { Draft, KioskState } from "./machine";
import { findItem } from "./menu";
import type { Answer } from "@/sync/link";
import { plan, type FastfoodIntent, type IntentLine, type Missing } from "./planner";

type Field = Missing["field"];
type Line = Pick<IntentLine, "menuId" | "mode" | "qty">;

const text: Record<Lang, { item: (name: string, mode: Line["mode"], qty: number) => string; sep: string; head: (items: string) => string; ask: Record<Field, string> }> = {
  en: {
    item: (n, m, q) => `${n}${m === "set" ? " meal" : m === "single" ? " (single)" : ""} ×${q}`,
    sep: ", ",
    head: (s) => `I'll add ${s}.`,
    ask: { orderType: "Eat in or take out?", mode: "Meal or single?", size: "Which size, M or L?", drink: "Which drink would you like?" },
  },
  ko: {
    item: (n, m, q) => `${n}${m === "set" ? " 세트" : m === "single" ? " 단품" : ""} ×${q}`,
    sep: ", ",
    head: (s) => `${s} 담을게요.`,
    ask: { orderType: "매장에서 드시나요, 포장하시나요?", mode: "세트로 할까요, 단품으로 할까요?", size: "사이즈는 M, L 중 무엇으로 할까요?", drink: "음료는 무엇으로 할까요?" },
  },
  ja: {
    item: (n, m, q) => `${n}${m === "set" ? " セット" : m === "single" ? " 単品" : ""} ×${q}`,
    sep: "、",
    head: (s) => `${s}をカートに入れます。`,
    ask: { orderType: "店内でお召し上がりですか、お持ち帰りですか？", mode: "セットにしますか、単品にしますか？", size: "サイズはM、Lのどちらにしますか？", drink: "お飲み物は何にしますか？" },
  },
  vi: {
    item: (n, m, q) => (m === "set" ? `combo ${n} ×${q}` : `${n}${m === "single" ? " (món lẻ)" : ""} ×${q}`),
    sep: ", ",
    head: (s) => `Tôi sẽ thêm ${s}.`,
    ask: { orderType: "Bạn ăn tại chỗ hay mang đi?", mode: "Bạn muốn combo hay món lẻ?", size: "Bạn chọn cỡ M hay L?", drink: "Bạn muốn uống gì?" },
  },
  zh: {
    item: (n, m, q) => `${n}${m === "set" ? " 套餐" : m === "single" ? " 单点" : ""} ×${q}`,
    sep: "、",
    head: (s) => `为您添加 ${s}。`,
    ask: { orderType: "请问是堂食还是外带？", mode: "要套餐还是单点？", size: "请问要M还是L？", drink: "请问饮料要哪一种？" },
  },
  es: {
    item: (n, m, q) => (m === "set" ? `menú ${n} ×${q}` : `${n}${m === "single" ? " solo" : ""} ×${q}`),
    sep: ", ",
    head: (s) => `Voy a añadir ${s}.`,
    ask: { orderType: "¿Para comer aquí o para llevar?", mode: "¿En menú o solo?", size: "¿Qué tamaño, M o L?", drink: "¿Qué bebida quiere?" },
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
  const k = d ? items.findIndex((i) => i.menuId === d.menuId && compatible(draftLine(d, pending.current), i)) : -1;
  const at = k >= 0 && m.line >= k ? m.line + 1 : m.line;
  return { items: items.map((l, i) => (i === at ? { ...l, ...patch } : l)) };
}

// 계획기(planner.ts의 currentLine·compatible)와 같은 판정. 고르다 멈춘 상품은 의도 속 같은 메뉴와 정한 값이 서로 다르지 않을 때만 합친다
const KEYS = ["mode", "size", "side", "drink"] as const;
const draftLine = (d: Draft, c: FastfoodIntent["current"] = {}) => Object.fromEntries(KEYS.map((k) => [k, c[k] ?? d[k] ?? undefined])) as Pick<IntentLine, (typeof KEYS)[number]>;
const compatible = (a: Pick<IntentLine, (typeof KEYS)[number]>, b: IntentLine) => KEYS.every((k) => !a[k] || !b[k] || a[k] === b[k]);

// missing: 계획기가 돌려준 빠진 칸. 품목은 고르다 멈춘 상품(화면) 다음에 의도 속 상품
export function clarifySay(missing: Missing[], intent: FastfoodIntent, state: KioskState, language: string) {
  const l = langOf(language);
  const t = text[l];
  let items = intent.items ?? [];
  let cur = intent.current;
  const d = intent.dropCurrent ? null : state.draft;
  if (d) {
    const k = items.findIndex((i) => i.menuId === d.menuId && compatible(draftLine(d, cur), i));
    if (k >= 0) {
      cur = { ...items[k], ...cur };
      items = items.filter((_, i) => i !== k);
    }
  }
  const lines: Line[] = [...(d ? [{ menuId: d.menuId, mode: cur?.mode ?? d.mode ?? undefined, qty: cur?.qty ?? d.qty }] : []), ...items];
  const names = lines.map((i) => t.item(findItem(i.menuId)?.name[l === "ko" ? "ko" : "en"] ?? i.menuId, i.mode, i.qty ?? 1));
  const asks = ORDER.filter((f) => missing.some((m) => m.field === f)).map((f) => t.ask[f]);
  // 일본어·중국어는 문장 사이에 공백을 두지 않는다
  return [...(names.length ? [t.head(names.join(t.sep))] : []), ...asks].join(l === "ja" || l === "zh" ? "" : " ");
}
