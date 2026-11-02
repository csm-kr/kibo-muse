import { describe, expect, it } from "vitest";
import { gateFor } from "./gates";
import { t } from "./ui/strings";

describe("확정 관문 카드", () => {
  it("짐이 1인 허용량을 넘으면 추가 요금은 카운터에서 안내한다는 문장을 붙이고, 넘지 않으면 붙이지 않는다", () => {
    const card = (bags: Record<string, number>) => gateFor({ kind: "ack", what: "confirm_checkin", seats: { p1: "36H", p2: "36K" }, bags }, "ko", 0).text;
    expect(card({ p1: 2, p2: 0 })).toContain("허용량을 넘는 짐의 추가 요금은 카운터에서 안내해 드려요.");
    expect(card({ p1: 1, p2: 1 })).not.toContain("추가 요금");
  });
});

describe("위험물 관문 카드", () => {
  it("보조배터리 현행 규정(2026-04-20 시행: 1인당 최대 2개, 160Wh 이하, 다른 기기 충전 금지)을 6개 언어 모두 같은 숫자로 붙인다. 키오스크 보조배터리 카드도 같은 숫자다", () => {
    const ko = gateFor({ kind: "ack", what: "dangerous_goods" }, "ko", 0).text;
    expect(ko).toContain("보조배터리는 기내에만, 1인당 최대 2개(160Wh 이하)까지 가져갈 수 있어요.");
    for (const l of ["en", "ko", "ja", "vi", "zh", "es"] as const) {
      const text = gateFor({ kind: "ack", what: "dangerous_goods" }, l, 0).text;
      expect(text, l).toMatch(/\b2\b|2(個|个|개)/);
      expect(text, l).toContain("160");
      expect(text, l).not.toMatch(/100Wh|\b5\b/);
    }
    for (const l of ["en", "ko"] as const) {
      expect(t.pb1a[l], l).toContain("2");
      expect(t.pb1a[l], l).toContain("160");
      expect(t.pb2b[l], l).not.toMatch(/up to 5|5개/);
    }
  });
});
