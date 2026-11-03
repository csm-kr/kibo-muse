// 결정적 장면에서 사람이 읽는 이름: Spark가 알아들은 것(의도 칩)과 휴대폰에 보일 단계 이름.

import { langOf, type Lang as PhoneLang } from "@/engine/turn";
import type { CartLine, Draft, Screen } from "../machine";
import { addOns, findItem, type Lang as KioskLang } from "../menu";
import type { FastfoodIntent, IntentLine } from "../planner";
import { ingredientName, t } from "./strings";

export interface Chip {
  text: string;
  tone: "normal" | "blocked";
}

const name = (id: string) => findItem(id)?.name.en ?? id;

function lineChips(l: Omit<IntentLine, "menuId"> & { menuId?: string }): string[] {
  const out: string[] = [];
  if (l.menuId) out.push(`${name(l.menuId)}${l.mode === "set" ? ` · ${l.size ?? "?"} set` : ""}${(l.qty ?? 1) > 1 ? ` ×${l.qty}` : ""}`);
  else if (l.size) out.push(l.size);
  if (l.side) out.push(name(l.side));
  if (l.drink) out.push(name(l.drink));
  for (const r of l.remove ?? []) out.push(`No ${ingredientName[r]?.en ?? r}`);
  for (const a of l.addOns ?? []) out.push(`+ ${addOns.find((x) => x.id === a)?.name.en ?? a}`);
  return out;
}

// lang: 키오스크 화면 언어. 칩은 영어지만 버튼 이름만 키오스크 화면 글자 그대로 쓴다(한국어 키오스크면 '결제하기')
export function intentChips(intent: FastfoodIntent, endScreen: Screen | null, lang: KioskLang): Chip[] {
  const texts = [
    ...(intent.orderType ? [intent.orderType === "eat_in" ? "Eat in" : "Take out"] : []),
    ...(intent.current ? lineChips(intent.current) : []),
    ...(intent.items ?? []).flatMap(lineChips),
  ];
  const chips: Chip[] = texts.map((text) => ({ text, tone: "normal" }));
  if (endScreen === "review") chips.push({ text: `${t.pay[lang]} → blocked. You tap ${t.pay[lang]}`, tone: "blocked" });
  return chips;
}

// 휴대폰 상태 줄의 단계 이름(휴대폰의 6개 언어). {b}는 키오스크 결제 버튼의 화면 글자(t.pay, 키오스크 언어 그대로)로 바꿔 쓴다
export const screenLabel: Record<Screen, Record<PhoneLang, string>> = {
  idle: { en: "Welcome screen", ko: "첫 화면", ja: "スタート画面", vi: "Màn hình chào", zh: "欢迎页面", es: "Pantalla de inicio" },
  order_type: { en: "Eat in or take out", ko: "매장·포장 고르기", ja: "店内か持ち帰り", vi: "Ăn tại chỗ hay mang đi", zh: "堂食或外带", es: "Comer aquí o para llevar" },
  menu: { en: "Menu", ko: "메뉴", ja: "メニュー", vi: "Thực đơn", zh: "菜单", es: "Menú" },
  set_choice: { en: "Set or single", ko: "세트·단품 고르기", ja: "セットか単品", vi: "Combo hay món lẻ", zh: "套餐或单点", es: "Menú o solo" },
  set_size: { en: "Set size", ko: "세트 크기 고르기", ja: "セットのサイズ", vi: "Cỡ combo", zh: "套餐大小", es: "Tamaño del menú" },
  set_side: { en: "Choosing a side", ko: "사이드 고르기", ja: "サイドを選ぶ", vi: "Chọn món phụ", zh: "选择小食", es: "Elegir acompañamiento" },
  set_drink: { en: "Choosing a drink", ko: "음료 고르기", ja: "ドリンクを選ぶ", vi: "Chọn đồ uống", zh: "选择饮料", es: "Elegir bebida" },
  confirm: { en: "Checking the item", ko: "담기 전 확인", ja: "商品の確認", vi: "Kiểm tra món", zh: "确认商品", es: "Revisar el producto" },
  customize: { en: "Ingredients", ko: "재료 빼기·추가", ja: "具材の変更", vi: "Thành phần", zh: "配料", es: "Ingredientes" },
  added: { en: "Added to cart", ko: "담기 완료", ja: "カートに追加", vi: "Đã thêm vào giỏ", zh: "已加入购物车", es: "Añadido al pedido" },
  upsell: { en: "Dessert offer", ko: "디저트 추천", ja: "デザートのおすすめ", vi: "Gợi ý tráng miệng", zh: "甜点推荐", es: "Oferta de postre" },
  review: { en: "Order review · you tap [{b}]", ko: "주문 확인 · 결제는 직접", ja: "注文の確認 · お支払いはご自身で", vi: "Xem lại đơn · bạn tự bấm [{b}]", zh: "确认订单 · 请您自己点［{b}］", es: "Revisar pedido · tú pulsas [{b}]" },
  payment: { en: "Payment", ko: "결제", ja: "お支払い", vi: "Thanh toán", zh: "支付", es: "Pago" },
};

// 휴대폰 상태 줄의 요약: 장바구니 품목 수와 합계(휴대폰 언어). 금액 표기는 키오스크 화면과 같게 ₩와 쉼표
const summaryText: Record<PhoneLang, (n: number) => string> = {
  en: (n) => `${n} item(s)`,
  ko: (n) => `${n}개`,
  ja: (n) => `${n}点`,
  vi: (n) => `${n} món`,
  zh: (n) => `${n} 件`,
  es: (n) => `${n} producto(s)`,
};
// current: 담는 중이거나 마지막에 담은 품목 이름. 사람이 휴대폰에서 바뀐 품목(다른 버거 등)을 알아채게 앞에 붙인다
export const statusSummary = (items: number, total: number, language: string, current?: string) =>
  `${current ? `${current} · ` : ""}${summaryText[langOf(language)](items)} · ₩${total.toLocaleString("en-US")}`;

// 휴대폰에 보이는 품목 이름. 키오스크 화면 글자 그대로(키오스크 언어) 써서 사람이 화면에서 바로 찾게 한다. 주문 확인 화면과 같은 꼴: 이름 사이즈 세트
export function lineName(line: Pick<Draft, "menuId" | "mode" | "size">, kioskLang: KioskLang) {
  const name = findItem(line.menuId)?.name[kioskLang] ?? line.menuId;
  return line.mode === "set" ? [name, line.size, t.set[kioskLang]].filter(Boolean).join(" ") : name;
}

// 휴대폰 주문 확인 카드의 품목 줄: 이름, 세트 구성·뺀 재료·추가, 수량
export const orderLines = (cart: CartLine[], kioskLang: KioskLang) =>
  cart.map((l) => ({
    name: lineName(l, kioskLang),
    detail: [
      ...(l.mode === "set" ? [l.side, l.drink].map((id) => (id ? findItem(id)?.name[kioskLang] : undefined)) : []),
      l.remove.length ? `− ${l.remove.map((r) => ingredientName[r]?.[kioskLang] ?? r).join(", ")}` : undefined,
      l.add.length ? `+ ${l.add.map((a) => addOns.find((x) => x.id === a)?.name[kioskLang] ?? a).join(", ")}` : undefined,
    ]
      .filter(Boolean)
      .join(" · "),
    qty: l.qty,
  }));
