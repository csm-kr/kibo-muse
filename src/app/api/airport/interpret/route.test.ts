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

  it("되묻기 Spark 문장이 다른 언어 문자를 섞으면 알아들은 항공사와 빠진 칸으로 만든 고정 문구로 바꾼다", async () => {
    vi.stubEnv("MODEL_API_KEY", "test");
    vi.stubGlobal("fetch", async () => {
      const content = JSON.stringify({ airline: "nova_wings", travelers: -1, seats: "none", bags: -1, exit: false, replyLanguage: "ko", say: "노바윙스ですね. 몇 분이세요?" });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    const res = await POST(new Request("http://x/api/airport/interpret", { method: "POST", body: JSON.stringify({ utterance: "노바윙스예요.", state: initialState() }) }));
    const body = await res.json();
    expect(body.plan.kind).toBe("clarify");
    expect(body.say).toBe("노바윙스 체크인을 도와드릴게요. 알려 주세요: 체크인할 인원, 부치는 짐 개수.");
  });

  it("휴대폰 언어(?lang)가 대답 언어다: Spark가 영어로 되물어도 한국어 휴대폰에는 한국어 고정 되묻기로 답한다", async () => {
    vi.stubEnv("MODEL_API_KEY", "test");
    vi.stubGlobal("fetch", async () => {
      const content = JSON.stringify({ airline: "nova_wings", travelers: -1, seats: "none", bags: -1, exit: false, replyLanguage: "en", say: "Nova Wings, got it. How many travelers?" });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    const res = await POST(new Request("http://x/api/airport/interpret?lang=ko", { method: "POST", body: JSON.stringify({ utterance: "Nova Wings 체크인이요", state: initialState() }) }));
    const body = await res.json();
    expect(body.say).toBe("노바윙스 체크인을 도와드릴게요. 알려 주세요: 체크인할 인원, 부치는 짐 개수.");
    expect(body.replyLanguage).toBe("ko");
  });
});
