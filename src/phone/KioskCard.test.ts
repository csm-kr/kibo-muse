import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KioskCard } from "./KioskCard";

describe("휴대폰 실시간 키오스크 카드", () => {
  const cart = [{ menuId: "double_cheese", mode: "set" as const, size: "L" as const, side: "fries", drink: "zero_cola", remove: [], add: [], qty: 2, unitPrice: 8300 }];
  const status = { type: "status" as const, busy: false, kioskId: "fastfood", screen: "review", items: 2, total: 16600, cart, kioskLang: "en" as const };

  it("접힌 한 줄(키오스크 지금 · 화면 이름 · 요약)을 누르면 담은 줄과 합계가 펼쳐진다. 화면 읽기가 시끄럽지 않게 aria-live는 두지 않는다", () => {
    const html = renderToStaticMarkup(createElement(KioskCard, { status, language: "ko-KR" }));
    expect(html).toMatch(/^<details [^>]*data-kiosk-card/);
    expect(html).toMatch(/<summary [^>]*>.*키오스크 지금.*주문 확인 · 결제는 직접/);
    expect(html).toContain("더블 치즈버거 L 세트");
    expect(html).toMatch(/×2/);
    expect(html).toContain("₩16,600");
    expect(html).not.toMatch(/aria-live/);
  });
});
