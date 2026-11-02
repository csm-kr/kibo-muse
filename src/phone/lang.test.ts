import { describe, expect, it } from "vitest";
import { pickLang } from "./lang";

describe("휴대폰 기본 언어", () => {
  it("주소 ?lang= → 고른 값(저장) → 브라우저 언어 목록 순으로, 지원하는 6개 언어 중 처음 맞는 것을 고른다. 없으면 English", () => {
    expect(pickLang([null, null, "fr-FR", "vi-VN", "en-US"])).toBe("vi");
    expect(pickLang(["ko", "ja", "en-US"])).toBe("ko");
    expect(pickLang([null, "ja", "ko-KR"])).toBe("ja");
    expect(pickLang(["xx", null, "zh-TW", "es"])).toBe("zh");
    expect(pickLang([null, null, "fr", "de-DE"])).toBe("en");
    expect(pickLang([])).toBe("en");
  });
});
