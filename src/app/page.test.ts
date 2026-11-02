import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { metadata as layoutMetadata } from "./layout";

// next/font는 Next 컴파일러 밖에서는 함수가 아니다. 제목만 보면 되므로 글꼴은 빈 값으로 바꾼다
vi.mock("next/font/google", () => ({ Geist: () => ({ variable: "" }), Geist_Mono: () => ({ variable: "" }) }));
import Home from "./page";

describe("첫 화면", () => {
  it("데모 링크 5개와 Meta 공식 제품이 아니라는 고지가 있다", () => {
    const html = renderToStaticMarkup(createElement(Home));
    for (const href of ["/compare", "/kiosk/fastfood", "/kiosk/airport", "/kiosk/train", "/phone"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain("Not an official Meta product");
  });

  it("제목을 정하지 않은 페이지의 기본 제목은 KIBO다", () => {
    expect(layoutMetadata.title).toBe("KIBO");
  });
});
