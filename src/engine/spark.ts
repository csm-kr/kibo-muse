// Muse Spark 구조화 출력 호출. 키오스크 3종이 함께 쓴다.
// 형식은 2026-11-02 스모크 테스트로 확인한 Chat Completions + response_format(json_schema)이다.

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface SparkOptions {
  apiKey?: string;
  fetch?: FetchLike;
  model?: string;
  effort?: "minimal" | "low" | "medium" | "high";
}

export interface SparkJsonResult<T> {
  json: T;
  ms: number;
  usage?: unknown;
}

export const META_API_BASE = "https://api.meta.ai/v1";

// user는 글 또는 내용 조각 배열(이미지 입력: [{type:"text"}, {type:"image_url"}])
export async function sparkJson<T>(system: string, user: string | object[], schemaName: string, schema: object, opts: SparkOptions = {}): Promise<SparkJsonResult<T>> {
  const apiKey = opts.apiKey ?? process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not set");
  const doFetch = opts.fetch ?? fetch;
  const t0 = performance.now();
  const res = await doFetch(`${META_API_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model ?? "muse-spark-1.3",
      reasoning_effort: opts.effort ?? "minimal",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name: schemaName, schema } },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Spark HTTP ${res.status}: ${text.slice(0, 500)}`);
  const body = JSON.parse(text);
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Spark response has no content");
  return { json: JSON.parse(content) as T, ms: Math.round(performance.now() - t0), usage: body.usage };
}
