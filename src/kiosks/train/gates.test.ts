import { describe, expect, it } from "vitest";
import { seatNote, trainGate } from "./gates";

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
