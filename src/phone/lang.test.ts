import { describe, expect, it } from "vitest";
import { followLang, pickLang } from "./lang";

describe("휴대폰 기본 언어", () => {
  it("주소 ?lang= → 고른 값(저장) → 브라우저 언어 목록 순으로, 지원하는 6개 언어 중 처음 맞는 것을 고른다. 없으면 English", () => {
    expect(pickLang([null, null, "fr-FR", "vi-VN", "en-US"])).toBe("vi");
    expect(pickLang(["ko", "ja", "en-US"])).toBe("ko");
    expect(pickLang([null, "ja", "ko-KR"])).toBe("ja");
    expect(pickLang(["xx", null, "zh-TW", "es"])).toBe("zh");
    expect(pickLang([null, null, "fr", "de-DE"])).toBe("en");
    expect(pickLang([])).toBe("en");
  });

  it("대답이 말한 언어를 따라오라고 하면(followSpoken) 그 언어로 바꾼다. 이번 화면에서 사람이 언어 칩으로 직접 골랐거나, 신호가 없거나, 이미 그 언어면 바꾸지 않는다", () => {
    expect(followLang({ followSpoken: true, replyLanguage: "en" }, "ko", false)).toBe("en");
    expect(followLang({ followSpoken: true, replyLanguage: "en" }, "ko", true)).toBeNull();
    expect(followLang({ replyLanguage: "en" }, "ko", false)).toBeNull();
    expect(followLang({ followSpoken: true, replyLanguage: "ko" }, "ko", false)).toBeNull();
  });
});
