import { describe, expect, it } from "vitest";
import { bookingSay, clarifySay, planLead, seatNote, trainGate } from "./gates";
import { initialState } from "./machine";
import { plan } from "./planner";

describe("기차 관문 안내", () => {
  it("1시간 넘게 늦은 열차는 휴대폰 확인 카드(열차·시각·버튼, 6개 언어), 카드 투입은 기기 카드, 결제하기는 카드 없이 결제 넘기기로 둔다", () => {
    expect(trainGate({ kind: "ack", what: "later_train", trainNo: 103, dep: "10:30" }, "Vietnamese")).toEqual({
      kind: "ack",
      what: "later_train",
      button: "Đi chuyến này",
      text: "Chuyến gần nhất còn chỗ là Bridge Express 103, khởi hành lúc 10:30, muộn hơn giờ bạn muốn hơn một tiếng. Nếu muốn đi chuyến này, hãy nói “có” hoặc bấm “Đi chuyến này”.",
    });
    expect(trainGate({ kind: "device", what: "card" }, "ko")).toMatchObject({ kind: "device", what: "card", text: "화면 아래 카드 단말기에 카드를 직접 넣어 주세요. KIBO는 결제하지 않아요." });
    expect(trainGate({ kind: "human", what: "pay", reservation: { trainNo: 103, cls: "general", seats: ["5-1A"], total: 52800 } }, "en")).toBeNull();
    expect(trainGate(null, "en")).toBeNull();
  });
});

describe("기차 계획 알림", () => {
  it("원하는 좌석 배치(나란히·창가·통로)를 찾지 못해 발매기가 자리를 정했으면 알린다. 알림이 없으면 빈 문자열", () => {
    expect(seatNote(["no_matching_seats"], "ko")).toBe("원하신 좌석 배치가 없어 발매기가 자리를 정했어요. 화면에서 좌석을 확인해 주세요.");
    expect(seatNote([], "ko")).toBe("");
  });
});

describe("기차 예약 요약·되묻기(고정 문구)", () => {
  it("결제 앞까지 오면 무엇을 예약했는지(날·출발 시각·열차·도착역·인원·등급·좌석·합계)와 결제는 직접 하라는 말을 한다", () => {
    const p = plan(initialState("ko"), { to: "harbor", day: 1, hour: 15, adults: 2, seats: "window" });
    if (p.kind !== "plan") throw new Error(p.kind);
    const r = p.final.reservation!;
    const ko = bookingSay(p.final, "ko");
    expect(ko).toMatch(/^내일 15:\d\d 출발 등대항행 브리지 고속 \d+, 어른 2명, 일반실 \d+호차 \S+\. 합계 [\d,]+원으로 예약했어요\. 결제는 화면의 \[결제하기\]를 직접 눌러 주세요\.$/);
    expect(ko).toContain(`${r.total.toLocaleString("en-US")}원`);
    expect(bookingSay(p.final, "en")).toMatch(/^Tomorrow, \d\d:\d\d, Bridge Express \d+ to Harborlight, 2 adults, standard class, car \d+ \S+\. Total ₩[\d,]+\. Please tap \[결제하기\] on the screen yourself to pay\.$/);
    expect(bookingSay(initialState(), "ko")).toBe("");
    // 누르기 전 대답은 알아들은 것(도착역·날·시각·인원)을 먼저 말한다
    expect(planLead(p.final, "ko")).toMatch(/^등대항행 내일 15:\d\d, 어른 2명\.$/);
    expect(planLead(p.final, "en")).toMatch(/^To Harborlight, tomorrow \d\d:\d\d, 2 adults\.$/);
  });

  it("되묻기 대체 문구는 빠진 것만 자연스럽게 묻는다. 날짜는 아는데 시각만 빠졌으면 시각만 묻는다", () => {
    expect(clarifySay(["to", "date", "passengers"], "ko")).toBe("어디로 가세요? 언제 몇 시쯤, 몇 분이 타세요?");
    expect(clarifySay(["date"], "ko", { day: 1 })).toBe("몇 시쯤 출발할까요?");
    expect(clarifySay(["date"], "en", { day: 1 })).toBe("What time would you like to leave?");
  });
});
