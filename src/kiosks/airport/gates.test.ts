import { describe, expect, it } from "vitest";
import { keywordsFor } from "../keywords";
import { mixedScript } from "../langmix";
import { checkinLead, clarifySay, gateFor, gateLang } from "./gates";
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

describe("공항 고정 되묻기 문구", () => {
  it("알아들은 항공사 이름(데이터)과 빠진 칸만 묻는다. 6개 언어 모두 그 언어의 문자 체계만 쓴다", () => {
    expect(clarifySay(["travelers", "bags"], { airline: "nova_wings" }, "ko")).toBe("노바윙스 체크인을 도와드릴게요. 알려 주세요: 체크인할 인원, 부치는 짐 개수.");
    expect(clarifySay(["airline", "travelers", "bags"], {}, "en-US")).toBe("Please tell me: airline, number of travelers, number of checked bags.");
    // 일본어·중국어는 문장 사이에 공백을 두지 않는다
    expect(clarifySay(["travelers"], { airline: "seabird_air" }, "zh")).toBe("为您办理 Seabird Air 的值机。请告诉我：办理值机的人数。");
    expect(clarifySay(["bags"], { airline: "seabird_air" }, "ja")).toBe("Seabird Airのチェックインをお手伝いします。教えてください：預ける荷物の数。");
    for (const l of ["en", "ko", "ja", "vi", "zh", "es"]) {
      const say = clarifySay(["travelers", "bags"], { airline: "seabird_air" }, l);
      expect(say, l).toMatch(/Seabird Air|시버드항공/);
      expect(mixedScript(say, l, "", keywordsFor("airport")), `${l}: ${say}`).toBe(false);
    }
  });
});

describe("관문 문구 언어", () => {
  it("언어 이름('Chinese', 'Spanish')도 turn.ts의 langOf와 같이 읽는다", () => {
    expect(["Chinese", "Spanish", "Korean", "zh-CN", "es", "fr"].map(gateLang)).toEqual(["zh", "es", "ko", "zh", "es", "en"]);
  });
});

describe("계획 앞에 말할 알아들은 내용(checkinLead)", () => {
  it("항공사·인원·좌석 바람·부칠 짐을 아는 것만 말한다(11/4 판정: 고친 인원·짐을 받았는지 말하지 않음)", () => {
    const all = { airline: "bridge_air", travelers: 2, seats: "window" as const, bags: 0 };
    expect(checkinLead(all, "ko")).toBe("브리지항공, 2명, 창가 쪽 나란히, 부치는 짐 없음.");
    expect(checkinLead(all, "en")).toBe("Bridge Air, 2 travelers, together with a window seat, no checked bags.");
    expect(checkinLead({ travelers: 1, bags: 2 }, "ko")).toBe("1명, 부치는 짐 2개.");
    expect(checkinLead({ seats: "keep" }, "en")).toBe("seats unchanged.".replace(/^s/, "S"));
    expect(checkinLead({}, "ko")).toBe("");
    // 혼자면 '나란히'가 아니라 그 자리(11/4 판정: 혼자인데 "창가 쪽 나란히")
    expect(checkinLead({ airline: "bridge_air", travelers: 1, seats: "window", bags: 1 }, "ko")).toBe("브리지항공, 1명, 창가 자리, 부치는 짐 1개.");
    expect(checkinLead({ travelers: 1, seats: "aisle" }, "en")).toBe("1 traveler, aisle seat.");
    expect(checkinLead({ travelers: 1, seats: "together" }, "ko")).toBe("1명.");
    for (const l of ["ja", "vi", "zh", "es"]) expect(mixedScript(checkinLead(all, l), l, "", keywordsFor("airport")), l).toBe(false);
  });
});
