import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("iOS 소리 잠금 풀기", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("읽기가 실제로 시작되기 전에는 풀린 것으로 치지 않는다: iOS는 터치의 누름을 사용자 동작으로 치지 않아 그때 읽기를 버리므로, 손을 뗄 때(touchend) 다시 읽고 시작되면 그만한다", async () => {
    vi.resetModules();
    const spoken: { onstart?: () => void }[] = [];
    const on = new Map<string, () => void>();
    vi.stubGlobal("window", {
      speechSynthesis: { speak: (u: { onstart?: () => void }) => spoken.push(u) },
      addEventListener: (type: string, f: () => void) => on.set(type, f),
      removeEventListener: (type: string) => on.delete(type),
    });
    vi.stubGlobal("SpeechSynthesisUtterance", class { volume = 1; constructor(public text: string) {} });
    const { unlockSpeech } = await import("./speak");
    unlockSpeech(); // 마이크 누름: iOS가 버린다(onstart가 오지 않음)
    on.get("touchend")!(); // 손 뗌
    expect(spoken.length).toBe(2);
    spoken[1].onstart!();
    on.get("touchend")?.();
    unlockSpeech();
    expect(spoken.length).toBe(2);
    expect(on.size).toBe(0);
  });
});
