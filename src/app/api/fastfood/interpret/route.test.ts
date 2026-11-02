import { afterEach, describe, expect, it, vi } from "vitest";
import { planSay } from "@/engine/turn";
import { initialState } from "@/kiosks/fastfood/machine";
import { POST } from "./route";

// Spark 응답을 흉내 낸다. 요청 본문은 sent에 남긴다
function fakeSpark(json: object) {
  const sent: { body?: { response_format: { json_schema: { schema: { properties: Record<string, { enum?: string[] }> } } }; messages: { content: string }[] } } = {};
  vi.stubEnv("MODEL_API_KEY", "test");
  vi.stubGlobal("fetch", async (_u: string, init?: RequestInit) => {
    sent.body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(json) } }] }), { status: 200 });
  });
  return sent;
}
const base = { orderType: "none", items: [], current: { mode: "none", size: "none", side: "none", drink: "none", remove: [], addOns: [], qty: 0 }, dropCurrent: false, unknownItems: [], checkout: false, requestPayment: false, replyLanguage: "ko", say: "피클을 뺐어요." };
const call = async (utterance: string) => (await POST(new Request("http://x/api/fastfood/interpret", { method: "POST", body: JSON.stringify({ utterance, state: initialState() }) }))).json();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/api/fastfood/interpret", () => {
  it("담긴 줄 바꾸기·빼기·주문 취소(unsupported)는 계획하지 않고 거절한다. Spark가 했다고 말해도 그 말은 쓰지 않고 고정 문구로 덮는다", async () => {
    const sent = fakeSpark({ ...base, unsupported: "remove_cart_item" });
    const body = await call("담은 버거에서 피클 빼 주세요");
    expect(sent.body!.response_format.json_schema.schema.properties.unsupported.enum).toEqual(["none", "change_cart_item", "remove_cart_item", "cancel_order"]);
    expect(sent.body!.messages[0].content).toContain("Never lower or cap it");
    // ff-m2 회귀: "make that two apple pies in total"은 담긴 줄 바꾸기가 아니라 차이만큼 더 담기다. 줄이기만 unsupported
    expect(sent.body!.messages[0].content).toContain('"N in total" / "make it N" for an item already in the cart = add only the difference');
    expect(body.plan).toEqual({ kind: "reject", reason: "unsupported" });
    // 키오스크 입력 패널·휴대폰에 "피클을 뺐어요" 같은 하지 않은 일이 보이지 않게 한다
    expect(body.say).not.toBe(base.say);
    expect(body.say).toBe("담긴 상품을 바꾸거나 빼는 건 주문 확인 화면에서 직접 눌러 주세요.");
  });

  it("say는 되묻기(clarify)만 Spark 문장을 쓰고, 계획과 거절은 고정 문구다. 주문 전체 취소는 전용 문구로 거절한다", async () => {
    // ff-m4: Spark가 결제 전인데 "注文を確定しました"라고 써도 키오스크 패널·휴대폰에 나가지 않는다
    fakeSpark({ ...base, orderType: "eat_in", unsupported: "none", replyLanguage: "ja", say: "注文を確定しました。" });
    const planned = await call("店内で食べます");
    expect(planned.plan.kind).toBe("plan");
    expect(planned.say).not.toContain("確定");
    expect(planned.say).toBe(planSay(planned.plan.events.length, "ja"));

    fakeSpark({ ...base, unsupported: "cancel_order", say: "주문을 취소했어요." });
    const cancelled = await call("전부 취소해 주세요");
    expect(cancelled.plan).toEqual({ kind: "reject", reason: "cancel_order" });
    expect(cancelled.say).toBe("주문 전체 취소는 화면의 [취소]를 직접 눌러 주세요.");
  });
});
