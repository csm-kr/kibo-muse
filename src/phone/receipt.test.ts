import { describe, expect, it } from "vitest";
import { nextOrder } from "./receipt";

const base = { type: "status" as const, busy: false, kioskId: "fastfood" };
const burger = { name: "불고기버거 M 세트", detail: "감자튀김 · 콜라", qty: 2 };

describe("주문 완료 영수증", () => {
  it("결제 완료에 품목이 안 오면 주문 확인 때 받은 품목을 쓰고, 결제 시각은 완료를 처음 받은 순간의 지역 시각으로 둔다", () => {
    let memo = nextOrder({}, { ...base, screen: "review", items: 2, total: 12000, lines: [burger] }, new Date(2026, 10, 3, 15, 40));
    memo = nextOrder(memo, { ...base, screen: "payment", items: 2, total: 12000, paid: 64 }, new Date(2026, 10, 3, 15, 42));
    expect(memo.receipt).toEqual({ no: 64, lines: [burger], total: 12000, at: "15:42" });
    // 같은 완료 상태가 다시 와도(hello 답 등) 시각은 그대로
    expect(nextOrder(memo, { ...base, screen: "payment", items: 2, total: 12000, paid: 64 }, new Date(2026, 10, 3, 16, 5)).receipt?.at).toBe("15:42");
  });

  it("paid 다음 idle을 받아도 영수증이 남는다(키오스크가 15초 뒤 첫 화면으로 가도 음식을 받을 때까지 번호가 필요하다)", () => {
    let memo = nextOrder({}, { ...base, screen: "review", items: 2, total: 12000, lines: [burger] }, new Date(2026, 10, 3, 15, 40));
    memo = nextOrder(memo, { ...base, screen: "paid", items: 2, total: 12000, paid: 64 }, new Date(2026, 10, 3, 15, 42));
    memo = nextOrder(memo, { ...base, screen: "idle", items: 0, total: 0, cart: [], draft: null }, new Date(2026, 10, 3, 15, 43));
    expect(memo.receipt).toEqual({ no: 64, lines: [burger], total: 12000, at: "15:42" });
  });

  it("그다음 새 품목이 담기면(또는 고르는 중 draft가 생기면) 영수증이 지워진다", () => {
    let memo = nextOrder({}, { ...base, screen: "review", items: 2, total: 12000, lines: [burger] }, new Date(2026, 10, 3, 15, 40));
    memo = nextOrder(memo, { ...base, screen: "paid", items: 2, total: 12000, paid: 64 }, new Date(2026, 10, 3, 15, 42));
    memo = nextOrder(memo, { ...base, screen: "idle", items: 0, total: 0, cart: [], draft: null }, new Date(2026, 10, 3, 15, 43));
    const draft = { menuId: "bulgogi", mode: "set" as const, size: null, side: null, drink: null, remove: [], add: [], qty: 1 };
    expect(nextOrder(memo, { ...base, screen: "set_size", items: 0, total: 0, cart: [], draft }, new Date()).receipt).toBeUndefined();
    expect(nextOrder(memo, { ...base, screen: "menu", items: 1, total: 6000 }, new Date()).receipt).toBeUndefined();
  });

  it("주문 확인 때 받은 원자료(cart)도 기억해 영수증에 붙인다(휴대폰 언어로 품목 이름을 다시 만들 수 있게)", () => {
    const cart = [{ menuId: "bulgogi", mode: "set" as const, size: "M" as const, side: "fries", drink: "cola", remove: [], add: [], qty: 2, unitPrice: 6000 }];
    const memo = nextOrder({}, { ...base, screen: "review", items: 2, total: 12000, lines: [burger], cart }, new Date(2026, 10, 3, 15, 40));
    expect(nextOrder(memo, { ...base, screen: "payment", items: 0, total: 12000, paid: 64, cart: [] }, new Date(2026, 10, 3, 15, 42)).receipt?.cart).toEqual(cart);
  });
});
