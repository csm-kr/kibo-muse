import { describe, expect, it, vi } from "vitest";
import { statusSummary } from "@/kiosks/fastfood/ui/labels";
import { autoListen, bandHidden, bridgeTimeout, expireAsk, kioskCard, linkChip, orderLinesIn, phoneHint, statusLine, tapBridge } from "./status";
import { phoneText } from "./text";

const ff = { type: "status" as const, busy: false, kioskId: "fastfood" };

describe("휴대폰 상태 줄", () => {
  it("패스트푸드는 키오스크가 보낸 화면 id·개수·합계로 휴대폰 언어 문장을 만든다(키오스크가 아직 영어여도). 품목 이름은 키오스크 화면 글자 그대로. 0개·₩0은 뺀다", () => {
    const s = { ...ff, screen: "set_drink", items: 0, total: 0, label: "Choosing a drink", summary: statusSummary(0, 0, "en", "불고기버거 M 세트") };
    expect(statusLine(s, "ko-KR")).toEqual({ label: "음료 고르기", summary: "불고기버거 M 세트" });
    const review = { ...ff, screen: "review", items: 1, total: 6000, label: "Order review · you tap Pay", summary: statusSummary(1, 6000, "en", "불고기버거 M 세트"), lines: [{ name: "불고기버거 M 세트", detail: "", qty: 1 }] };
    expect(statusLine(review, "ko")).toEqual({ label: "주문 확인 · 결제는 직접", summary: "불고기버거 M 세트 · 1개 · ₩6,000" });
    expect(statusLine({ ...review, screen: "payment", paid: 664 }, "ko").label).toBe("결제 완료");
    // 띠가 버튼을 부르면 그 이름은 키오스크 화면 글자 그대로(번역하지 않는다. 키오스크에 'Thanh toán'·'支付' 버튼은 없다)
    expect(statusLine({ ...review, kioskLang: "en" }, "vi").label).toBe("Xem lại đơn · bạn tự bấm [Pay]");
    expect(statusLine({ ...review, kioskLang: "en" }, "es").label).toBe("Revisar pedido · tú pulsas [Pay]");
    expect(statusLine({ ...review, kioskLang: "ko" }, "zh").label).toBe("确认订单 · 请您自己点［결제하기］");
    expect(statusLine({ ...review, kioskLang: "ko" }, "en").label).toBe("Order review · you tap [결제하기]");
    expect(statusLine({ ...review, screen: "idle", items: 0, total: 0, summary: statusSummary(0, 0, "en"), lines: undefined }, "ko").summary).toBe("");
  });

  it("개수는 언어마다 바르게 쓴다(영어 1 item·2 items, 'item(s)'를 쓰지 않는다)", () => {
    const s = (items: number) => ({ ...ff, screen: "menu", items, total: 8300 * items });
    expect([statusLine(s(1), "en").summary, statusLine(s(2), "en").summary]).toEqual(["1 item · ₩8,300", "2 items · ₩16,600"]);
    expect([statusLine(s(2), "es").summary, statusLine(s(1), "ja").summary]).toEqual(["2 productos · ₩16,600", "1点 · ₩8,300"]);
  });

  it("공항·기차도 단계 이름은 화면 id로 휴대폰 언어로 만들고, 요약은 키오스크 것을 쓰되 비었으면 비운다('item(s)'로 채우지 않는다)", () => {
    const air = { type: "status" as const, busy: false, kioskId: "airport", screen: "seat_map", items: 2, total: 0, label: "좌석 고르기", summary: "여권 2개 · 좌석 3A·3B" };
    expect(statusLine(air, "en")).toEqual({ label: "Seat map", summary: "여권 2개 · 좌석 3A·3B" });
    const train = { type: "status" as const, busy: false, kioskId: "train", screen: "station", items: 0, total: 0, label: "역 고르기", summary: "" };
    expect(statusLine(train, "es")).toEqual({ label: "Elegir estación", summary: "" });
    // 모르는 화면은 키오스크가 보낸 이름
    expect(statusLine({ ...train, screen: "new_screen" }, "es").label).toBe("역 고르기");
  });

  it("공항은 실어 온 데이터(항공사 id·여권 수·좌석)로 휴대폰 언어 요약을 만든다. 이름은 ko면 한국어, 아니면 영어. 0인 칸은 뺀다", () => {
    const air = (a: { airline: string | null; passports: number; seats: string[] }) => ({ type: "status" as const, busy: false, kioskId: "airport", screen: "flight_info", items: a.passports, total: 0, summary: "0 passport(s)", air: a });
    const two = air({ airline: "bridge_air", passports: 2, seats: ["3A", "3B"] });
    expect([statusLine(two, "ko").summary, statusLine(two, "en").summary, statusLine(two, "vi").summary]).toEqual(["브리지항공 · 여권 2개 · 좌석 3A·3B", "Bridge Air · 2 passports · seats 3A·3B", "Bridge Air · 2 hộ chiếu · ghế 3A·3B"]);
    expect(statusLine(air({ airline: "bridge_air", passports: 1, seats: ["3A"] }), "es").summary).toBe("Bridge Air · 1 pasaporte · asiento 3A");
    expect(statusLine(air({ airline: null, passports: 0, seats: [] }), "ko").summary).toBe("");
  });

  it("기차는 출발·도착역 id·인원·좌석으로 만들고, 도착역을 정하기 전에는 비운다", () => {
    const rail = (r: { from: string; to: string | null; people: number; seats: string[] }) => ({ type: "status" as const, busy: false, kioskId: "train", screen: "seat_select", items: 0, total: 0, summary: "", rail: r });
    const trip = rail({ from: "central", to: "maple", people: 2, seats: ["7-1A", "7-1B"] });
    expect([statusLine(trip, "ko").summary, statusLine(trip, "es").summary]).toEqual(["브리지중앙 → 단풍언덕 · 2명 · 7호차 1A·1B", "Bridge Central → Maple Hill · 2 pasajeros · Coche 7 1A·1B"]);
    expect(statusLine(rail({ from: "central", to: "maple", people: 1, seats: [] }), "en").summary).toBe("Bridge Central → Maple Hill · 1 passenger");
    expect(statusLine(rail({ from: "central", to: null, people: 1, seats: [] }), "ko").summary).toBe("");
  });

  it("공항 부치는 짐 개수, 기차 타는 날·출발 시각·좌석 등급도 휴대폰 언어로 쓴다. 짐은 0개여도 정했으면 보인다(결제·확정 전에 사람이 휴대폰으로 맞는지 본다)", () => {
    const air = { type: "status" as const, busy: false, kioskId: "airport", screen: "bag_count", items: 2, total: 0, summary: "", air: { airline: "bridge_air", passports: 2, seats: ["3A", "3B"], bags: 1 } };
    expect(statusLine(air, "vi").summary).toBe("Bridge Air · 2 hộ chiếu · ghế 3A·3B · 1 kiện hành lý ký gửi");
    expect(statusLine({ ...air, air: { ...air.air, bags: 0 } }, "ko").summary).toBe("브리지항공 · 여권 2개 · 좌석 3A·3B · 부치는 짐 0개");
    // 2026-11-04는 수요일
    const rail = { type: "status" as const, busy: false, kioskId: "train", screen: "reservation", items: 0, total: 0, summary: "", rail: { from: "central", to: "maple", people: 1, seats: ["7-1A"], date: "2026-11-04", dep: "10:30", cls: "general" as const } };
    expect(statusLine(rail, "vi").summary).toBe("Bridge Central → Maple Hill · T4, 4/11 · khởi hành 10:30 · ghế thường · 1 hành khách · Toa 7 1A");
    expect(statusLine({ ...rail, rail: { ...rail.rail, cls: "first" as const } }, "ko").summary).toBe("브리지중앙 → 단풍언덕 · 11/4(수) · 10:30 출발 · 특실 · 1명 · 7호차 1A");
  });

  it("키오스크가 첫 화면이고 비어 있으면(장바구니·여권 0) 위 띠를 숨긴다. 조작 중이거나 담긴 것이 있으면 보인다", () => {
    const idle = { type: "status" as const, busy: false, kioskId: "fastfood", screen: "idle", items: 0, total: 0 };
    expect([bandHidden(idle), bandHidden({ ...idle, kioskId: "airport" }), bandHidden({ ...idle, items: 1 }), bandHidden({ ...idle, busy: true, steps: 3 }), bandHidden({ ...idle, screen: "menu" })]).toEqual([true, true, false, false, false]);
  });

  it("패스트푸드 원자료(cart·draft)가 오면 품목 이름을 휴대폰 언어로 다시 만든다(ko면 ko, 그 밖은 en: 키오스크 표시 규칙). 없으면 키오스크 글 그대로", () => {
    const meal = { menuId: "double_cheese", mode: "set" as const, size: "M" as const, side: "fries", drink: "cola", remove: ["pickle"], add: ["bacon"], qty: 1, unitPrice: 8500 };
    const lines = [{ name: "Double Cheeseburger M Meal", detail: "French Fries · Cola · − Pickles · + Bacon", qty: 1 }];
    const review = { ...ff, screen: "review", items: 1, total: 8500, summary: statusSummary(1, 8500, "en", lines[0].name), lines, cart: [meal], draft: null };
    expect(statusLine(review, "ko").summary).toBe("더블 치즈버거 M 세트 · 1개 · ₩8,500");
    expect(orderLinesIn(review, "ko")).toEqual([{ name: "더블 치즈버거 M 세트", detail: "감자튀김 · 콜라 · − 피클 · + 베이컨 추가", qty: 1 }]);
    expect(orderLinesIn(review, "vi")).toEqual(lines);
    // 담는 중이면 draft 이름. 키오스크가 lines를 보내지 않은 화면에서는 줄도 만들지 않는다
    const choosing = { ...review, screen: "set_size", items: 0, total: 0, lines: undefined, cart: [], draft: { ...meal, size: null } };
    expect([statusLine(choosing, "ko").summary, orderLinesIn(choosing, "ko")]).toEqual(["더블 치즈버거 세트", undefined]);
    // 원자료가 없으면(옛 키오스크) 키오스크가 보낸 글
    expect([orderLinesIn({ lines }, "ko"), statusLine({ ...review, cart: undefined, draft: undefined }, "ko").summary]).toEqual([lines, "Double Cheeseburger M Meal · 1개 · ₩8,500"]);
  });

  it("머리줄 연결 칩: 한 번 연결된 뒤 끊기면 '다시 연결 중'(키오스크 이름 대신), 처음 연결 전에는 '연결 전'", () => {
    expect([linkChip(true, true, true), linkChip(true, false, true), linkChip(false, false, false), linkChip(false, true, true), linkChip(true, null, false)]).toEqual(["kiosk", "reconnecting", "none", "none", "kiosk"]);
  });

  it("마이크 아래 안내 줄: 두 번 탭으로 시작한 녹음은 '다시 두 번 탭하면 보내요', 결제가 끝난 뒤라도 KIBO가 되물으면 '대답하세요'가 앞선다", () => {
    const ko = phoneText("ko");
    const base = { recording: false, toggled: false, waiting: false, longWait: false, notice: null, operating: false, asking: false, orderCard: null };
    // 보낸 뒤 3초가 지나도 대답이 없으면 '말씀을 이해하는 중이에요 · 보통 5–10초'
    expect(phoneHint(ko, { ...base, waiting: true })).toBe(ko.thinking);
    expect(phoneHint(ko, { ...base, waiting: true, longWait: true })).toBe(ko.waitLong);
    expect(phoneHint(ko, { ...base, recording: true })).toBe(ko.listening);
    expect(phoneHint(ko, { ...base, recording: true, toggled: true })).toBe(ko.toggleOn);
    // 듣는 중 KIBO가 말하고 있으면 탭으로 끊을 수 있다고 알린다
    expect(phoneHint(ko, { ...base, recording: true, toggled: true, kiboTalking: true })).toBe("끊고 말하려면 탭하세요");
    expect(phoneHint(ko, { ...base, orderCard: "paid" })).toBe(ko.pickup);
    expect(phoneHint(ko, { ...base, orderCard: "paid", asking: true })).toBe(ko.answer);
  });

  it("한 번 누르면 이어 듣기: 대답을 다 읽고 키오스크가 다 누른 뒤 저절로 다시 듣는다. 결제 안내·영수증·관문 카드가 떴거나, 못 알아들음이 2번 이어지거나, 이어 듣기가 꺼졌으면 듣지 않는다", () => {
    const ready = { convo: true, idle: true, waiting: false, operating: false, handoff: false, receipt: false, gate: false, fails: 0 };
    expect(autoListen(ready)).toBe(true);
    expect(autoListen({ ...ready, fails: 1 })).toBe(true);
    for (const k of ["waiting", "operating", "handoff", "receipt", "gate"] as const) expect([k, autoListen({ ...ready, [k]: true })]).toEqual([k, false]);
    expect(autoListen({ ...ready, convo: false })).toBe(false);
    expect(autoListen({ ...ready, idle: false })).toBe(false);
    expect(autoListen({ ...ready, fails: 2 })).toBe(false);
  });

  it("대답(reply)이 'KIBO가 누른다'면 키오스크의 조작 중 상태가 오기 전부터 조작 중으로 본다(안내 줄이 0.1초 안에 두 번 바뀌지 않게). 조작 상태·완료·다른 대답이 오면 끝", () => {
    const plan = { type: "reply" as const, re: "1", say: "", replyLanguage: "ko", result: "plan" as const, taps: 14 };
    expect(tapBridge(false, plan)).toBe(true);
    expect(tapBridge(false, { ...plan, taps: 0 })).toBe(false);
    const st = { ...ff, screen: "dine_choice", items: 0, total: 0 };
    expect(tapBridge(true, { ...st, busy: true, steps: 14, step: 1 })).toBe(false);
    expect(tapBridge(true, st)).toBe(true);
    expect(tapBridge(true, { type: "done", re: "1", ok: true, say: "", replyLanguage: "ko", gate: null })).toBe(false);
    expect(tapBridge(true, { ...plan, result: "clarify" })).toBe(false);
  });

  it("대답 뒤 4초 안에 키오스크의 조작 중 상태가 오지 않으면 다리를 끊는다. 그 전에 상태가 와서 다리가 꺼지면 타이머도 치운다", () => {
    vi.useFakeTimers();
    try {
      const off = vi.fn();
      bridgeTimeout(true, off);
      vi.advanceTimersByTime(3999);
      expect(off).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(off).toHaveBeenCalledTimes(1);
      const early = vi.fn();
      bridgeTimeout(true, early)?.();
      vi.advanceTimersByTime(5000);
      expect(early).not.toHaveBeenCalled();
      expect(bridgeTimeout(false, early)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("휴대폰 실시간 키오스크 카드", () => {
  it("키오스크가 보낸 status(화면·장바구니 원자료·합계)로 지금 화면 이름(휴대폰 언어)과 담은 줄(이름·수량·값)을 만든다. 메뉴 이름은 ko면 한국어, 그 밖은 영어", () => {
    const cart = [{ menuId: "double_cheese", mode: "set" as const, size: "L" as const, side: "fries", drink: "zero_cola", remove: [], add: [], qty: 1, unitPrice: 8300 }];
    const s = { ...ff, screen: "set_size", items: 1, total: 8300, cart, kioskLang: "en" as const };
    const ko = kioskCard(s, "ko");
    expect(ko.label).toBe("세트 크기 고르기");
    expect(ko.lines).toEqual([{ name: "더블 치즈버거 L 세트", qty: 1, price: 8300 }]);
    expect(ko.total).toBe(8300);
    const vi = kioskCard(s, "vi");
    expect(vi.label).toBe("Cỡ combo");
    expect(vi.lines[0].name).toBe("Double Cheeseburger L Meal");
  });

  it("되물은 뒤 키오스크가 첫 화면으로 돌아가면(시간 초과) 남은 물음을 지우고 '처음으로 돌아갔어요'를 한 번 보인다. 직전에 물음이 없었거나 원래 첫 화면이면 그대로", () => {
    const ask = [{ who: "you" as const, text: "치즈버거 세트" }, { who: "kibo" as const, text: "사이즈는요?", kind: "ask" as const }];
    expect(expireAsk(ask, "set_size", "idle", "돌아갔어요")).toEqual([ask[0], { who: "kibo", text: "사이즈는요?" }, { who: "kibo", text: "돌아갔어요" }]);
    expect(expireAsk(ask, "set_size", "set_drink", "돌아갔어요")).toBe(ask);
    expect(expireAsk(ask, "idle", "idle", "돌아갔어요")).toBe(ask);
    expect(expireAsk(ask, null, "idle", "돌아갔어요")).toBe(ask);
    const answered = [...ask, { who: "you" as const, text: "L" }];
    expect(expireAsk(answered, "set_size", "idle", "돌아갔어요")).toBe(answered);
    // 완료 턴의 답 칩(더 주문?)도 물음이다. 안내 줄이 마지막이 되어 칩도 사라진다
    const more = [{ who: "kibo" as const, text: "더 주문하실 게 있나요?", answers: "more" }];
    expect(expireAsk(more, "menu", "idle", "돌아갔어요").at(-1)).toEqual({ who: "kibo", text: "돌아갔어요" });
  });
});
