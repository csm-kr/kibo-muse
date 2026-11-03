import { describe, expect, it } from "vitest";
import { keywordsFor } from "./keywords";
import { mixedScript } from "./langmix";

const menu = keywordsFor("fastfood");

describe("되묻기 문장의 문자 체계 섞임", () => {
  it("요청 언어와 다른 문자 체계가 섞이면 섞임이다(실측: 한국어 되묻기에 「ですね」)", () => {
    expect(mixedScript("더블 치즈버거 세트 1개ですね. 매장식사인가요 포장인가요?", "ko", "더블 치즈버거 세트 하나요", menu)).toBe(true);
    expect(mixedScript("ダブルチーズバーガーですね。매장で召し上がりますか？", "ja", "ダブルチーズバーガーひとつ", menu)).toBe(true);
    expect(mixedScript("Is that for here or to go? 사이즈는?", "en", "A cheeseburger combo, please.", menu)).toBe(true);
    expect(mixedScript("Combo gà cay size M hay L ですか?", "vi-VN", "Một combo burger gà cay.", menu)).toBe(true);
  });

  it("메뉴·항공 고유명사와 사용자 말을 그대로 인용한 조각은 섞임이 아니다. 라틴 문자(M, L, 영어 이름)는 어느 언어에도 섞임이 아니다", () => {
    expect(mixedScript("더블 치즈버거 세트 1개요? 사이즈 M인지 L인지 알려주세요.", "ko", "더블 치즈버거 세트 하나요", menu)).toBe(false);
    expect(mixedScript("Would you like your 불고기버거 as a meal?", "en", "bulgogi burger please", menu)).toBe(false);
    expect(mixedScript("Sorry, we don't have 김치버거. What else?", "en", "김치버거 주세요", menu)).toBe(false);
    expect(mixedScript("ブリッジエアで何名様ですか？", "ja", "ブリッジエアで", keywordsFor("airport"))).toBe(false);
    expect(mixedScript("Double Cheeseburger セットですね。サイズはM、Lのどちらですか？", "ja", "ダブルチーズバーガーセット", menu)).toBe(false);
    // 가운뎃점 「・」(U+30FB)과 장음 「ー」(U+30FC)은 가나 영역에 있지만 문장부호로 쓰인다(오탐)
    expect(mixedScript("더블 치즈버거・불고기버거 중 어느 것인가요? 음료ー콜라 맞나요?", "ko", "", menu)).toBe(false);
    expect(mixedScript("Burger・Combo ー M or L?", "en", "", menu)).toBe(false);
  });
});
