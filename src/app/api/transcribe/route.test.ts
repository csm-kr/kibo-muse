import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/engine/transcribe", () => ({
  transcribe: vi.fn(async () => {
    throw new Error("Transcribe HTTP 401: upstream says token abc is invalid");
  }),
}));

import { POST } from "./route";

afterEach(() => vi.restoreAllMocks());

describe("받아쓰기 라우트", () => {
  it("받아쓰기가 실패하면 예외 원문은 서버 로그에만 남기고, 휴대폰에는 고정 값과 휴대폰 언어 문구를 보낸다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(new Request("http://x/api/transcribe?lang=Korean&kiosk=fastfood", { method: "POST", body: new Uint8Array(64) }));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "transcribe_failed", say: "잘 듣지 못했어요. 다시 말해 주세요." });
    expect(text).not.toMatch(/401|token|upstream/);
    expect(String(log.mock.calls[0])).toMatch(/401/);
  });

  it("WAV가 비었으면 오류 코드는 bad_request 하나로 맞춘다", async () => {
    const res = await POST(new Request("http://x/api/transcribe?lang=Korean", { method: "POST", body: new Uint8Array(10) }));
    expect([res.status, await res.json()]).toEqual([400, { error: "bad_request" }]);
  });
});
