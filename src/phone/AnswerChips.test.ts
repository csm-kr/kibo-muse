import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerChips, chipPick } from "./AnswerChips";

describe("되묻기 답 칩", () => {
  it("휴대폰 언어의 답 버튼 2개(44px 이상, 좁으면 줄바꿈)를 그린다", () => {
    const html = renderToStaticMarkup(createElement(AnswerChips, { kind: "orderType", language: "ko-KR", onPick: () => {} }));
    expect(html).toMatch(/^<div [^>]*class="[^"]*\bflex-wrap\b[^"]*"[^>]*data-answer-chips/);
    const buttons = [...html.matchAll(/<button [^>]*>([^<]*)<\/button>/g)];
    expect(buttons.map((b) => b[1])).toEqual(["먹고 갈게요", "포장할게요"]);
    for (const b of buttons) expect(b[0]).toMatch(/\bmin-h-11\b/);
    expect(renderToStaticMarkup(createElement(AnswerChips, { kind: "size", language: "vi", onPick: () => {} }))).toMatch(/>Cỡ M<\/button><button [^>]*>Cỡ L</);
  });

  it("칩은 글과 정해진 답을 키오스크로 보낸다. [더 주문할게요]는 할 일이 없어 보내지 않고 휴대폰에서 바로 고정 KIBO 턴을 붙인다", () => {
    expect(chipPick("size", 1, "ko")).toEqual({ send: "L 사이즈", answer: { field: "size", value: "L" } });
    expect(chipPick("more", 1, "ko")).toEqual({ local: "더 주문할게요", reply: "네, 더 드실 메뉴를 말씀해 주세요." });
  });
});
