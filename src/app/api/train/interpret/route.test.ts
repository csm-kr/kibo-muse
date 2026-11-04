import { afterEach, describe, expect, it, vi } from "vitest";
import { initialState } from "@/kiosks/train/machine";
import { plan } from "@/kiosks/train/planner";
import { POST } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const said = (over: Record<string, unknown>) => {
  vi.stubEnv("MODEL_API_KEY", "test");
  vi.stubGlobal("fetch", async () => {
    const content = JSON.stringify({ from: "none", to: "none", day: -1, hour: -1, adults: -1, children: -1, seniors: -1, seatClass: "none", trainType: "none", seats: "none", unknownPlace: "", unsupported: "none", exit: false, replyLanguage: "ko", say: "다 했어요.", ...over });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  });
};
// q: 주소 뒤에 붙일 것(휴대폰이 보내는 ?lang=)
const post = async (utterance: string, q = "") => (await POST(new Request(`http://x/api/train/interpret${q}`, { method: "POST", body: JSON.stringify({ utterance, state: initialState() }) }))).json();

describe("/api/train/interpret", () => {
  it("한 문장이면 결제하기 바로 앞(예약 확인)까지 KIBO 탭만으로 계획하고, 결제는 사람에게 넘긴다. 대답은 고정 문구다", async () => {
    said({ to: "harbor", day: 1, hour: 9, adults: 2, trainType: "express", seats: "window" });
    const body = await post("내일 아침 9시쯤 등대항 가는 고속열차, 어른 2명, 창가 쪽 나란히");
    expect(body.plan.kind).toBe("plan");
    expect(body.plan.events.every((e: { by: string }) => e.by === "kibo")).toBe(true);
    expect(body.plan.stop).toMatchObject({ kind: "human", what: "pay" });
    expect(body.paymentHandoff).toBe(true);
    expect(body.gate).toBeNull();
    // 누르기 전에 알아들은 것(도착역·날·시각·인원)을 먼저 말한다
    expect(body.say).toMatch(new RegExp(`^등대항행 내일 09:\\d\\d, 어른 2명\\. 알겠어요\\. 제가 ${body.plan.events.length}번 눌러 드릴게요\\.$`));
    // 휴대폰은 lead를 받아 '몇 번 눌러 드릴게요' 앞에 말한다(키오스크 콘솔 say와 같은 순서)
    expect(body.lead).toMatch(/^등대항행 내일 09:\d\d, 어른 2명\.$/);
  });

  it("휴대폰 언어(?lang)가 대답 언어다: Spark가 영어를 골라도 한국어 휴대폰에는 한국어 고정 문구로 답한다", async () => {
    said({ to: "harbor", day: 1, hour: 9, adults: 2, trainType: "express", seats: "window", replyLanguage: "en" });
    const body = await post("Harbor 가는 express, 내일 9시 어른 2명 창가", "?lang=ko");
    expect(body.say).toMatch(new RegExp(`알겠어요\\. 제가 ${body.plan.events.length}번 눌러 드릴게요\\.$`));
    expect(body.replyLanguage).toBe("ko");
  });

  it("한국어 휴대폰에 순수 영어 문장이면 영어 고정 문구로 답하고 followSpoken을 붙인다(역 이름은 판정에서 뺀다)", async () => {
    said({ to: "harbor", day: 1, hour: 9, adults: 2, trainType: "express", seats: "window", replyLanguage: "en" });
    const body = await post("Two adults to Harborlight tomorrow at nine, window seats please", "?lang=ko");
    expect(body.replyLanguage).toBe("en");
    expect(body.followSpoken).toBe(true);
    expect(body.say).toMatch(new RegExp(`^To Harborlight, tomorrow 09:\\d\\d, 2 adults\\. Got it\\. I'll make the ${body.plan.events.length} taps for you\\.$`));
  });

  it("거절 문구 속 버튼 이름은 키오스크 화면 글자다(나가기 = 화면 위 [처음으로]·[Home]). 휴대폰 언어로 옮기지 않는다", async () => {
    said({ exit: true });
    const at = async (lang: "ko" | "en", q: string) => (await POST(new Request(`http://x/api/train/interpret${q}`, { method: "POST", body: JSON.stringify({ utterance: "stop", state: initialState(lang) }) }))).json();
    const vn = await at("ko", "?lang=vi");
    expect(vn.say).toContain("[처음으로]");
    expect(vn.say).not.toContain("[Về đầu]");
    expect((await at("en", "?lang=ko")).say).toContain("[Home]");
  });

  it("왕복·환불 요청, 나가기, 노선에 없는 역, 지난 시각, 9명 초과는 계획하지 않고 고정 문구로 거절한다(Spark 문장을 쓰지 않는다)", async () => {
    said({ to: "harbor", unsupported: "round_trip" });
    expect(await post("등대항 왕복으로 끊어 줘")).toMatchObject({ plan: { kind: "reject", reason: "train_unsupported" }, gate: null, say: "편도 승차권 예매만 도와드릴 수 있어요. 왕복·환불·변경은 화면에서 직접 해 주세요." });
    said({ exit: true });
    expect((await post("그만할래요")).say).toBe("처음으로 가려면 화면 위 [Home]를 눌러 주세요. 결제된 것은 없어요.");
    said({ unknownTo: "부산" });
    expect((await post("부산 가는 표")).plan).toEqual({ kind: "reject", reason: "unknown_station" });
    // 없는 출발역은 도착역이 있어도 거절한다(브리지중앙 출발로 바꿔 예약하지 않는다)
    said({ to: "harbor", day: 1, hour: 9, adults: 1, unknownFrom: "부산" });
    expect((await post("부산에서 등대항 가는 거, 내일 9시에 어른 한 명이요.")).plan).toEqual({ kind: "reject", reason: "unknown_station" });
    // 화면에 없는 할인(장애인 등)은 어른 요금으로 예약하지 않는다
    said({ to: "midvale", day: 1, hour: 11, adults: 2, unsupported: "other_discount" });
    expect(await post("장애인 한 명이랑 보호자 한 명, 내일 11시 미드베일")).toMatchObject({ plan: { kind: "reject", reason: "train_discount" }, say: "이 발매기는 어른·어린이·경로 요금만 팔아요. 장애인 등 다른 할인은 매표 창구에 문의해 주세요." });
    // 발매기 시각(13:00)보다 이른 오늘 열차는 이유와 함께 거절한다
    said({ to: "harbor", day: 0, hour: 9, adults: 1 });
    expect(await post("오늘 9시 등대항 어른 1명")).toMatchObject({ plan: { kind: "reject", reason: "past_time" }, say: "지금은 13:00이라 그보다 이른 열차는 예매할 수 없어요. 13:00 이후나 다른 날로 말해 주세요." });
    said({ to: "harbor", day: 1, hour: 9, adults: 12 });
    expect(await post("내일 9시 등대항 어른 12명")).toMatchObject({ plan: { kind: "reject", reason: "bad_passengers" }, say: "한 번에 9명까지 예매할 수 있어요. 9명 이하로 나눠서 한 번에 한 묶음씩 말씀해 주세요." });
  });

  it("되묻기·노선에 없는 역·할 일 없는 말은 Spark 문장으로 답한다(질문에 답하고 빠진 것을 묻는다). 역 {id}는 정확한 이름으로 채운다", async () => {
    said({ to: "harbor", say: "{harbor} 가는 고속열차는 30분마다 있어요. 언제, 몇 분이 타세요?" });
    expect(await post("등대항 가는 거 몇 시에 있어요?")).toMatchObject({ plan: { kind: "clarify" }, say: "등대항 가는 고속열차는 30분마다 있어요. 언제, 몇 분이 타세요?" });
    said({ unknownTo: "부산", say: "부산은 이 발매기 노선에 없어요. 바다 쪽이면 {coralbay}이나 {harbor}은 어떠세요?" });
    expect(await post("부산 가는 표")).toMatchObject({ plan: { kind: "reject", reason: "unknown_station" }, say: "부산은 이 발매기 노선에 없어요. 바다 쪽이면 산호만이나 등대항은 어떠세요?" });
    // 예약 화면까지 온 뒤 결제를 부탁하는 말: 누를 것이 없으면 Spark가 할 수 있는 일을 알린다
    said({ to: "harbor", day: 1, hour: 15, adults: 2 });
    const booked = await post("내일 3시 등대항 어른 둘");
    expect(booked.booked).toMatch(/^내일 15:\d\d 출발 등대항행/);
    const at = plan(initialState(), booked.intent);
    if (at.kind !== "plan") throw new Error(at.kind);
    said({ say: "결제는 제가 할 수 없어요. 화면의 [Pay]를 직접 눌러 주세요." });
    const after = await (await POST(new Request("http://x/api/train/interpret", { method: "POST", body: JSON.stringify({ utterance: "결제도 해 주세요", state: at.final, pending: booked.intent }) }))).json();
    expect(after.plan.events).toHaveLength(0);
    expect(after.say).toBe("결제는 제가 할 수 없어요. 화면의 [Pay]를 직접 눌러 주세요.");
    expect(after.answer).toBe(after.say);
  });

  it("Spark 문장이 역 이름을 틀리게 쓰거나 모르는 {id}를 쓰면 빠진 것만 묻는 고정 문구로 바꾼다. 같은 역·7일 넘는 날·고를 수 없는 시각·맞는 열차 없음은 이유별 고정 문구로 거절한다", async () => {
    said({ to: "willow", day: 0, adults: 1, say: "버들둱으로 가시는 몇 시 열차로 하시겠어요?" });
    expect(await post("지금 바로 버들둑 가요. 어른 한 명.")).toMatchObject({ plan: { kind: "clarify", missing: ["date"] }, say: "몇 시쯤 출발할까요?" });
    said({ to: "willow", day: 0, adults: 1, say: "{busan}은 없어요. 몇 시에 가세요?" });
    expect((await post("지금 바로 버들둑 가요. 어른 한 명.")).say).toBe("몇 시쯤 출발할까요?");
    // 어린이만 남으면 묻는다. 묻기 전에 해석이 낸 '어린이만'은 받지 않고, 물은 뒤의 확인만 받는다
    said({ to: "willow", day: 1, hour: 9, children: 1, childrenOnly: true });
    const kid = await post("내일 9시 버들둑, 아이 한 명");
    expect(kid).toMatchObject({ plan: { kind: "clarify", missing: ["child_only"] }, say: "어린이만 타는 표로 예매할까요? 함께 타는 어른이 있으면 말씀해 주세요." });
    said({ childrenOnly: true });
    const yes = await (await POST(new Request("http://x/api/train/interpret", { method: "POST", body: JSON.stringify({ utterance: "네, 아이만요", state: initialState(), pending: kid.intent }) }))).json();
    expect(yes.plan).toMatchObject({ kind: "plan", stop: { kind: "human" } });
    const cases: [Record<string, unknown>, string, string][] = [
      [{ from: "harbor", to: "harbor", day: 1, hour: 9, adults: 1 }, "same_station", "출발역과 도착역이 같아요. 다른 역으로 말해 주세요."],
      [{ to: "harbor", day: 14, hour: 9, adults: 1 }, "bad_day", "오늘부터 6일 뒤까지만 예매할 수 있어요. 그 안의 날짜로 말해 주세요."],
      [{ to: "harbor", day: 1, hour: 3, adults: 1 }, "bad_hour", "시각은 05:00부터 23:00 사이로 고를 수 있어요. 그 사이 시각으로 말해 주세요."],
      [{ to: "harbor", day: 1, hour: 9, adults: 1, trainType: "local", seatClass: "first" }, "no_trains_available", "그 시각 이후로 조건에 맞는 빈자리 열차가 없어요. 다른 시각이나 날, 등급으로 말해 주세요."],
    ];
    for (const [over, reason, say] of cases) {
      said(over);
      expect(await post("표 주세요")).toMatchObject({ plan: { kind: "reject", reason }, say });
    }
  });

  it("공개 배포(속도 제한 켬): 같은 IP의 21번째 해석은 429와 고정 문구, 500자 넘는 말은 413이다(Spark를 부르지 않는다)", async () => {
    vi.stubEnv("KIBO_RATE_LIMIT", "on");
    said({ to: "harbor", day: 1, hour: 9, adults: 1 });
    const call = (utterance: string) => POST(new Request("http://x/api/train/interpret", { method: "POST", headers: { "x-forwarded-for": "203.0.113.9", "accept-language": "ko-KR,ko;q=0.9" }, body: JSON.stringify({ utterance, state: initialState() }) }));
    const big = await call("가".repeat(501));
    expect(big.status).toBe(413);
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) codes.push((await call("내일 9시 등대항 어른 1명")).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(19);
    const last = await call("내일 9시 등대항 어른 1명");
    expect(last.status).toBe(429);
    expect((await last.json()).say).toBe("요청이 너무 많아요. 잠시 뒤에 다시 말해 주세요.");
  });
});
