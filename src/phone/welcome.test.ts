import { describe, expect, it } from "vitest";
import { greeting } from "./welcome";

describe("첫 인사(처음 탭할 때 소리로, 연결되면 화면에 글로)", () => {
  it("짝지은 키오스크에 맞춰 연결됐다는 것·무엇을 말하면 되는지·궁금한 것은 물어보라는 것을 휴대폰 언어로 말한다(11/5 사용자)", () => {
    expect(greeting("fastfood", "ko")).toBe("안녕하세요. 브리지 버거 주문기와 연결됐어요. 드시고 싶은 걸 편하게 말씀해 주세요. 궁금한 사항이 있으면 물어보세요.");
    expect(greeting("airport", "Korean")).toBe("안녕하세요. 공항 체크인 기계와 연결됐어요. 타실 항공사와 몇 분이 가시는지 말씀해 주세요. 궁금한 사항이 있으면 물어보세요.");
    expect(greeting("train", "ko")).toBe("안녕하세요. 기차표 발매기와 연결됐어요. 어디로, 언제 가시는지 말씀해 주세요. 궁금한 사항이 있으면 물어보세요.");
    for (const k of ["fastfood", "airport", "train"])
      for (const l of ["en", "ko", "ja", "vi", "zh", "es"]) {
        const g = greeting(k, l);
        // 소리로 6초 안쪽(한국어 기준 60자 안팎)
        expect(g.length).toBeGreaterThan(20);
        expect(g.length).toBeLessThan(150);
      }
    expect(greeting("train", "en")).toBe("Hello! You're connected to the train ticket machine. Tell me where and when you'd like to go. If you have any questions, just ask.");
    // 모르는 키오스크는 버거로
    expect(greeting(undefined, "ko")).toBe(greeting("fastfood", "ko"));
  });
});
