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
  const request = JSON.stringify({
    model: opts.model ?? "muse-spark-1.3",
    reasoning_effort: opts.effort ?? "minimal",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_schema", json_schema: { name: schemaName, schema } },
  });
  const one = async (ctrl: AbortController) => {
    const res = await doFetch(`${META_API_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: request,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Spark HTTP ${res.status}: ${text.slice(0, 500)}`);
    const body = JSON.parse(text);
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Spark response has no content");
    return { ctrl, json: JSON.parse(content) as T, usage: body.usage };
  };
  // 글 요청(해석)은 같은 요청 3개를 동시에 보내 먼저 끝난 답을 쓴다. Spark는 같은 입력도 3초·23초로 갈린다(2026-11-03 측정, 평가 통과).
  // 11/4 밤: 요청의 약 1/3이 4~5초 더 걸려 2개로는 둘 다 느린 때가 잦다(되묻기 대답 p90: 2개 8.5초, 3개 4.6초, 다시 뽑기).
  // 진 쪽은 끊어 함수 시간을 쓰지 않는다. 일부가 실패하면 남은 쪽을 기다린다. 사진 요청(안내)은 하나만 보낸다
  const ctrls = typeof user === "string" ? [new AbortController(), new AbortController(), new AbortController()] : [new AbortController()];
  const won = await Promise.any(ctrls.map(one)).catch((e: AggregateError) => {
    throw e.errors[0];
  });
  for (const c of ctrls) if (c !== won.ctrl) c.abort();
  if (ctrls.length > 1) console.info(`spark hedge won ${ctrls.indexOf(won.ctrl)}`);
  return { json: won.json, ms: Math.round(performance.now() - t0), usage: won.usage };
}
