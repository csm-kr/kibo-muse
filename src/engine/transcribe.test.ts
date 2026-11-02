import { describe, expect, it } from "vitest";
import { transcribe } from "./transcribe";

describe("Transcribe 어댑터", () => {
  it("WAV와 요청 JSON을 multipart로 보내고, 메뉴 이름을 keywords로 넘겨 전사문을 돌려준다", async () => {
    let form: FormData | undefined;
    let url = "";
    const fakeFetch = async (u: string | URL | Request, init?: RequestInit) => {
      url = String(u);
      form = init?.body as FormData;
      return new Response(JSON.stringify({ transcript: "더블 치즈버거 세트", audioDurationMs: 2100 }), { status: 200 });
    };

    const r = await transcribe(new Uint8Array([1, 2, 3]), { languageBias: ["Korean", "English"], keywords: ["더블 치즈버거"], apiKey: "test", fetch: fakeFetch });

    expect(url).toBe("https://api.meta.ai/v1/asr/transcribe");
    const req = JSON.parse(await (form!.get("request") as Blob).text());
    expect(req).toEqual({ model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK", languageBias: ["Korean", "English"], keywords: ["더블 치즈버거"] });
    expect((form!.get("audio") as Blob).size).toBe(3);
    expect(r.transcript).toBe("더블 치즈버거 세트");
    expect(r.audioDurationMs).toBe(2100);
  });
});
