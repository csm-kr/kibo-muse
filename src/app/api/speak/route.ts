// KIBO의 짧은 대답을 Gemini 음성으로 읽는다(11/4 사용자 "너무 딱딱해"). Meta API에는 음성 합성이 없다.
// 키(GEMINI_API_KEY, AI Studio)는 서버에만 있다. Cloud Text-to-Speech는 새 형식 키(AQ.)를 받지 않는다(11/4 확인, 401).
// 다 만든 뒤 받으면 1.2~4초라, 스트림으로 받아 PCM 조각을 오는 대로 휴대폰에 흘려보낸다(첫 소리 0.6~0.9초, 11/4 측정).
// 키가 없거나 첫 소리 전에 실패하면 휴대폰은 기기 목소리(speechSynthesis)로 읽는다. 글은 저장하지 않는다.
import { logError, rateLimited } from "@/server/guard";

const MAX_CHARS = 300;
// 11/4 측정에서 가장 빠른 모델(전체 1.4초). 3.8은 말투 지시문까지 소리 내어 읽어서 글만 보낸다
const MODEL = () => process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts";

type Chunk = { rate: number; pcm: Uint8Array };

// Gemini SSE 응답에서 PCM 조각을 하나씩 꺼낸다(data: 한 줄에 조각 하나, 줄 끝은 \r\n도 온다)
async function* pcmChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Chunk> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true }).replace(/\r/g, "");
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i).split("\n").find((l) => l.startsWith("data: "));
      buf = buf.slice(i + 2);
      if (!line) continue;
      const parts = (JSON.parse(line.slice(6)) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] }).candidates?.[0]?.content?.parts;
      const p = parts?.find((x) => x.inlineData?.data)?.inlineData;
      if (p?.data) yield { rate: Number(/rate=(\d+)/.exec(p.mimeType ?? "")?.[1] ?? 24000), pcm: Buffer.from(p.data, "base64") };
    }
  }
}

async function geminiStream(key: string, text: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok || !res.body) throw new Error(`Gemini TTS HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const chunks = pcmChunks(res.body);
  // 첫 소리가 올 때까지 기다린다. 그 전에 실패하면 502로 기기 목소리에 넘긴다
  const first = await chunks.next();
  if (first.done) throw new Error("Gemini TTS response has no audio");
  const stream = new ReadableStream<Uint8Array>({
    start: (c) => c.enqueue(first.value.pcm),
    async pull(c) {
      try {
        const next = await chunks.next();
        if (next.done) c.close();
        else c.enqueue(next.value.pcm);
      } catch (e) {
        // 읽는 도중 끊기면 거기까지만 읽는다
        logError("speak stream failed:", e);
        c.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": `audio/pcm;rate=${first.value.rate}`, "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "no_tts" }, { status: 404 });
  const limited = rateLimited("speak", req);
  if (limited) return limited;
  const { text } = ((await req.json().catch(() => null)) ?? {}) as { text?: string };
  if (typeof text !== "string" || !text.trim() || text.length > MAX_CHARS) return Response.json({ error: "bad_request" }, { status: 400 });
  try {
    return await geminiStream(key, text);
  } catch (e) {
    // 오류 원문(Google 응답 일부)은 서버 로그에만
    logError("speak failed:", e);
    return Response.json({ error: "tts_failed" }, { status: 502 });
  }
}
