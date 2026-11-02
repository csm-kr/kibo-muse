import { describe, expect, it } from "vitest";
import { coverage, fitWithin, inBox, iou, maskTransform, toPixelBox, toPixelPoint, zoomBox } from "./geometry";

describe("안내 모드 좌표", () => {
  it("Spark의 0–1000 격자 좌표를 보낸 이미지의 픽셀로 바꾼다. 범위를 살짝 넘거나 모서리가 뒤집혀 와도 이미지 안의 반열림 박스로 고친다", () => {
    expect(toPixelBox([100, 200, 300, 400], 960, 540)).toEqual([96, 108, 288, 216]);
    expect(toPixelBox([1001, 600, 500, -3], 960, 540)).toEqual([480, 0, 960, 324]);
    expect(toPixelPoint([500, 1002], 960, 540)).toEqual([480, 540]);
  });

  it("휴대폰 사진은 긴 변 1280px 안으로 줄인다(작으면 그대로)", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 960, height: 1280 });
    expect(fitWithin(960, 540)).toEqual({ width: 960, height: 540 });
  });

  it("채점: 점이 박스 안인가, 박스 IoU, 마스크가 정답 박스를 덮는 비율과 마스크 중 정답 박스 안에 든 비율", () => {
    expect(inBox([10, 10], [0, 0, 20, 20])).toBe(true);
    expect(inBox([20, 10], [0, 0, 20, 20])).toBe(false);
    expect(iou([0, 0, 10, 10], [0, 0, 10, 10])).toBe(1);
    expect(iou([0, 0, 10, 10], [20, 20, 30, 30])).toBe(0);
    expect(iou([0, 0, 10, 10], [5, 0, 15, 10])).toBeCloseTo(50 / 150);
    // 4×2 마스크가 소스 (10,10)–(14,12)를 덮고, 왼쪽 두 칸만 켜져 있다
    const raster = Uint8Array.from([1, 1, 0, 0, 1, 1, 0, 0]);
    const m = { raster, width: 4, height: 2, bounds: [10, 10, 14, 12] as [number, number, number, number] };
    expect(coverage(m, [10, 10, 12, 12])).toEqual({ ofGt: 1, ofMask: 1 });
    expect(coverage(m, [10, 10, 14, 12])).toEqual({ ofGt: 0.5, ofMask: 1 });
    expect(coverage(m, [11, 10, 13, 12])).toEqual({ ofGt: 0.5, ofMask: 0.5 });
  });
  it("확대 칸: 정답 버튼을 가운데 두고 2:1로 넉넉히 자르되 사진 밖으로 나가면 안으로 민다. 사진보다 크면 사진 크기까지만", () => {
    expect(zoomBox([600, 300, 700, 340], 1280, 720)).toEqual([500, 245, 800, 395]);
    expect(zoomBox([1250, 690, 1280, 720], 1280, 720)).toEqual([1040, 600, 1280, 720]);
    expect(zoomBox([10, 10, 300, 100], 400, 120)).toEqual([0, 0, 400, 120]);
  });
  it("SAM 윤곽(래스터 좌표)을 사진 위에 그릴 변환: bounds 왼쪽 위로 옮기고 bounds 크기 / 래스터 크기로 늘린다", () => {
    expect(maskTransform([211, 228, 271, 255], 60, 27)).toBe("translate(211 228) scale(1 1)");
    expect(maskTransform([100, 50, 400, 110], 150, 30)).toBe("translate(100 50) scale(2 2)");
  });
});
