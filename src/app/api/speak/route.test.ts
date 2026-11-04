import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const req = (body: object) => new Request("http://x/api/speak", { method: "POST", body: JSON.stringify(body) });

// Gemini 스트림(SSE) 응답: PCM 조각마다 data 한 줄. 줄 끝은 \r\n도 온다
const sse = (...chunks: number[][]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/l16; rate=24000; channels=1", data: Buffer.from(c).toString("base64") } }] } }] })}\r\n\r\n`).join(""), { status: 200 });

type Call = { url: string; headers: Record<string, string>; body: { contents: { parts: { text: string }[] }[]; generationConfig: { responseModalities: string[] } } };
function gemini(res: () => Response) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    return res();
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/api/speak: KIBO 대답을 Gemini 음성으로(11/4 사용자 '너무 딱딱해')", () => {
  it("키가 없으면 404 no_tts(휴대폰은 기기 목소리로 읽는다). 글이 없거나 300자를 넘으면 400", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect((await POST(req({ text: "네", lang: "ko" }))).status).toBe(404);
    vi.stubEnv("GEMINI_API_KEY", "k");
    expect((await POST(req({ text: " ", lang: "ko" }))).status).toBe(400);
    expect((await POST(req({ text: "가".repeat(301), lang: "ko" }))).status).toBe(400);
  });

  it("Gemini 스트림의 PCM 조각을 받는 대로 흘려보낸다(첫 소리 0.6~0.9초, 11/4 측정). 글은 말투 지시 없이 그대로 보낸다(3.8은 지시문까지 읽는다). 키는 헤더로만", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gem-k");
    vi.stubEnv("GEMINI_TTS_MODEL", "");
    const calls = gemini(() => sse([1, 0, 2], [0, 3, 0]));
    const res = await POST(req({ text: "네, 담을게요", lang: "ko" }));
    expect(res.headers.get("content-type")).toBe("audio/pcm;rate=24000");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 0, 2, 0, 3, 0]);
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:streamGenerateContent?alt=sse");
    expect(calls[0].headers["x-goog-api-key"]).toBe("gem-k");
    expect(calls[0].body.contents[0].parts[0].text).toBe("네, 담을게요");
    expect(calls[0].body.generationConfig.responseModalities).toEqual(["AUDIO"]);
  });

  it("첫 소리가 오기 전에 Google이 실패하거나 소리가 없으면 오류 원문을 보내지 않고 502(휴대폰은 기기 목소리로 읽는다)", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-k");
    vi.spyOn(console, "error").mockImplementation(() => {});
    gemini(() => new Response('{"error":{"message":"secret-detail"}}', { status: 500 }));
    const failed = await POST(req({ text: "네", lang: "ko" }));
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toMatch(/secret/);
    gemini(() => new Response("data: {}\n\n", { status: 200 }));
    expect((await POST(req({ text: "네", lang: "ko" }))).status).toBe(502);
  });
});
