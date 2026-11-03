// KIBO 포인터가 갈 자리 계산. 키오스크는 바깥에서 transform: scale로 줄어 있으므로 화면 좌표를 키오스크 안쪽 좌표로 되돌린다.

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

// layer: 포인터 층의 화면 좌표(left, top, 보이는 폭), layerWidth·layerHeight: 층의 원래 크기(offsetWidth·offsetHeight), t: 버튼의 화면 좌표
// KIBO 점(K): 지름 36px. 누르는 자리(K의 중심, 탭 물결의 중심)는 버튼 오른쪽 아래 모서리 바깥쪽(오른쪽 끝 − 8, 아래 끝 + 8)이다.
// 버튼 이름은 가운데에 있으므로, 글자가 버튼 폭을 꽉 채워도 점이 끝 글자를 덮지 않는다.
// 아래에 자리가 없으면(화면 아래 끝 버튼) 오른쪽 위 모서리 바깥(위 끝 − 8)으로 올리고, 점 전체가 화면 안에 들게 맞춘다
export const DOT = 36;
const CORNER = 8;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function pointerGeometry(layer: Pick<Box, "left" | "top" | "width">, layerWidth: number, layerHeight: number, t: Box) {
  const s = layer.width / layerWidth;
  const left = (t.left - layer.left) / s;
  const top = (t.top - layer.top) / s;
  const width = t.width / s;
  const height = t.height / s;
  const r = DOT / 2;
  const x = clamp(left + width - CORNER, r, layerWidth - r);
  const below = top + height + CORNER;
  const y = clamp(below + r <= layerHeight ? below : top - CORNER, r, layerHeight - r);
  return { x, y, dot: { left: x - DOT / 2, top: y - DOT / 2 }, ring: { left: left - 4, top: top - 4, width: width + 8, height: height + 8 } };
}

// 키오스크 버튼은 data-target·data-value를 단다. 값이 없는 버튼은 data-value가 없다
export function targetSelector(target: string, value?: string) {
  return value === undefined ? `[data-target="${target}"]:not([data-value])` : `[data-target="${target}"][data-value="${value.replace(/["\\]/g, "\\$&")}"]`;
}

// 한 단계의 시각표(ms, 그 단계의 강조가 시작된 때부터). 둘째 단계부터는 라운드2 모션 명세 그대로:
// 0 이동 240 · 180 테두리 120 · 300 누름 220(330 물결) · 520 탭(화면 바뀜). 탭 뒤 GAP만큼 쉬고 다음 단계.
// 첫 단계는 계획이 도착한 뒤 사람이 매 턴 기다리는 고정 비용이라 줄인다. 점이 버튼 가까이(NEAR)에서 나타나 짧게 움직이고,
// 테두리 → 누름 → 탭 순서는 그대로 보인다
export interface Beat {
  move: number;
  ringAt: number;
  ring: number;
  pressAt: number;
  press: number;
  rippleAt: number;
  tap: number;
}
const FIRST: Beat = { move: 90, ringAt: 30, ring: 80, pressAt: 80, press: 80, rippleAt: 90, tap: 160 };
const NEXT: Beat = { move: 240, ringAt: 180, ring: 120, pressAt: 300, press: 220, rippleAt: 330, tap: 520 };
export const beat = (first: boolean) => (first ? FIRST : NEXT);
export const GAP = 120;
// 첫 단계에서 점이 나타나는 자리: 누를 자리에서 오른쪽(휴대폰 쪽)으로 이만큼(키오스크 안쪽 px)
export const NEAR = 56;

// n번 누를 때 각 탭이 키오스크에 들어가는 시각(계획 도착 기준). Station의 재생 기다림과 같은 계산
export function tapTimes(n: number) {
  const out: number[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    t += beat(i === 0).tap;
    out.push(t);
    t += GAP;
  }
  return out;
}
