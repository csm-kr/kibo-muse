import { describe, expect, it } from "vitest";
import { pickVoice, speechLang } from "./speak";

describe("휴대폰 음성 출력", () => {
  it("읽기 언어를 BCP-47 태그로 맞춘다: 'ko', 'ko-KR', 'Korean'은 모두 ko-KR", () => {
    expect(["ko", "ko-KR", "Korean", "korean"].map(speechLang)).toEqual(["ko-KR", "ko-KR", "ko-KR", "ko-KR"]);
    expect(["Japanese", "vi", "zh-CN", "Spanish", "English"].map(speechLang)).toEqual(["ja-JP", "vi-VN", "zh-CN", "es-ES", "en-US"]);
  });

  it("그 언어의 목소리를 고른다: 지역까지 같은 것(기기 안 목소리 먼저) → 언어만 같은 것 → 없으면 고르지 않음", () => {
    const v = (lang: string, name: string, localService = false) => ({ lang, name, localService });
    const voices = [v("en-US", "E"), v("zh-TW", "TW", true), v("ko_KR", "K-net"), v("ko-KR", "K-local", true), v("zh-CN", "CN"), v("ja", "J")];
    expect(pickVoice(voices, "ko-KR")?.name).toBe("K-local");
    expect(pickVoice([v("ko_KR", "K-net")], "ko-KR")?.name).toBe("K-net");
    expect(pickVoice(voices, "zh-CN")?.name).toBe("CN");
    expect(pickVoice(voices, "ja-JP")?.name).toBe("J");
    expect(pickVoice(voices, "vi-VN")).toBeUndefined();
  });
});
