import { describe, expect, it } from "vitest";
import { keywordsFor } from "./keywords";

describe("받아쓰기 keywords", () => {
  it("키오스크마다 그 화면의 고유 이름을 넘긴다. 공항은 항공사·도시, 기차는 가상 역 이름, 모르는 종류는 패스트푸드 메뉴", () => {
    expect(keywordsFor("airport")).toEqual(expect.arrayContaining(["Bridge Air", "브리지항공", "Tokyo", "도쿄", "Narita", "나리타"]));
    expect(keywordsFor("airport")).not.toContain("Double Cheeseburger");
    expect(keywordsFor("train")).toEqual(expect.arrayContaining(["Harborlight", "등대항", "Bridge Central", "브리지중앙"]));
    expect(keywordsFor(null)).toContain("Double Cheeseburger");
  });
});
