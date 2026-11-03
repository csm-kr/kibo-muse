// 휴대폰 주문 완료 영수증. 주문 확인·결제 화면에서 받은 품목을 기억했다가, 결제 완료(paid) 상태에 품목이 없으면 그것을 쓴다.
// 결제 시각은 휴대폰이 완료를 처음 받은 순간의 지역 시각이다(키오스크는 시각을 보내지 않는다)
import type { CartLine } from "@/kiosks/fastfood/machine";
import type { LinkMsg } from "@/sync/link";

type Status = Extract<LinkMsg, { type: "status" }>;
type Line = NonNullable<Status["lines"]>[number];

export interface Receipt {
  no: number;
  lines: Line[];
  // 키오스크 원자료. 있으면 휴대폰 언어로 품목 이름을 다시 만든다(orderLinesIn)
  cart?: CartLine[];
  total: number;
  at: string;
}
export interface OrderMemo {
  lines?: Line[];
  cart?: CartLine[];
  receipt?: Receipt;
}

const clock = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function nextOrder(memo: OrderMemo, s: Status, now: Date): OrderMemo {
  // 품목 줄과 원자료는 같은 상태에서 함께 받은 것을 짝으로 기억한다
  const fresh = !!s.lines?.length;
  const seen = fresh ? s.lines : memo.lines;
  const cart = fresh ? s.cart : memo.cart;
  // 결제 완료 상태가 사라져도(키오스크가 첫 화면으로 돌아감) 영수증은 남긴다. 새 주문(품목이 담기거나 고르는 중 draft가 생김)이 시작될 때만 지운다
  const started = s.items > 0 || !!s.draft;
  const receipt = s.paid ? (memo.receipt?.no === s.paid ? memo.receipt : { no: s.paid, lines: seen ?? [], cart, total: s.total, at: clock(now) }) : started ? undefined : memo.receipt;
  // 장바구니가 비고 결제 전이면 새 주문이다. 기억한 품목을 버린다
  const keep = s.items > 0 || !!s.paid;
  return { lines: keep ? seen : undefined, cart: keep ? cart : undefined, receipt };
}
