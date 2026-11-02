import { afterEach, describe, expect, it, vi } from "vitest";
import { initialState } from "@/kiosks/airport/machine";
import { POST } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/api/airport/interpret", () => {
  it("그만하고 처음으로 가고 싶다는 말(exit)은 계획하지 않고 거절한다. 관문 카드도 보내지 않는다", async () => {
    let schema: { properties: Record<string, unknown> } | undefined;
    vi.stubEnv("MODEL_API_KEY", "test");
    vi.stubGlobal("fetch", async (_u: string, init?: RequestInit) => {
      schema = JSON.parse(String(init?.body)).response_format.json_schema.schema;
      const content = JSON.stringify({ airline: "bridge_air", travelers: 2, seats: "none", bags: 1, exit: true, replyLanguage: "ko", say: "처음으로 갈게요." });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    const res = await POST(new Request("http://x/api/airport/interpret", { method: "POST", body: JSON.stringify({ utterance: "체크인 그만할래요. 처음으로 가 주세요.", state: initialState(), pending: { airline: "bridge_air", travelers: 2, bags: 1 } }) }));
    const body = await res.json();
    expect(schema!.properties.exit).toMatchObject({ type: "boolean" });
    expect(body.plan).toEqual({ kind: "reject", reason: "exit" });
    expect(body.gate).toBeNull();
    // Spark 문장("처음으로 갈게요.")은 하지 않은 일이라 쓰지 않고 휴대폰과 같은 고정 문구로 덮는다
    expect(body.say).toBe("처음으로 가려면 화면 위 [처음으로]를 눌러 주세요. 체크인은 확정되지 않았어요.");
  });
});
