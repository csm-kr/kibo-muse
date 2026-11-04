import { afterEach, describe, expect, it, vi } from "vitest";
import { pickVoice, speechLang, spokenText } from "./speak";

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

  it("같은 언어 안에서는 덜 딱딱한 목소리를 먼저 고른다: Premium > Enhanced·Natural·Neural(Edge Online) > Google > 기기 안 > 그 밖", () => {
    const v = (name: string, localService = false) => ({ lang: "ko-KR", name, localService });
    const pick = (...vs: ReturnType<typeof v>[]) => pickVoice(vs, "ko-KR")?.name;
    expect(pick(v("Yuna", true), v("Yuna (Enhanced)", true), v("Yuna (Premium)", true))).toBe("Yuna (Premium)");
    expect(pick(v("Microsoft Heami - Korean (Korean)", true), v("Microsoft SunHi Online (Natural) - Korean (Korea)"))).toBe("Microsoft SunHi Online (Natural) - Korean (Korea)");
    expect(pick(v("Yuna", true), v("Google 한국의"))).toBe("Google 한국의");
    expect(pick(v("Other"), v("Yuna", true))).toBe("Yuna");
  });
});

describe("읽을 글 다듬기", () => {
  it("화면의 수량 표기 ×N은 '곱하기'로 읽히지 않게 그 언어의 세는 말로 바꾼다(화면 글은 그대로)", () => {
    expect(spokenText("더블 치즈버거 세트 ×1 담을게요.", "ko")).toBe("더블 치즈버거 세트 1개 담을게요.");
    expect(spokenText("Spicy Chicken Burger ×2をカートに入れます。", "ja")).toBe("Spicy Chicken Burger 2つをカートに入れます。");
    expect(spokenText("I'll add Double Cheeseburger meal ×1. Eat in or take out?", "en")).toBe("I'll add Double Cheeseburger meal. Eat in or take out?");
    expect(spokenText("I'll add Bulgogi Burger meal ×2.", "en-US")).toBe("I'll add Bulgogi Burger meal, 2.");
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

describe("읽는 중인지(이어 듣기를 미루는 데 쓴다)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("목소리를 기다리는 동안과 읽는 동안은 읽는 중이다. 다 읽으면 아니다. 읽기는 조금 빠르게(1.15배)", async () => {
    vi.resetModules();
    const said: { rate: number }[] = [];
    const synth = { speaking: false, pending: false, getVoices: () => [{ lang: "ko-KR", name: "K", localService: true }], speak: (u: { rate: number }) => void (said.push(u), (synth.speaking = true)), cancel() {}, addEventListener() {}, removeEventListener() {} };
    vi.stubGlobal("window", { speechSynthesis: synth });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem() {} });
    vi.stubGlobal("SpeechSynthesisUtterance", class { rate = 1; constructor(public text: string) {} });
    const { speak, speechBusy } = await import("./speak");
    const done = speak("네", "ko");
    expect(speechBusy()).toBe(true);
    await done;
    expect(speechBusy()).toBe(true);
    synth.speaking = false;
    expect(speechBusy()).toBe(false);
    // 기본 빠르기(1)는 늘어진다(11/4 사용자 "음성 말하는 걸 빠르게"). 조금 빠르게 읽는다
    expect(said[0].rate).toBe(1.15);
  });

  it("완료 안내(after)는 앞 대답을 끊지 않고 다 읽은 뒤 읽는다. 기다리는 동안도 읽는 중이다(11/4: Gemini 목소리가 늦게 시작해 탭이 짧으면 '담았어요'가 'N번 누를게요'를 끊었다)", async () => {
    vi.resetModules();
    const said: string[] = [];
    let cancels = 0;
    const synth = { speaking: false, pending: false, getVoices: () => [{ lang: "ko-KR", name: "K", localService: true }], speak: (u: { text: string }) => void (said.push(u.text), (synth.speaking = true)), cancel: () => void cancels++, addEventListener() {}, removeEventListener() {} };
    vi.stubGlobal("window", { speechSynthesis: synth });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem() {} });
    vi.stubGlobal("SpeechSynthesisUtterance", class { rate = 1; constructor(public text: string) {} });
    const { speak, speechBusy } = await import("./speak");
    await speak("세 번 누를게요", "ko");
    const done = speak("담았어요", "ko", { after: true });
    await new Promise((r) => setTimeout(r, 250));
    expect([said, cancels]).toEqual([["세 번 누를게요"], 0]);
    synth.speaking = false;
    expect(speechBusy()).toBe(true);
    await done;
    expect(said).toEqual(["세 번 누를게요", "담았어요"]);
  });
});

