import { describe, expect, it } from "vitest";
import { chipScroll } from "./KiboBand";

describe("띠의 칩 줄", () => {
  it("재생 전에는 처음 칩부터 보이고, 재생 진행도(i/n)에 맞춰 오른쪽으로 흘러 마지막 단계에서 끝 칩이 보인다. 가려진 쪽만 흐리게 한다", () => {
    expect(chipScroll(1000, 400, null)).toEqual({ left: 0, more: "right" });
    expect(chipScroll(1000, 400, { i: 3, n: 6 })).toEqual({ left: 300, more: "both" });
    expect(chipScroll(1000, 400, { i: 6, n: 6 })).toEqual({ left: 600, more: "left" });
    expect(chipScroll(300, 400, { i: 1, n: 2 })).toEqual({ left: 0, more: "none" });
  });
});
