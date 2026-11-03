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