describe("Google 음성(서버 /api/speak)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("./silence");
  });

  // 서버가 16비트 PCM 조각을 흘려보낸다(audio/pcm;rate=24000). 휴대폰은 오는 대로 이어 튼다
  async function rig(status: number, chunks: number[][] = []) {
    vi.resetModules();
    type Buf = { data: Float32Array; sampleRate: number; getChannelData(): Float32Array };
    const played: { buffer: Buf | null; at: number; onended: (() => void) | null; stopped: boolean }[] = [];
    const ctx = {
      currentTime: 5,
      decodeAudioData: async (b: ArrayBuffer): Promise<Buf> => {
        const data = new Float32Array(b.byteLength);
        return { data, sampleRate: 24000, getChannelData: () => data };
      },
      createBuffer: (_ch: number, n: number, sampleRate: number): Buf => {
        const data = new Float32Array(n);
        return { data, sampleRate, getChannelData: () => data };
      },
      createBufferSource: () => {
        const src = { buffer: null as Buf | null, at: -1, onended: null as (() => void) | null, stopped: false, connect() {}, start: (at = 0) => void ((src.at = at), played.push(src)), stop: () => void (src.stopped = true) };
        return src;
      },
      destination: {},
    };
    vi.doMock("./silence", () => ({ runningAudio: () => ctx, unlockAudio() {} }));
    const fetches: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      fetches.push(`${url} ${init?.body}`);
      if (url.startsWith("/ack/")) return new Response(new Uint8Array(3), { status: 200 });
      if (status !== 200) return Response.json({ error: "no_tts" }, { status });
      const body = new ReadableStream<Uint8Array>({ start: (c) => (chunks.forEach((b) => c.enqueue(new Uint8Array(b))), c.close()) });
      return new Response(body, { status: 200, headers: { "Content-Type": "audio/pcm;rate=24000" } });
    });
    const synth = { speaking: false, pending: false, spoken: [] as string[], getVoices: () => [{ lang: "ko-KR", name: "K", localService: true }], speak: (u: { text: string }) => void synth.spoken.push(u.text), cancel() {}, addEventListener() {}, removeEventListener() {} };
    vi.stubGlobal("window", { speechSynthesis: synth });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem() {} });
    vi.stubGlobal("SpeechSynthesisUtterance", class { rate = 1; constructor(public text: string) {} });
    return { played, fetches, synth, mod: await import("./speak") };
  }

  it("서버가 흘려보내는 PCM 조각을 다 받기 전부터 빈틈없이 이어 튼다(기기 목소리는 쓰지 않음). 마지막 조각이 끝날 때까지 읽는 중이다. 수량 ×N은 읽을 말로 바꿔 보낸다", async () => {
    // 조각 경계가 표본(2바이트) 중간에 걸려도 이어 붙인다: [0x00,0x40 | 0x00] [0xc0,0x00,0x20]
    const { played, fetches, synth, mod } = await rig(200, [[0x00, 0x40, 0x00], [0xc0, 0x00, 0x20]]);
    await mod.speak("더블 치즈버거 세트 ×1 담을게요.", "ko");
    await vi.waitFor(() => expect(played.length).toBe(2));
    expect(fetches[0]).toContain("/api/speak");
    expect(fetches[0]).toContain("세트 1개 담을게요");
    expect(synth.spoken.length).toBe(0);
    expect(played.map((p) => [...p.buffer!.data])).toEqual([[0.5], [-0.5, 0.25]]);
    expect(played[0].buffer!.sampleRate).toBe(24000);
    expect(played[1].at - played[0].at).toBeCloseTo(1 / 24000);
    played[0].onended!();
    expect(mod.speechBusy()).toBe(true);
    played[1].onended!();
    expect(mod.speechBusy()).toBe(false);
  });

  it("말이 끝나 보내는 순간 휴대폰 언어로 미리 만든 짧은 대답(/ack/ko.mp3, '네, 잠시만요')을 바로 튼다(11/4: 말 끝 → 대답 목소리 8초 동안 조용했다). 진짜 대답을 읽기 시작하면 끊는다. 소리를 껐으면 틀지 않는다", async () => {
    const { played, fetches, mod } = await rig(200, [[0, 0x40]]);
    await mod.ack("Korean");
    expect(fetches).toEqual(["/ack/ko.mp3 undefined"]);
    expect([played.length, played[0].buffer!.data.length, mod.speechBusy()]).toEqual([1, 3, true]);
    await mod.speak("네, 담을게요", "ko");
    expect(played[0].stopped).toBe(true);
    await vi.waitFor(() => expect(played.length).toBe(2));
    mod.setSound(false);
    await mod.ack("Korean");
    expect(played.length).toBe(2);
  });

  it("키가 없으면(404) 기기 목소리로 읽고, 이 화면에서는 서버에 다시 묻지 않는다", async () => {
    const { fetches, synth, mod } = await rig(404);
    await mod.speak("네", "ko");
    await mod.speak("좋아요", "ko");
    expect([fetches.length, synth.spoken]).toEqual([1, ["네", "좋아요"]]);
  });
});
