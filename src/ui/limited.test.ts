import { describe, expect, it } from "vitest";
import { limitedReject } from "./limited";

describe("해석 한도(429)", () => {
  it("429 본문에 서버가 그 사람의 언어로 만든 문구(say)가 있으면 그것으로 거절한다. 아니면 null(일반 오류 처리)", async () => {
    const r429 = (body: object) => new Response(JSON.stringify(body), { status: 429 });
    expect(await limitedReject(r429({ error: "rate_limited", say: "요청이 너무 많아요." }), "Korean")).toEqual({ kind: "reject", reason: "rate_limited", lang: "Korean", say: "요청이 너무 많아요." });
    expect(await limitedReject(r429({ error: "rate_limited" }), "Korean")).toBeNull();
    expect(await limitedReject(new Response("{}", { status: 502 }), "Korean")).toBeNull();
  });

  it("413(말이 너무 김)도 서버 문구가 있으면 그것으로 거절한다", async () => {
    const r = new Response(JSON.stringify({ error: "too_large", say: "너무 길어요." }), { status: 413 });
    expect(await limitedReject(r, "Korean")).toEqual({ kind: "reject", reason: "too_large", lang: "Korean", say: "너무 길어요." });
  });
});
