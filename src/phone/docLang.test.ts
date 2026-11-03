import { describe, expect, it } from "vitest";
import { applyDocLang } from "./docLang";

describe("html lang", () => {
  it("화면 언어로 바꾸고, 화면을 떠나면(정리) 원래 값으로 되돌린다", () => {
    const root = { lang: "en" };
    const restore = applyDocLang(root, "ko-KR");
    expect(root.lang).toBe("ko-KR");
    restore();
    expect(root.lang).toBe("en");
  });
});
