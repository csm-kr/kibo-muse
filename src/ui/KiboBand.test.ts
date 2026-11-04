import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { chipScroll, KiboBand } from "./KiboBand";

describe("띠의 칩 줄", () => {
  it("재생 전에는 처음 칩부터 보이고, 재생 진행도(i/n)에 맞춰 오른쪽으로 흘러 마지막 단계에서 끝 칩이 보인다. 가려진 쪽만 흐리게 한다", () => {
    expect(chipScroll(1000, 400, null)).toEqual({ left: 0, more: "right" });
    expect(chipScroll(1000, 400, { i: 3, n: 6 })).toEqual({ left: 300, more: "both" });
    expect(chipScroll(1000, 400, { i: 6, n: 6 })).toEqual({ left: 600, more: "left" });
    expect(chipScroll(300, 400, { i: 1, n: 2 })).toEqual({ left: 0, more: "none" });
  });
});

describe("키오스크 위에 겹치는 띠(overlay)", () => {
  it("배경이 불투명해서 아래 키오스크 제목(Bridge Burger 등)이 비치지 않는다", () => {
    const html = renderToStaticMarkup(createElement(KiboBand, { phase: "replaying", chips: [], progress: { i: 1, n: 2 } }));
    const band = html.match(/<div [^>]*data-kibo-band="replaying"[^>]*>/)![0];
    expect(band).toMatch(/\bbg-neutral-900(?![\w/-])/);
  });

  it("휴대폰 마이크를 누른 순간(listening)부터 'Listening'과 Muse Voice 띠가 뜬다. 듣지 않으면 쉬는 동안 띠가 없다(그 앱 비교: 키오스크 첫 변화 1.6초)", () => {
    for (const slot of [true, false]) {
      const html = renderToStaticMarkup(createElement(KiboBand, { phase: "idle", chips: [], progress: null, slot, listening: true }));
      expect(html).toMatch(/data-kibo-band="listening"/);
      expect(html).toContain("Listening");
      expect(html).toContain("Muse Voice");
    }
    expect(renderToStaticMarkup(createElement(KiboBand, { phase: "idle", chips: [], progress: null, slot: true }))).toBe("");
    // 손을 뗀 뒤 받아쓰는 동안(heard)은 'Understanding'으로 바꾼다(다 말했는데 아직 듣는 것처럼 보이지 않게)
    const heard = renderToStaticMarkup(createElement(KiboBand, { phase: "idle", chips: [], progress: null, slot: true, listening: "heard" }));
    expect([heard.includes('data-kibo-band="heard"'), heard.includes("Understanding"), heard.includes("Listening"), heard.includes("Muse Voice")]).toEqual([true, true, false, true]);
  });
});
