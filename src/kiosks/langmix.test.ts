import { describe, expect, it } from "vitest";
import { buttonsFor, keywordsFor } from "./keywords";
import { mixedScript, replyLang } from "./langmix";

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

  it("문구가 [ ] 안에 인용한 키오스크 화면 버튼 글자(한국어 키오스크 + 외국어 휴대폰)는 섞임이 아니다", () => {
    const ff = [...keywordsFor("fastfood"), ...buttonsFor("fastfood")];
    expect(mixedScript("Để hủy toàn bộ đơn, xin hãy tự bấm [처음으로] trên màn hình.", "vi", "", ff)).toBe(false);
    expect(mixedScript("Đơn của bạn đã ở trên màn hình. Hãy kiểm tra và tự bấm [결제하기].", "vi", "", ff)).toBe(false);
    expect(mixedScript("最初に戻るには、画面下の［나가기］を押してください。", "ja", "", [...keywordsFor("airport"), ...buttonsFor("airport")])).toBe(false);
    expect(mixedScript("要回到开头，请点屏幕上方的［처음으로］。", "zh", "", [...keywordsFor("train"), ...buttonsFor("train")])).toBe(false);
    // 버튼 글자가 아닌 한국어는 여전히 섞임이다
    expect(mixedScript("Xin hãy bấm [처음으로] 주세요.", "vi", "", ff)).toBe(true);
  });
});

describe("대답 언어: 말한 언어가 휴대폰 언어와 분명히 다르면 말한 언어로", () => {
  const ff = [...menu, ...buttonsFor("fastfood")];
  it("한국어 휴대폰에 순수 영어 문장이면(Spark도 영어) 영어로 답하고 휴대폰에 따라오라고(followSpoken) 알린다", () => {
    expect(replyLang("ko", "English", "Can I get a Double Cheeseburger meal with a Zero Cola, for here please", ff)).toEqual({ lang: "en", followSpoken: true });
  });
  it("장면 8: 메뉴 이름이 영어여도 한글이 섞였으면 휴대폰 언어(ko)로 답한다. Spark가 영어로 봐도 바꾸지 않는다", () => {
    expect(replyLang("ko", "English", "Double Cheeseburger set 하나 제로 콜라로 먹고 갈게요", ff)).toEqual({ lang: "ko", followSpoken: false });
  });
  it("고유명사(메뉴 이름·버튼 글자)는 판정에서 빼고, 남은 말이 세 단어 미만이면(OK·eat in·메뉴 이름만) 바꾸지 않는다", () => {
    expect(replyLang("ko", "English", "Double Cheeseburger set", ff).followSpoken).toBe(false);
    expect(replyLang("ko", "English", "eat in", ff).followSpoken).toBe(false);
    expect(replyLang("ko", "English", "OK", ff).followSpoken).toBe(false);
    expect(replyLang("ko", "English", "Start over please, I want to change it", ff).followSpoken).toBe(true);
  });
  it("휴대폰 언어 고유 문자: ja는 가나, zh는 가나 없는 한자, vi는 베트남어 성조·특수 문자. 있으면 바꾸지 않는다", () => {
    expect(replyLang("ja", "Chinese", "ダブルチーズバーガーのセットを一つください", ff).followSpoken).toBe(false);
    expect(replyLang("zh", "Japanese", "ダブルチーズバーガーのセットを一つください", ff)).toEqual({ lang: "ja", followSpoken: true });
    expect(replyLang("zh", "Japanese", "我要一个双层芝士汉堡套餐，可乐", ff).followSpoken).toBe(false);
    expect(replyLang("vi", "English", "Cho tôi một phần Double Cheeseburger cỡ lớn", ff).followSpoken).toBe(false);
    expect(replyLang("vi", "English", "I would like one Double Cheeseburger meal", ff)).toEqual({ lang: "en", followSpoken: true });
  });
  it("고유 문자가 없는 언어끼리(en·es)는 Spark 판정만 쓴다. 같은 언어면 바꾸지 않는다", () => {
    expect(replyLang("en", "Spanish", "Quiero una hamburguesa doble con queso", ff)).toEqual({ lang: "es", followSpoken: true });
    expect(replyLang("es", "English", "I want a cheeseburger meal please", ff)).toEqual({ lang: "en", followSpoken: true });
    expect(replyLang("ko-KR", "Korean", "치즈버거 세트 하나 주세요", ff)).toEqual({ lang: "ko", followSpoken: false });
  });
  it("?lang이 없으면(평가 하네스·키오스크에서 친 말) 지금처럼 Spark가 고른 언어 그대로이고 신호는 없다", () => {
    expect(replyLang(null, "English", "Double Cheeseburger set 하나 제로 콜라로 먹고 갈게요", ff)).toEqual({ lang: "English", followSpoken: false });
  });
});
