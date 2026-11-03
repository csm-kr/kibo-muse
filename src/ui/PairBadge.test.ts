import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PairBadge } from "./PairBadge";

describe("짝짓기 배지", () => {
  it("QR이 만들어지기 전에도 84×84 자리를 비워 둔다(늦게 생기는 QR로 배지가 커져 레이아웃이 밀리지 않게)", () => {
    const html = renderToStaticMarkup(createElement(PairBadge, { room: "r" }));
    expect(html).toMatch(/<div [^>]*class="[^"]*\bh-\[84px\] w-\[84px\][^"]*"[^>]*data-pair-qr/);
  });
});
