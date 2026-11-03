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
// q: 주소 뒤에 붙일 것(휴대폰이 보내는 ?lang=)
const call = async (utterance: string, q = "") => (await POST(new Request(`http://x/api/fastfood/interpret${q}`, { method: "POST", body: JSON.stringify({ utterance, state: initialState() }) }))).json();

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
    expect(cancelled.say).toBe("주문 전체 취소는 화면의 [Start over]를 직접 눌러 주세요.");
  });

  it("되묻기 Spark 문장이 다른 언어 문자를 섞으면(실측 「…1개ですね」) 담을 품목 이름과 빠진 칸으로 만든 고정 문구로 바꾸고, 섞이지 않았으면 그대로 쓴다", async () => {
    const line = { menuId: "double_cheese", mode: "set", size: "none", side: "fries", drink: "none", remove: [], addOns: [], qty: 1 };
    fakeSpark({ ...base, items: [line], unsupported: "none", replyLanguage: "ko", say: "더블 치즈버거 세트 1개ですね. 매장식사인가요 포장인가요?" });
    const mixed = await call("더블 치즈버거 세트 하나요");
    expect(mixed.plan.kind).toBe("clarify");
    expect(mixed.say).toBe("더블 치즈버거 세트 ×1 담을게요. 매장에서 드시나요, 포장하시나요? 사이즈는 M, L 중 무엇으로 할까요? 음료는 무엇으로 할까요?");

    fakeSpark({ ...base, items: [line], unsupported: "none", replyLanguage: "ko", say: "더블 치즈버거 세트 1개요? 매장인지 포장인지 알려주세요." });
    expect((await call("더블 치즈버거 세트 하나요")).say).toBe("더블 치즈버거 세트 1개요? 매장인지 포장인지 알려주세요.");
  });

  // 장면 8 리허설: 한국어 휴대폰인데 받아쓰기가 영어를 섞자 Spark가 영어로 되물었다
  const mixedKo = "Double Cheeseburger set 하나 제로 콜라로 먹고 갈게요";
  const sizeAsk = { ...base, orderType: "eat_in", items: [{ menuId: "double_cheese", mode: "set", size: "none", side: "none", drink: "zero_cola", remove: [], addOns: [], qty: 1 }], unsupported: "none", replyLanguage: "en", say: "Double Cheeseburger set one, Zero Cola, eat in. M or L size?" };

  it("휴대폰 언어(?lang)가 대답 언어다: Spark가 다른 언어로 되물으면 휴대폰 언어 고정 되묻기, 같은 언어면 Spark 문장을 쓴다", async () => {
    fakeSpark(sizeAsk);
    const ko = await call(mixedKo, "?lang=ko");
    expect(ko.plan.kind).toBe("clarify");
    expect(ko.say).toBe("더블 치즈버거 세트 ×1 담을게요. 사이즈는 M, L 중 무엇으로 할까요?");
    expect(ko.replyLanguage).toBe("ko");
    // 장면 8: 한글이 섞인 말이라 Spark가 영어로 봐도 휴대폰 언어를 바꾸라고 하지 않는다
    expect(ko.followSpoken).toBeUndefined();
    // 같은 언어 판정은 정규화한다(Korean = ko-KR)
    fakeSpark({ ...sizeAsk, replyLanguage: "ko-KR", say: "더블 치즈버거 세트 1개, 사이즈는 M, L 중 어느 걸로 할까요?" });
    expect((await call(mixedKo, "?lang=Korean")).say).toBe("더블 치즈버거 세트 1개, 사이즈는 M, L 중 어느 걸로 할까요?");
  });

  it("말한 언어가 휴대폰 언어와 분명히 다르면(한국어 휴대폰 + 순수 영어 문장) 영어로 답하고 followSpoken을 붙인다", async () => {
    fakeSpark(sizeAsk);
    const en = await call("Can I get a Double Cheeseburger meal with a Zero Cola, for here please", "?lang=ko");
    expect(en.replyLanguage).toBe("en");
    expect(en.followSpoken).toBe(true);
    expect(en.say).toBe(sizeAsk.say);
  });

  it("휴대폰 언어(?lang)가 있으면 계획·거절 문구도 그 언어다", async () => {
    fakeSpark({ ...sizeAsk, items: [], say: "Okay." });
    const planned = await call("eat in", "?lang=ko");
    expect(planned.plan.kind).toBe("plan");
    expect(planned.say).toBe(planSay(planned.plan.events.length, "ko"));
    expect(planned.replyLanguage).toBe("ko");
    fakeSpark({ ...sizeAsk, unsupported: "cancel_order" });
    expect((await call("cancel everything", "?lang=ko")).say).toBe("주문 전체 취소는 화면의 [Start over]를 직접 눌러 주세요.");
  });

  it("?lang이 없으면(평가 하네스·옛 클라이언트) 지금처럼 Spark가 고른 언어로 답한다", async () => {
    fakeSpark(sizeAsk);
    const body = await call(mixedKo);
    expect(body.say).toBe(sizeAsk.say);
    expect(body.replyLanguage).toBe("en");
  });

  it("거절 문구 속 버튼 이름은 키오스크 화면 글자다(주문 전체 취소 = 화면의 [처음으로]·[Start over]). 휴대폰 언어로 옮기지 않는다", async () => {
    const post = async (lang: "ko" | "en", q: string) => (await POST(new Request(`http://x/api/fastfood/interpret${q}`, { method: "POST", body: JSON.stringify({ utterance: "cancel", state: initialState(lang) }) }))).json();
    fakeSpark({ ...base, unsupported: "cancel_order" });
    const vi = await post("ko", "?lang=vi");
    expect(vi.say).toContain("[처음으로]");
    expect(vi.say).not.toContain("[Hủy]");
    expect((await post("en", "?lang=ko")).say).toContain("[Start over]");
  });
});
