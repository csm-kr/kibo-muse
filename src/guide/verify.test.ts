import { describe, expect, it } from "vitest";
import { checkBox, cropVerified, sameLabel, unsureText } from "./verify";

describe("안내 모드 윤곽 검증", () => {
  it("윤곽 조각에서 읽은 글자와 Spark가 말한 버튼 이름을 비교한다: 공백·괄호·문장부호·대소문자·전각/반각을 무시하고 포함 관계, 숫자나 한 글자는 정확히 같아야 한다", () => {
    expect(sameLabel("[전자항공권 여정안내서 출력]", "전자항공권여정안내서 출력")).toBe(true);
    expect(sameLabel("ＯＫ", "ok")).toBe(true);
    expect(sameLabel("주문하기 >", "주문하기")).toBe(true);
    expect(sameLabel("Check-in", "CHECK IN")).toBe(true);
    // S2: 문장은 '2'인데 윤곽은 '3'
    expect(sameLabel("3", "2")).toBe(false);
    expect(sameLabel("12", "2")).toBe(false);
    expect(sameLabel("２", "2")).toBe(true);
    // A4: 윤곽이 아랫줄 다른 버튼
    expect(sameLabel("포장하기", "주문하기")).toBe(false);
    expect(sameLabel("", "주문하기")).toBe(false);
    expect(sameLabel("BOOK", "O")).toBe(false);
  });

  it("검증용 조각은 윤곽 외접 박스를 조금만(각 변 8%, 최소 4px) 넓혀 사진 안에서 자른다. 이웃 버튼 글자가 조각에 들어오지 않게", () => {
    expect(checkBox([100, 100, 180, 140], 1280, 720)).toEqual([94, 96, 186, 144]);
    expect(checkBox([0, 700, 40, 720], 1280, 720)).toEqual([0, 696, 44, 720]);
    // A4: 아랫줄 버튼 둘을 감싼 윤곽. 조각 위쪽이 바로 위 「주문하기」 글자(y 285 위)까지 올라가면 검증이 잘못 통과했다
    expect(checkBox([518, 289, 596, 337], 1280, 960)[1]).toBeGreaterThanOrEqual(285);
  });

  it("조각 안에 버튼이 2개 이상 보이면 글자가 맞아도 물러난다(ff01·A4: 윤곽이 「주문하기」와 아랫줄 버튼·포인트 판까지 감쌌다). 읽지 못했으면 물러난다", () => {
    expect(cropVerified({ text: "주문하기", buttons: 1 }, "주문하기")).toBe(true);
    expect(cropVerified({ text: "주문하기", buttons: 3 }, "주문하기")).toBe(false);
    expect(cropVerified({ text: "주문하기", buttons: 2 }, "주문하기")).toBe(false);
    expect(cropVerified({ text: "포장하기", buttons: 1 }, "주문하기")).toBe(false);
    expect(cropVerified(null, "주문하기")).toBe(false);
  });

  it("검증에 실패하면 윤곽 대신 띄울 고정 문구(사용자 언어, 버튼 이름은 원문)", () => {
    expect(unsureText("주문하기", "Korean")).toBe("정확한 위치는 확실하지 않아요. 화면에서 [주문하기]를 찾아 누르세요.");
    expect(unsureText("2", "English")).toBe("I'm not sure of the exact spot. Find [2] on the screen and tap it.");
  });
});
