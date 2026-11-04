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

  it("글씨를 키운 작은 화면: 머리줄은 아주 좁으면 KIBO 글자를 화면 읽기용으로만 두고 언어 단추를 줄여 한 줄을 지키고, 언어 칩은 좁으면 2열에 단어 중간에서 끊지 않으며, 낮은 화면에서는 마이크를 줄인다", () => {
    const html = renderToStaticMarkup(createElement(Phone, {}));
    expect(html).not.toMatch(/<header class="[^"]*\bflex-wrap\b/);
    expect(html).toMatch(/<h1 class="[^"]*max-\[240px\]:sr-only[^"]*">KIBO<\/h1>/);
    expect(html).toMatch(/<button [^>]*aria-expanded="true"[^>]*class="[^"]*\bmin-w-0\b[^"]*\btruncate\b/);
    expect(html).toMatch(/class="[^"]*\bgrid-cols-3\b[^"]*max-\[300px\]:grid-cols-2/);
    const chipTags = [...html.matchAll(/<button [^>]*aria-pressed="(?:true|false)"[^>]*>/g)].map((m) => m[0]).filter((t) => !/aria-label/.test(t));
    expect(chipTags.length).toBe(6);
    for (const t of chipTags) expect(t).toMatch(/\bbreak-keep\b/);
    expect(html).toMatch(/<button [^>]*data-mic="idle"[^>]*class="[^"]*\[@media\(max-height:600px\)\]:h-20[^"]*\[@media\(max-height:400px\)\]:h-16/);
    // 좁으면(글씨 130% 이상) 입력 칸을 윗줄 전체로, 카메라·보내기는 아랫줄로(한 줄이면 200%에서 입력 칸이 26px)
    expect(html).toMatch(/<form class="[^"]*max-\[340px\]:flex-wrap/);
    expect(html).toMatch(/<input [^>]*class="[^"]*max-\[340px\]:order-first[^"]*max-\[340px\]:basis-full/);
  });

  it("화면 읽기: 마이크는 보내는 동안 disabled 대신 aria-disabled(초점을 잃지 않게), 대화 칸은 초점을 받는 log, 언어 단추는 '언어: 이름', 생각 중은 안내 줄 한 곳에서만, 강제 색에서도 테두리", () => {
    const html = renderToStaticMarkup(createElement(Phone, { room: "r" }));
    const mic = html.match(/<button [^>]*data-mic="idle"[^>]*>/)![0];
    expect(mic).toMatch(/aria-disabled="false"/);
    expect(mic).not.toMatch(/\bdisabled=""/);
    expect(mic).toMatch(/forced-colors:border-2/);
    expect(html).toMatch(/<button type="submit" class="[^"]*forced-colors:border-2/);
    expect(html).toMatch(/<div class="[^"]*overflow-y-auto[^"]*" aria-live="polite" role="log" tabindex="0" aria-label="Conversation">/);
    expect(html).toMatch(/<button type="button" aria-expanded="(true|false)" aria-label="Language: English"/);
  });

  it("높이 460px 이하(글씨를 크게 키운 휴대폰: SE 150%·iPhone 13 200%)에서는 페이지 전체가 스크롤돼 영수증 번호까지 늘 닿는다(대화 칸만 스크롤하지 않는다. 입력 줄이 두 줄이 되어 칸이 50px대로 줄던 화면)", () => {
    const html = renderToStaticMarkup(createElement(Phone, {}));
    expect(html).toMatch(/^<main [^>]*class="[^"]*\bh-dvh\b[^"]*\[@media\(max-height:460px\)\]:h-auto[^"]*\[@media\(max-height:460px\)\]:min-h-dvh/);
    expect(html).toMatch(/<div class="[^"]*\boverflow-y-auto\b[^"]*\[@media\(max-height:460px\)\]:overflow-visible[^"]*" aria-live="polite"/);
    // 페이지가 스크롤되는 화면에서 마이크가 화면 밖이면(영수증을 보는 중) 아래에 작은 '말하기'(누르고 말하기)를 띄운다. 처음에는 마이크가 보여 숨어 있다
    expect(html).toMatch(/<button [^>]*data-mic-shortcut[^>]*class="[^"]*\bhidden\b[^"]*\[@media\(max-height:460px\)\]:flex[^"]*\binvisible\b/);
  });

  it("나란히 비교에 넣은 휴대폰은 main·h1을 쓰지 않는다(바깥 화면과 겹치지 않게)", () => {
    const html = renderToStaticMarkup(createElement(Phone, { room: "r", embedded: true }));
    expect(html).not.toMatch(/<main|<h1|data-mic-shortcut/);
  });
});

describe("휴대폰 첫 화면 안내", () => {
  it("대화 전 첫 화면에 '탭하고 말하기'와 소리 켜기 안내를 보인다", () => {
    const html = renderToStaticMarkup(createElement(Phone, { room: "r" }));
    expect(html).toContain("Tap and talk");
    expect(html).toContain("Can&#x27;t hear KIBO? Turn off silent mode and turn up the volume");
  });
});
