import { describe, expect, it } from "vitest";
import { pointerGeometry, targetSelector } from "./pointer";

describe("KIBO 포인터 자리", () => {
  it("버튼의 화면 좌표를 키오스크 안쪽 좌표로 바꾼다. 키오스크가 바깥에서 줄어 있으면(scale) 그만큼 되돌린다. 누르는 자리(점 K의 중심, 물결의 중심)는 버튼 이름을 가리지 않게 가운데에서 오른쪽으로 max(16, 0.3·폭), 아래로 max(16, 0.3·높이) 옮긴다", () => {
    // 540 폭 키오스크가 0.8배로 줄어 432px로 보이고, 그 안의 버튼이 화면 (100+80, 50+160)에 120×40 크기로 보인다(안쪽 150×50, 가운데 175,225)
    const g = pointerGeometry({ left: 100, top: 50, width: 432 }, 540, { left: 180, top: 210, width: 120, height: 40 });
    expect(g).toEqual({ x: 220, y: 241, dot: { left: 202, top: 223 }, ring: { left: 96, top: 196, width: 158, height: 58 } });
  });

  it("값이 없는 버튼은 data-value가 없는 것만, 값이 있으면 그 값과 같은 것만 고른다", () => {
    expect(targetSelector("pay")).toBe('[data-target="pay"]:not([data-value])');
    expect(targetSelector("seat", '36"H')).toBe('[data-target="seat"][data-value="36\\"H"]');
  });
});
