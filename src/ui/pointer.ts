// KIBO 포인터가 갈 자리 계산. 키오스크는 바깥에서 transform: scale로 줄어 있으므로 화면 좌표를 키오스크 안쪽 좌표로 되돌린다.

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

// layer: 포인터 층의 화면 좌표(left, top, 보이는 폭), layerWidth: 층의 원래 폭(offsetWidth), t: 버튼의 화면 좌표
// KIBO 점(K): 지름 36px. 누르는 자리(K의 중심, 탭 물결의 중심)는 버튼 가운데에서 오른쪽으로 max(16, 0.3·폭),
// 아래로 max(16, 0.3·높이) 옮겨 버튼 이름을 가리지 않는다(720p 절반 크기 판독)
export const DOT = 36;
const MIN_SHIFT = 16;

export function pointerGeometry(layer: Pick<Box, "left" | "top" | "width">, layerWidth: number, t: Box) {
  const s = layer.width / layerWidth;
  const left = (t.left - layer.left) / s;
  const top = (t.top - layer.top) / s;
  const width = t.width / s;
  const height = t.height / s;
  const x = left + width / 2 + Math.max(MIN_SHIFT, 0.3 * width);
  const y = top + height / 2 + Math.max(MIN_SHIFT, 0.3 * height);
  return { x, y, dot: { left: x - DOT / 2, top: y - DOT / 2 }, ring: { left: left - 4, top: top - 4, width: width + 8, height: height + 8 } };
}

// 키오스크 버튼은 data-target·data-value를 단다. 값이 없는 버튼은 data-value가 없다
export function targetSelector(target: string, value?: string) {
  return value === undefined ? `[data-target="${target}"]:not([data-value])` : `[data-target="${target}"][data-value="${value.replace(/["\\]/g, "\\$&")}"]`;
}
