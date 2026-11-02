import { describe, expect, it } from "vitest";
import { intentChips, screenLabel, statusSummary } from "./labels";

describe("해석 결과 칩 — 공항", () => {
  it("알아들은 항공사·인원·좌석·짐을 칩으로 보이고, 사람 확인 관문에서 멈추면 그 관문을 빨간 칩으로 붙인다", () => {
    expect(intentChips({ airline: "bridge_air", travelers: 2, seats: "together", bags: 1 }, { kind: "ack", what: "dangerous_goods" })).toEqual([
      { text: "Bridge Air", tone: "normal" },
      { text: "2 travelers", tone: "normal" },
      { text: "Seats together", tone: "normal" },
      { text: "1 checked bag", tone: "normal" },
      { text: "Dangerous goods → you confirm", tone: "blocked" },
    ]);
  });

  it("휴대폰 상태 줄의 단계 이름은 휴대폰의 6개 언어 모두로 있다(베트남어 휴대폰에 영어 단계가 나오지 않게)", () => {
    for (const labels of Object.values(screenLabel)) expect(Object.keys(labels).sort()).toEqual(["en", "es", "ja", "ko", "vi", "zh"]);
    expect([screenLabel.passengers.vi, screenLabel.flight_info.vi, screenLabel.seat_map.vi]).toEqual(["Hành khách", "Chuyến bay & ghế", "Sơ đồ ghế"]);
  });

  it("휴대폰 상태 줄의 요약(여권 수·좌석)도 휴대폰 언어로 쓴다", () => {
    expect(statusSummary(2, "12A·12B", "Vietnamese")).toBe("2 hộ chiếu · ghế 12A·12B");
    expect(statusSummary(0, "", "Korean")).toBe("여권 0개");
    expect(statusSummary(1, "", "en")).toBe("1 passport(s)");
  });
});
