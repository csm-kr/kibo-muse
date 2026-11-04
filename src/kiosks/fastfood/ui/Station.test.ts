import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FastfoodStation, planDoneSay } from "./Station";

// 서버 렌더에서는 ?qr 플래그가 늘 false라 배지가 안 그려진다. 브라우저처럼 켜 둔다
vi.mock("@/ui/PairBadge", async (orig) => ({ ...(await orig<typeof import("@/ui/PairBadge")>()), useQrFlag: () => true }));

describe("planDoneSay: 계획을 다 누른 뒤 휴대폰에 할 말", () => {
  it("장바구니가 비었는데 메뉴에서 끝나면 '더 주문?' 대신 무엇을 말할지 예를 든다", () => {
    const ko = planDoneSay({ endScreen: "menu", dropped: 0, hasItems: false }, "ko", "결제하기");
    expect(ko).toBe("드실 메뉴를 말씀해 주세요. 예: 더블 치즈버거 세트 하나");
    expect(planDoneSay({ endScreen: "menu", dropped: 0, hasItems: false }, "en", "Pay")).toMatch(/^What would you like/);
  });

  it("담은 것이 있으면 지금처럼 더 주문할지 묻고, 주문 확인이면 결제 버튼을 말한다", () => {
    expect(planDoneSay({ endScreen: "menu", dropped: 0, hasItems: true }, "ko", "결제하기")).toBe("더 주문하실 게 있나요? 없으면 '그게 다예요'라고 말씀하세요.");
    expect(planDoneSay({ endScreen: "review", dropped: 0, hasItems: true }, "ko", "결제하기")).toContain("[결제하기]");
  });
});

describe("개발 콘솔 화면", () => {
  it("첫 화면 링크(/kiosk/fastfood)로 와도 대기 화면에 휴대폰 짝짓기 QR 배지가 있다(공항·기차와 같다)", () => {
    const html = renderToStaticMarkup(createElement(() => FastfoodStation({ variant: "dev", room: "r1" })));
    expect(html).toContain('data-pair="r1"');
  });
});
