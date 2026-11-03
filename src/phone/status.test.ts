import { describe, expect, it } from "vitest";
import { statusSummary } from "@/kiosks/fastfood/ui/labels";
import { bandHidden, orderLinesIn, statusLine } from "./status";

const ff = { type: "status" as const, busy: false, kioskId: "fastfood" };

describe("휴대폰 상태 줄", () => {
  it("패스트푸드는 키오스크가 보낸 화면 id·개수·합계로 휴대폰 언어 문장을 만든다(키오스크가 아직 영어여도). 품목 이름은 키오스크 화면 글자 그대로. 0개·₩0은 뺀다", () => {
    const s = { ...ff, screen: "set_drink", items: 0, total: 0, label: "Choosing a drink", summary: statusSummary(0, 0, "en", "불고기버거 M 세트") };
    expect(statusLine(s, "ko-KR")).toEqual({ label: "음료 고르기", summary: "불고기버거 M 세트" });
    const review = { ...ff, screen: "review", items: 1, total: 6000, label: "Order review · you tap Pay", summary: statusSummary(1, 6000, "en", "불고기버거 M 세트"), lines: [{ name: "불고기버거 M 세트", detail: "", qty: 1 }] };
    expect(statusLine(review, "ko")).toEqual({ label: "주문 확인 · 결제는 직접", summary: "불고기버거 M 세트 · 1개 · ₩6,000" });
    expect(statusLine({ ...review, screen: "payment", paid: 664 }, "ko").label).toBe("결제 완료");
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
});
