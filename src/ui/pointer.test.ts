import { describe, expect, it } from "vitest";
import { beat, DOT, pointerGeometry, tapTimes, targetSelector } from "./pointer";

describe("KIBO 포인터 자리", () => {
  it("버튼의 화면 좌표를 키오스크 안쪽 좌표로 바꾼다. 키오스크가 바깥에서 줄어 있으면(scale) 그만큼 되돌린다. 누르는 자리(점 K의 중심, 물결의 중심)는 버튼 오른쪽 아래 모서리 바깥쪽(오른쪽 끝 − 8, 아래 끝 + 8)이다", () => {
    // 540 폭 키오스크가 0.8배로 줄어 432px로 보이고, 그 안의 버튼이 화면 (100+80, 50+160)에 120×40 크기로 보인다(안쪽 100,200에 150×50)
    const g = pointerGeometry({ left: 100, top: 50, width: 432 }, 540, 960, { left: 180, top: 210, width: 120, height: 40 });
    expect(g).toEqual({ x: 242, y: 258, dot: { left: 224, top: 240 }, ring: { left: 96, top: 196, width: 158, height: 58 } });
  });

  // 실제 키오스크(안쪽 528×948) 버튼들: 글자가 꽉 찬 버튼, 화면 아래·오른쪽 끝에 닿는 버튼, 좁은 좌석 버튼
  const W = 528, H = 948;
  const buttons = {
    orderDetails: { left: 194, top: 846, width: 150, height: 44 },
    addToOrder: { left: 182, top: 816, width: 326, height: 64 },
    pay: { left: 186, top: 766, width: 318, height: 56 },
    startOverAtBottom: { left: 16, top: 898, width: 110, height: 44 },
    rightEdge: { left: 400, top: 100, width: 128, height: 44 },
    seat: { left: 240, top: 400, width: 44, height: 36 },
  };
  const at = (b: (typeof buttons)[keyof typeof buttons]) => pointerGeometry({ left: 0, top: 0, width: W }, W, H, b);

  it("점 중심이 버튼 안 글자 영역(가운데 70%) 밖에 있고, 점(반지름 DOT/2)이 글자 줄(가운데 70% 폭 × 가운데 40% 높이)에 닿지 않는다", () => {
    for (const [name, b] of Object.entries(buttons)) {
      const { x, y } = at(b);
      const inText = x > b.left + 0.15 * b.width && x < b.left + 0.85 * b.width && y > b.top + 0.15 * b.height && y < b.top + 0.85 * b.height;
      expect(inText, name).toBe(false);
      const [l, r, t, btm] = [b.left + 0.15 * b.width, b.left + 0.85 * b.width, b.top + 0.3 * b.height, b.top + 0.7 * b.height];
      const gap = Math.hypot(Math.max(l - x, 0, x - r), Math.max(t - y, 0, y - btm));
      expect(gap >= DOT / 2, `${name} gap ${gap.toFixed(1)}`).toBe(true);
    }
  });

  it("점(지름 DOT)이 키오스크 화면 안에 있다. 아래에 자리가 없으면 오른쪽 위 모서리 바깥으로 올린다", () => {
    for (const [name, b] of Object.entries(buttons)) {
      const { x, y } = at(b);
      expect([x - DOT / 2 >= 0, x + DOT / 2 <= W, y - DOT / 2 >= 0, y + DOT / 2 <= H], name).toEqual([true, true, true, true]);
    }
    expect(at(buttons.startOverAtBottom).y).toBe(898 - 8);
  });

  it("값이 없는 버튼은 data-value가 없는 것만, 값이 있으면 그 값과 같은 것만 고른다", () => {
    expect(targetSelector("pay")).toBe('[data-target="pay"]:not([data-value])');
    expect(targetSelector("seat", '36"H')).toBe('[data-target="seat"][data-value="36\\"H"]');
  });

  it("재생 시각표: 첫 탭은 계획이 도착한 뒤 200ms 안에 키오스크에 들어가고, 둘째 탭부터 간격(640ms)은 그대로다", () => {
    const t = tapTimes(4);
    expect(t[0]).toBeLessThanOrEqual(200);
    expect(t.slice(1).map((x, i) => x - t[i])).toEqual([640, 640, 640]);
  });

  it("첫 단계도 점이 움직이고, 테두리가 누름보다 먼저 보이며, 누름이 끝나는 때가 탭 시각이다", () => {
    for (const b of [beat(true), beat(false)]) {
      expect(b.move).toBeGreaterThan(0);
      expect(b.ringAt).toBeLessThan(b.pressAt);
      expect(b.pressAt + b.press).toBe(b.tap);
    }
  });
});
