import { describe, expect, it } from "vitest";
import { samplesFor } from "./samples";

describe("개발 콘솔 예시 문장 순서", () => {
  it("브라우저 언어가 한국어가 아니면 영어 예시를 맨 앞에(입력란 기본값) 두고, 한국어면 그대로 둔다", () => {
    const list = ["치즈버거 세트 하나요", "Ngày mai khoảng 9 giờ sáng", "Can I get a cheeseburger meal, for here?", "네"];
    expect(samplesFor(list, "en-US")).toEqual(["Can I get a cheeseburger meal, for here?", "치즈버거 세트 하나요", "Ngày mai khoảng 9 giờ sáng", "네"]);
    expect(samplesFor(list, "vi")[0]).toBe("Can I get a cheeseburger meal, for here?");
    expect(samplesFor(list, "ko-KR")).toEqual(list);
  });
});
