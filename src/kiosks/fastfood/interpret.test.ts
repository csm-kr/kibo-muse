import { describe, expect, it } from "vitest";
import { initialState } from "./machine";
import { interpret } from "./interpret";

describe("Spark 해석 어댑터 — 패스트푸드", () => {
  it("메뉴 id를 enum으로 묶은 JSON 스키마로 Spark에 요청하고, 응답의 null 칸은 빼서 주문 의도로 돌려준다", async () => {
    let sent: { url: string; body: Record<string, any> } | undefined;
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      sent = { url: String(url), body: JSON.parse(String(init?.body)) };
      const content = JSON.stringify({
        orderType: "eat_in",
        items: [{ menuId: "double_cheese", mode: "set", size: "L", side: "fries", drink: "zero_cola", remove: ["pickle"], addOns: [], qty: 1 }],
        unknownItems: [],
        checkout: true,
        requestPayment: false,
        replyLanguage: "ko",
        say: "더블 치즈버거 라지 세트, 제로 콜라, 피클 빼고 매장에서 드시는 걸로 담았어요.",
      });
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 900, completion_tokens: 80 } }), { status: 200 });
    };

    const r = await interpret("더블 치즈버거 라지 세트, 음료는 제로 콜라로, 피클 빼고, 먹고 갈게요", initialState(), { apiKey: "test", fetch: fakeFetch });

    expect(sent!.url).toBe("https://api.meta.ai/v1/chat/completions");
    expect(sent!.body.model).toBe("muse-spark-1.3");
    const schema = sent!.body.response_format.json_schema.schema;
    expect(schema.properties.items.items.properties.menuId.enum).toContain("double_cheese");
    expect(schema.properties.items.items.properties.menuId.enum).not.toContain("big_mac");

    expect(r.intent).toEqual({
      orderType: "eat_in",
      items: [{ menuId: "double_cheese", mode: "set", size: "L", side: "fries", drink: "zero_cola", remove: ["pickle"], addOns: [], qty: 1 }],
      checkout: true,
      requestPayment: false,
    });
    expect(r.unknownItems).toEqual([]);
    expect(r.replyLanguage).toBe("ko");
    expect(r.say).toContain("제로 콜라");
  });
});
