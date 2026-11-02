import { describe, expect, it } from "vitest";
import { intentChips, screenLabel, statusSummary } from "./labels";

describe("해석 결과 칩·휴대폰 상태 줄 — 기차", () => {
  it("알아들은 도착역·날짜·인원·열차·좌석을 칩으로 보이고, 결제하기 앞에서 멈추면 그 관문을 빨간 칩으로 붙인다", () => {
    expect(intentChips({ to: "harbor", day: 1, hour: 9, minute: 30, adults: 2, trainType: "express", seats: "window" }, { kind: "human", what: "pay", reservation: { trainNo: 103, cls: "general", seats: [], total: 0 } }).map((c) => c.text)).toEqual(["→ Harborlight", "Tomorrow 09:30", "2 adults", "Express", "Window seats", "Pay → you tap"]);
    expect(intentChips({ to: "harbor", day: 3, hour: 15, adults: 1, seniors: 1 }, { kind: "ack", what: "later_train", trainNo: 141, dep: "16:30" })).toEqual([
      { text: "→ Harborlight", tone: "normal" },
      { text: "In 3 days 15:00", tone: "normal" },
      { text: "1 adult · 1 senior", tone: "normal" },
      { text: "Later train 16:30 → you confirm", tone: "blocked" },
    ]);
  });

  it("휴대폰 단계 이름은 13개 화면 모두 6개 언어로 있고, 요약(도착역·좌석)도 휴대폰 언어로 쓴다", () => {
    expect(Object.keys(screenLabel)).toHaveLength(13);
    for (const labels of Object.values(screenLabel)) expect(Object.keys(labels).sort()).toEqual(["en", "es", "ja", "ko", "vi", "zh"]);
    // 좌석은 사람 말로: 호차마다 묶는다
    expect(statusSummary("harbor", ["5-8A", "5-8B"], "Vietnamese")).toBe("Harborlight · Toa 5 8A·8B");
    expect(statusSummary("harbor", ["7-1A", "7-1B"], "ko")).toBe("등대항 · 7호차 1A·1B");
    expect(statusSummary("harbor", ["3-15D", "4-1A"], "ja")).toBe("Harborlight · 3号車 15D, 4号車 1A");
    expect(statusSummary("harbor", [], "ko")).toBe("등대항");
    expect(statusSummary(null, [], "en")).toBe("");
  });
});
