// 패스트푸드 고정 되묻기 문구(6개 언어). Spark 되묻기 문장이 다른 언어 문자를 섞었을 때 대신 쓴다.
// 담을 품목 이름(메뉴 데이터)을 넣어, 말한 것과 다른 상품으로 바꿔 담는 일이 휴대폰에서 보이게 한다.
// 메뉴 이름은 영어·한국어뿐이라(키오스크 화면과 같다) 한국어는 한국어 이름, 나머지 언어는 영어 이름을 쓴다.
import { langOf, type Lang } from "@/engine/turn";
import type { Draft, KioskState } from "./machine";
import { findItem } from "./menu";
import type { FastfoodIntent, IntentLine, Missing } from "./planner";

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
