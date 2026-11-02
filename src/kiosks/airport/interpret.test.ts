import { describe, expect, it } from "vitest";
import { initialState } from "./machine";
import { interpret } from "./interpret";

describe("Spark 해석 어댑터 — 공항 체크인", () => {
  it("항공사를 enum으로 묶은 스키마로 요청하고, 말하지 않은 값(-1·none)은 빼서 의도로 돌려준다. 동의·확정은 Spark가 만들 수 없게 스키마에 없다. 관문을 기다리는 중이면 그 사실을 함께 보낸다", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 요청 본문을 깊게 들여다보는 테스트
    let sent: Record<string, any> | undefined;
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      const content = JSON.stringify({ airline: "bridge_air", travelers: 2, seats: "together", bags: -1, replyLanguage: "ko", say: "어머님과 두 분, 나란히요. 부치실 짐은 몇 개인가요?" });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    };

    const r = await interpret("브리지항공으로 엄마랑 둘이 도쿄 가요. 나란히 앉고 싶어요", initialState(), { kind: "ack", what: "dangerous_goods" }, { bags: 1 }, { apiKey: "test", fetch: fakeFetch });

    const schema = sent!.response_format.json_schema.schema;
    expect(Object.keys(schema.properties)).toEqual(["airline", "travelers", "seats", "bags", "exit", "replyLanguage", "say"]);
    expect(schema.properties.airline.enum).toEqual(["bridge_air", "haneul_sky", "nova_wings", "seabird_air", "none"]);
    expect(sent!.messages[1].content).toContain("waiting for: dangerous goods confirmation");
    expect(sent!.messages[1].content).toContain("Already known from earlier (do not ask again): bags=1");
    expect(r.intent).toEqual({ airline: "bridge_air", travelers: 2, seats: "together" });
    expect(r.replyLanguage).toBe("ko");
  });
});
