// Muse Voice Transcribe 파일 전사. 형식은 2026-11-02 스모크 테스트로 확인했다.
import { META_API_BASE, type FetchLike } from "./spark";

export interface TranscribeOptions {
  languageBias: string[];
  keywords: string[];
  apiKey?: string;
  fetch?: FetchLike;
}

export async function transcribe(wav: Uint8Array, opts: TranscribeOptions) {
  const apiKey = opts.apiKey ?? process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not set");
  const form = new FormData();
  const request = { model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK", languageBias: opts.languageBias, keywords: opts.keywords };
  form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }));
  form.append("audio", new Blob([wav as BlobPart], { type: "audio/wav" }), "speech.wav");

  const t0 = performance.now();
  const res = await (opts.fetch ?? fetch)(`${META_API_BASE}/asr/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Transcribe HTTP ${res.status}: ${text.slice(0, 500)}`);
  const body = JSON.parse(text) as { transcript?: string; audioDurationMs?: number };
  return { transcript: body.transcript ?? "", audioDurationMs: body.audioDurationMs, ms: Math.round(performance.now() - t0) };
}
