import { describe, expect, it } from "vitest";
import { initialState } from "./machine";
import { interpret } from "./interpret";

describe("Spark 해석 어댑터 — 패스트푸드", () => {
  it("메뉴 id를 enum으로 묶은 JSON 스키마로 Spark에 요청하고, 응답의 null 칸은 빼서 주문 의도로 돌려준다", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 요청 본문을 깊게 들여다보는 테스트
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

    const r = await interpret("더블 치즈버거 라지 세트, 음료는 제로 콜라로, 피클 빼고, 먹고 갈게요", initialState(), undefined, { apiKey: "test", fetch: fakeFetch });

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

  it("진행 중 상품과 앞 턴에 되물은 의도를 요약에 넣고, 진행 중 상품에 대한 말(current)은 none을 빼서 돌려준다", async () => {
    let user = "";
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      user = JSON.parse(String(init?.body)).messages[1].content;
      const content = JSON.stringify({
        orderType: "none",
        items: [],
        current: { mode: "none", size: "L", side: "none", drink: "cola", remove: [], addOns: [], qty: 0 },
        dropCurrent: false,
        unknownItems: [],
        checkout: false,
        requestPayment: false,
        replyLanguage: "ko",
        say: "라지, 콜라로 할게요.",
      });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    };
    const stuck = { ...initialState(), screen: "set_size" as const, orderType: "eat_in" as const, draft: { menuId: "double_cheese", mode: "set" as const, size: null, side: null, drink: null, remove: [], add: [], qty: 1 } };
    const r = await interpret("라지, 콜라요", stuck, { items: [{ menuId: "apple_pie" }], checkout: true }, { apiKey: "test", fetch: fakeFetch });
    expect(user).toContain("In progress on screen (not in cart yet): Double Cheeseburger, set, size ?, side ?, drink ?");
    expect(user).toContain('Asked a question last turn about: {"items":[{"menuId":"apple_pie"}],"checkout":true}');
    expect(r.intent).toEqual({ items: [], current: { size: "L", drink: "cola" }, checkout: false, requestPayment: false });
  });
});
