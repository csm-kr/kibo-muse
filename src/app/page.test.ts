import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { metadata as layoutMetadata } from "./layout";

// next/font는 Next 컴파일러 밖에서는 함수가 아니다. 제목만 보면 되므로 글꼴은 빈 값으로 바꾼다
vi.mock("next/font/google", () => ({ Geist: () => ({ variable: "" }), Geist_Mono: () => ({ variable: "" }) }));
import { numbers } from "./film/numbers";
import Home from "./page";

describe("첫 화면", () => {
  it("데모 링크 5개와 Meta 공식 제품이 아니라는 고지가 있다. 키오스크 링크는 QR이 바로 보이는 키오스크 화면(?view=kiosk)으로 간다", () => {
    const html = renderToStaticMarkup(createElement(Home));
    for (const href of ["/compare", "/kiosk/fastfood?view=kiosk", "/kiosk/airport?view=kiosk", "/kiosk/train?view=kiosk", "/phone"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain("Not an official Meta product");
  });

  it("How to try 단계: QR을 휴대폰으로 찍고, 마이크를 한 번 탭해 한 문장, 1.5초 조용하면 보내고, 결제·동의는 사람이 한다. 키오스크마다 예문이 있다", () => {
    const html = renderToStaticMarkup(createElement(Home));
    expect(html).toContain("How to try");
    for (const s of ["Scan the QR code", "tap the mic once", "1.5 seconds", "payment, consent or a passport scan", "double cheeseburger", "Bridge Air to Tokyo", "Harborlight"]) expect(html).toContain(s);
  });

  it("휴대폰이 없는 사람에게 나란히 비교에서 시작해 휴대폰 칸에 글로 치면 된다고 알리고, 그 카드에 Start here를 붙인다", () => {
    const html = renderToStaticMarkup(createElement(Home));
    expect(html).toContain("No phone needed");
    expect(html).toMatch(/href="\/compare"(?:(?!<\/a>).)*Start here/);
    expect(html).not.toMatch(/href="\/kiosk\/fastfood"(?:(?!<\/a>).)*Start here/);
  });

  it("저장소 주소(numbers.REPO)가 없으면 Source 줄을 그리지 않고, 넣으면 링크로 보인다. ⟦…⟧ 자리 표시는 보이지 않는다", () => {
    const repo = numbers.REPO;
    try {
      numbers.REPO = null;
      const none = renderToStaticMarkup(createElement(Home));
      expect(none).not.toContain("Source");
      expect(none).not.toContain("⟦");
      numbers.REPO = "https://github.com/example/kibo-muse";
      expect(renderToStaticMarkup(createElement(Home))).toContain('Source: <a href="https://github.com/example/kibo-muse"');
    } finally {
      numbers.REPO = repo;
    }
  });

  it("제목을 정하지 않은 페이지의 기본 제목은 KIBO다", () => {
    expect(layoutMetadata.title).toBe("KIBO");
  });
});
