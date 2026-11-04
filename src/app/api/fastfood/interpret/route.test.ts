import { afterEach, describe, expect, it, vi } from "vitest";
import { planSay, rejectSay } from "@/engine/turn";
import { initialState, step, type KioskEvent, type KioskState } from "@/kiosks/fastfood/machine";
import { plan, type FastfoodIntent } from "@/kiosks/fastfood/planner";
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
  it("주문이 아닌 말(인사·메뉴 질문)은 일반 거절이 아니라 Spark 응대 문장으로 답한다. 첫 화면이면 [Order here]만 먼저 눌러 매장·포장 화면을 띄운다(아는 만큼 먼저 누르기). 휴대폰 언어와 다른 문장이면 고정 인사로 바꾼다(11/4 실기기 '안녕하세요')", async () => {
    fakeSpark({ ...base, unsupported: "none", say: "제일 싼 버거는 불고기버거 4,800원입니다." });
    const chat = await call("제일 싼 버거가 뭐예요?", "?lang=Korean");
    // 매장·포장 화면을 띄웠으니 휴대폰에 [먹고 갈게요][포장할게요] 칩이 붙게 그 칸을 빠진 것으로 보낸다
    expect(chat.plan).toEqual({ kind: "clarify", missing: [{ field: "orderType" }], events: [{ by: "kibo", target: "start" }] });
    expect(chat.say).toBe("제일 싼 버거는 불고기버거 4,800원입니다.");
    // 첫 화면이 아니면 누르지 않는다
    const menu = { ...initialState(), screen: "order_type" };
    const r2 = await (await POST(new Request("http://x/api/fastfood/interpret?lang=Korean", { method: "POST", body: JSON.stringify({ utterance: "제일 싼 버거가 뭐예요?", state: menu }) }))).json();
    expect(r2.plan.kind).toBe("reject");
    expect(r2.say).toBe("제일 싼 버거는 불고기버거 4,800원입니다.");
    // 메뉴 화면(매장 식사가 이미 정해짐)에서 Spark가 그 값을 되풀이해 내도 할 일이 없는 말이다(11/4 실기기 "무슨 버거 있어?"에 '누를 버튼이 없어요')
    fakeSpark({ ...base, orderType: "eat_in", unsupported: "none", say: "버거는 불고기버거, 새우버거가 있어요." });
    const onMenu = { ...initialState(), screen: "menu", orderType: "eat_in" };
    const r3 = await (await POST(new Request("http://x/api/fastfood/interpret?lang=Korean", { method: "POST", body: JSON.stringify({ utterance: "무슨 버거 있어요?", state: onMenu }) }))).json();
    expect(r3.say).toBe("버거는 불고기버거, 새우버거가 있어요.");
    // 누를 것 없는 계획이라 휴대폰은 answer를 받아 '누를 버튼이 없어요' 대신 말한다
    expect(r3.plan).toMatchObject({ kind: "plan", events: [] });
    expect(r3.answer).toBe("버거는 불고기버거, 새우버거가 있어요.");
    fakeSpark({ ...base, unsupported: "none", replyLanguage: "en", say: "Hi! What would you like?" });
    expect((await call("안녕하세요", "?lang=Korean")).say).toBe(rejectSay("chat", "ko"));
  });

  it("평가 전용 x-eval-model 헤더(개발 서버에서만)로 Spark 판본을 바꿔 같은 평가 세트를 비교한다. production에서는 무시한다", async () => {
    const req = () => new Request("http://x/api/fastfood/interpret", { method: "POST", headers: { "x-eval-model": "muse-spark-1.1" }, body: JSON.stringify({ utterance: "콜라 하나", state: initialState() }) });
    const sent = fakeSpark({ ...base, unsupported: "none" });
    await POST(req());
    expect((sent.body as unknown as { model: string }).model).toBe("muse-spark-1.1");
    vi.stubEnv("NODE_ENV", "production");
    const prod = fakeSpark({ ...base, unsupported: "none" });
    await POST(req());
    expect((prod.body as unknown as { model: string }).model).not.toBe("muse-spark-1.1");
  });

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
    // 바꿔 달라는 것이 메뉴에 없으면 그것부터 말한다(11/4 판정: "콜라 말고 사이다로요")
    fakeSpark({ ...base, unsupported: "change_cart_item", unknownItems: ["사이다"] });
    expect((await call("아 콜라 말고 사이다로요", "?lang=Korean")).say).toBe("사이다는 메뉴에 없어요. 담긴 상품을 바꾸거나 빼는 건 주문 확인 화면에서 직접 눌러 주세요.");
  });

  it("say는 되묻기(clarify)만 Spark 문장을 쓰고, 계획과 거절은 고정 문구다. 주문 전체 취소는 전용 문구로 거절한다", async () => {
    // ff-m4: Spark가 결제 전인데 "注文を確定しました"라고 써도 키오스크 패널·휴대폰에 나가지 않는다
    fakeSpark({ ...base, orderType: "eat_in", unsupported: "none", replyLanguage: "ja", say: "注文を確定しました。" });
    const planned = await call("店内で食べます");
    expect(planned.plan.kind).toBe("plan");
    expect(planned.say).not.toContain("確定");
    // 고정 문구 앞에는 알아들은 내용(이번에 정한 매장 식사)을 먼저 말한다. 휴대폰은 lead를 받아 같은 순서로 말한다
    expect(planned.lead).toBe("店内。");
    expect(planned.say).toBe(`店内。${planSay(planned.plan.events.length, "ja")}`);

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
    expect(mixed.say).toBe("더블 치즈버거 세트 담을게요. 매장·포장, 사이즈(M·L), 음료만 알려 주세요.");

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
    expect(ko.say).toBe("더블 치즈버거 세트 담을게요. 사이즈는 M, L 중 무엇으로 할까요?");
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
    expect(planned.say).toBe(`매장 식사. ${planSay(planned.plan.events.length, "ko")}`);
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

  it("휴대폰 답 칩(answer)은 Spark를 부르지 않고 앞 의도에 답을 합쳐 바로 계획한다. 사이즈 칩 두 턴에 한 번만 담고, '그게 다예요'는 주문 확인까지. 상태가 바뀌어 맞지 않으면 Spark 길", async () => {
    let sparkCalls = 0;
    vi.stubEnv("MODEL_API_KEY", "test");
    vi.stubGlobal("fetch", async () => {
      sparkCalls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...base, unsupported: "none" }) } }] }), { status: 200 });
    });
    const post = async (state: KioskState, answer: object, pending?: FastfoodIntent) =>
      (await POST(new Request("http://x/api/fastfood/interpret?lang=Korean", { method: "POST", body: JSON.stringify({ utterance: "칩", state, pending, answer }) }))).json();
    const run = (s: KioskState, events: KioskEvent[]) => events.reduce((x, e) => (step(x, e) as { state: KioskState }).state, s);
    // 첫 턴(되묻기): 사이즈만 빠짐. 아는 만큼 먼저 누른 뒤 사이즈 화면에서 멈춘다
    const pending: FastfoodIntent = { orderType: "eat_in", items: [{ menuId: "double_cheese", mode: "set", drink: "zero_cola", qty: 1 }] };
    const first = plan(initialState(), pending);
    if (first.kind !== "clarify") throw new Error(first.kind);
    const s1 = run(initialState(), first.events);
    const size = await post(s1, { field: "size", value: "L" }, pending);
    expect(sparkCalls).toBe(0);
    expect(size.plan.kind).toBe("plan");
    const s2 = run(s1, size.plan.events);
    expect(s2.cart.map((l) => [l.menuId, l.size, l.qty])).toEqual([["double_cheese", "L", 1]]);
    // 더 주문? → [그게 다예요]: 주문 확인 화면까지만(결제 넘기기 없음)
    expect(s2.screen).toBe("menu");
    const done = await post(s2, { field: "more" });
    expect(sparkCalls).toBe(0);
    expect(done.plan).toMatchObject({ kind: "plan", endScreen: "review", paymentHandoff: false });
    // 인사에 [Order here]를 눌러 매장·포장 화면이면 앞 의도 없이도 그 칩 하나로 계획한다
    const eatIn = await post(run(initialState(), [{ by: "kibo", target: "start" }]), { field: "orderType", value: "eat_in" });
    expect(sparkCalls).toBe(0);
    expect(eatIn.plan).toMatchObject({ kind: "plan", events: [{ target: "order_type", value: "eat_in" }], endScreen: "menu" });
    // 사람이 그새 사이즈를 골랐다(사이즈 화면이 아님) → Spark 길
    await post(run(s1, [{ by: "touch", target: "size", value: "M" }]), { field: "size", value: "L" }, pending);
    expect(sparkCalls).toBeGreaterThan(0);
  });
  it("결제·현금 질문처럼 할 일이 없는 말(장바구니가 빔)은 일반 거절 대신 Spark 답을 쓴다(11/4 판정: '결제도 해 주세요'·'Can I pay with cash?'에 '해 드릴 수 없어요'만)", async () => {
    fakeSpark({ ...base, requestPayment: true, unsupported: "none", replyLanguage: "en", say: "I can't take payment. Cash is only at the front counter; this kiosk takes cards and mobile vouchers." });
    const cash = await call("Can I pay with cash?");
    expect(cash.say).toContain("front counter");
    const onMenu = { ...initialState(), screen: "menu", orderType: "eat_in" };
    fakeSpark({ ...base, requestPayment: true, unsupported: "none", say: "결제는 직접 하셔야 해요. 먼저 무엇을 드릴까요?" });
    const r = await (await POST(new Request("http://x/api/fastfood/interpret?lang=Korean", { method: "POST", body: JSON.stringify({ utterance: "결제도 해 주세요", state: onMenu }) }))).json();
    expect(r.plan).toEqual({ kind: "reject", reason: "cart_empty" });
    expect(r.say).toBe("결제는 직접 하셔야 해요. 먼저 무엇을 드릴까요?");
  });

  it("계획에서 메뉴에 없는 말(unknownItems)은 담는 내용보다 먼저 없다고 말한다(11/4 판정: 사이다를 말없이 레몬 소다로 담음). 프롬프트에 칼로리·신메뉴·사이즈·결제 사실을 싣는다", async () => {
    const line = { menuId: "bulgogi", mode: "set", size: "M", side: "none", drink: "lemon_soda", remove: [], addOns: [], qty: 1 };
    const sent = fakeSpark({ ...base, orderType: "eat_in", items: [line], unknownItems: ["사이다"], unsupported: "none", say: "담았어요." });
    const r = await call("불고기버거 세트 미디엄에 사이다요, 매장에서요", "?lang=Korean");
    expect(r.plan.kind).toBe("plan");
    expect(r.lead).toBe("사이다는 메뉴에 없어요. 불고기버거 세트 M(감자튀김·레몬 소다), 매장 식사.");
    const prompt = sent.body!.messages[0].content;
    expect(prompt).toContain("510 kcal");
    expect(prompt).toMatch(/NEW/);
    expect(prompt).toContain("Cash payments at the front counter only");
    expect(prompt).toContain("suggest 1-3 real items");
    // "불고기로요"처럼 메뉴 이름만 말해도 주문이다(11/4 판정: 앞 질문 맥락 없이 아무것도 담지 않음)
    expect(prompt).toContain("A bare menu item name");
    // 방금 담긴 것을 확인만 하는 말은 다시 담지 않는다(11/4 판정: "그럼 레몬 소다로요"에 세트를 한 번 더 담음)
    expect(prompt).toContain("already in the cart, add nothing");
    // 11/5 r1 판정: 배달 질문에 '모르겠어요', 빈 장바구니에 Pay를 누르라고 함, 관계없는 질문 뒤 주문으로 이끌지 않음, 사이다를 레몬 소다로 바꿈
    for (const f of ["no delivery", "If the cart is empty", "then invite them to order", "name 1-3 real", "사이다", "Points: scan the app barcode", "When you must ask which item"]) expect(prompt).toContain(f);
  });
});
