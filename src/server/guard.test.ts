import { describe, expect, it } from "vitest";
import { overSize, tokenBucket } from "./guard";

describe("API 비용 방어", () => {
  it("토큰 버킷: IP마다 분당 n회. 다 쓰면 거절하고, 시간이 지난 만큼(분당 n개 비율) 다시 찬다", () => {
    const b = tokenBucket(3);
    expect([b.take("a", 0), b.take("a", 0), b.take("a", 0), b.take("a", 0)]).toEqual([true, true, true, false]);
    // 다른 IP는 따로 센다
    expect(b.take("b", 0)).toBe(true);
    // 20초에 1개(분당 3개)가 다시 찬다
    expect([b.take("a", 19_000), b.take("a", 20_000), b.take("a", 20_000)]).toEqual([false, true, false]);
    // 오래 쉬어도 n개까지만 찬다
    expect([b.take("a", 600_000), b.take("a", 600_000), b.take("a", 600_000), b.take("a", 600_000)]).toEqual([true, true, true, false]);
  });

  it("요청 크기 상한: WAV 약 2MB(16kHz 모노 약 60초), 이미지 data URL 약 1.5MB(base64 200만 자), 전사문 500자", () => {
    expect([overSize("wavBytes", 2_000_000), overSize("wavBytes", 2_000_001)]).toEqual([false, true]);
    expect([overSize("imageChars", 2_000_000), overSize("imageChars", 2_000_001)]).toEqual([false, true]);
    expect([overSize("utteranceChars", 500), overSize("utteranceChars", 501)]).toEqual([false, true]);
  });
});
