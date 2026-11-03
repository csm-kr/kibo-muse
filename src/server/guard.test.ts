import { describe, expect, it, vi } from "vitest";
import { logError, overSize, tokenBucket, tooLarge } from "./guard";

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

  it("너무 큰 요청의 문구: 말(음성·글)에는 사진 이야기를 하지 않고, 사진에만 사진 크기를 말한다. 휴대폰 언어(?lang)로", async () => {
    const say = async (r: Response) => ((await r.json()) as { say: string }).say;
    const ko = new Request("http://x/api/transcribe?lang=ko");
    expect(await say(tooLarge(ko, "speech"))).not.toMatch(/사진/);
    expect(await say(tooLarge(ko, "photo"))).toMatch(/사진/);
    expect(await say(tooLarge(new Request("http://x/api/transcribe?lang=vi"), "speech"))).not.toMatch(/ảnh/i);
  });

  it("서버 로그에서 키 꼴 토큰(sk-, sb_secret_, LLM_)은 <key>로 가린다", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("interpret failed:", new Error("HTTP 401 Bearer sk-fake99 / sb_secret_fake9 / LLM_fake|9.x rejected"));
    const line = String(log.mock.calls[0]);
    expect(line).not.toMatch(/fake/);
    expect(line.match(/<key>/g)).toHaveLength(3);
    expect(line).toMatch(/HTTP 401 Bearer <key>/);
    log.mockRestore();
  });
});
