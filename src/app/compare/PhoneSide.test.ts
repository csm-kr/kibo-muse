import { describe, expect, it } from "vitest";
import { phoneZoom } from "./PhoneSide";

describe("나란히 비교의 휴대폰 크기", () => {
  it("가로 배치(1280 이상)에서 화면 높이가 모자라면 휴대폰을 줄여 말풍선·휴대폰이 한 화면에 들고, 1920×1080(영상)은 그대로다", () => {
    // 말풍선 109px(빈 말풍선 두 줄), 사이 16px, 휴대폰 880px, 위아래 여백 16px씩
    expect(phoneZoom(1920, 1080, 109)).toBe(1);
    const z = phoneZoom(1440, 900, 109);
    expect(z).toBeLessThan(1);
    expect(16 + 109 + 16 + 880 * z + 16).toBeLessThanOrEqual(900);
    // 좁은 화면은 세로로 쌓고 스크롤하므로 줄이지 않는다
    expect(phoneZoom(1024, 700, 109)).toBe(1);
  });
});
