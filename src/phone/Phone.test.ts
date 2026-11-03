import { createElement, type FC } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Phone as PhoneFn } from "./Phone";

// Phone(props = {})의 기본값 매개변수 때문에 createElement가 props 꼴을 못 읽는다
const Phone = PhoneFn as FC<{ room?: string; embedded?: boolean }>;

describe("휴대폰 화면 접근성", () => {
  it("단독 화면은 main과 h1을 갖고, 연결 표시는 role이 있고, 누르는 것은 모두 44px(min-h-11) 이상이며, 폭은 화면을 넘지 않게 w-full이다", () => {
    const html = renderToStaticMarkup(createElement(Phone, { room: "r" }));
    expect(html).toMatch(/^<main [^>]*class="[^"]*\bw-full\b/);
    expect(html).toMatch(/<h1[^>]*>KIBO<\/h1>/);
    // 연결 칩은 점만이 아니라 글자로도 알린다(연결 전)
    expect(html).toMatch(/<span role="status"[^>]*>(?:(?!<\/span><\/span>).)*Not connected/);
    const small = [...html.matchAll(/<(button|input)\b[^>]*>/g)].map((m) => m[0]).filter((tag) => !/type="file"/.test(tag) && !/\b(min-h-11|h-28)\b/.test(tag));
    expect(small).toEqual([]);
    // 서버 전사문 상한(500자)을 넘는 글은 입력 칸에서부터 막는다
    expect(html).toMatch(/<input [^>]*maxlength="500"/i);
  });

  it("나란히 비교에 넣은 휴대폰은 main·h1을 쓰지 않는다(바깥 화면과 겹치지 않게)", () => {
    const html = renderToStaticMarkup(createElement(Phone, { room: "r", embedded: true }));
    expect(html).not.toMatch(/<main|<h1/);
  });
});
