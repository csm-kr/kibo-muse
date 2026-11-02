// 안내 모드 좌표 계산. 픽셀 박스는 반열림 [x1, y1, x2, y2)이다(끝 좌표는 박스 밖).
// Spark는 보낸 이미지 기준 0–1000 격자로 답한다(왼쪽 위 (0,0)). 1001처럼 살짝 넘는 값은 잘라 낸다.

export type Box = [number, number, number, number];
export type Point = [number, number];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const px = (v: number, size: number) => Math.round((clamp(v, 0, 1000) * size) / 1000);

export function toPixelPoint([x, y]: number[], width: number, height: number): Point {
  return [px(x, width), px(y, height)];
}

export function toPixelBox([a, b, c, d]: number[], width: number, height: number): Box {
  const [x1, x2] = [px(a, width), px(c, width)].sort((p, q) => p - q);
  const [y1, y2] = [px(b, height), px(d, height)].sort((p, q) => p - q);
  return [x1, y1, x2, y2];
}

// 휴대폰 사진은 긴 변 max 안으로 줄여 보낸다(Spark 이미지 약 1280px 권장)
export function fitWithin(width: number, height: number, max = 1280) {
  const s = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * s), height: Math.round(height * s) };
}

export const inBox = ([x, y]: Point, [x1, y1, x2, y2]: Box) => x >= x1 && x < x2 && y >= y1 && y < y2;

const area = ([x1, y1, x2, y2]: Box) => Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
const meet = (a: Box, b: Box): Box => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];

export function iou(a: Box, b: Box) {
  const i = area(meet(a, b));
  const u = area(a) + area(b) - i;
  return u > 0 ? i / u : 0;
}

export interface RasterMask {
  raster: Uint8Array; // 행 우선 0/1, 길이 width × height
  width: number;
  height: number;
  bounds: Box; // 래스터가 덮는 소스 픽셀 박스
}

// ofGt: 정답 박스 중 마스크가 덮는 비율. ofMask: 마스크 중 정답 박스 안에 든 비율(마스크가 화면 전체로 번지면 낮다)
export function coverage({ raster, width, height, bounds }: RasterMask, gt: Box) {
  const sx = (bounds[2] - bounds[0]) / width;
  const sy = (bounds[3] - bounds[1]) / height;
  let on = 0;
  let inside = 0;
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) {
      if (!raster[r * width + c]) continue;
      on++;
      if (inBox([bounds[0] + (c + 0.5) * sx, bounds[1] + (r + 0.5) * sy], gt)) inside++;
    }
  const cell = sx * sy;
  return { ofGt: area(gt) > 0 ? Math.min(1, (inside * cell) / area(gt)) : 0, ofMask: on ? inside / on : 0 };
}

// SAM 윤곽 경로(래스터 좌표)를 보낸 이미지 좌표로 옮기는 SVG transform
export function maskTransform([x1, y1, x2, y2]: Box, width: number, height: number) {
  return `translate(${x1} ${y1}) scale(${(x2 - x1) / width} ${(y2 - y1) / height})`;
}

// 확대 칸으로 자를 영역: 정답 버튼을 가운데 두고 2:1(가로:세로)로 넉넉히 자른다. 사진 밖으로 나가면 안으로 밀고, 사진보다 크면 사진 크기까지만
export function zoomBox([x1, y1, x2, y2]: Box, width: number, height: number): Box {
  // 버튼을 다 담도록 원하는 크기를 먼저 정하고, 가로·세로를 따로 사진 크기로 자른다(버튼이 잘리지 않게)
  const want = Math.max((y2 - y1) * 3, (x2 - x1) * 1.5, 120);
  const ch = Math.min(height, want);
  const cw = Math.min(width, want * 2);
  const left = Math.min(Math.max(Math.round((x1 + x2 - cw) / 2), 0), width - cw);
  const top = Math.min(Math.max(Math.round((y1 + y2 - ch) / 2), 0), height - ch);
  return [left, top, left + cw, top + ch];
}
