import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { POST } from "./route";

// 문서에 실린 SAM 출력 한 줄(320×334)
const line = "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|><|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>";
const sse = [
  { type: "response.created", response: { id: "r1", status: "in_progress" } },
  { type: "response.output_text.delta", delta: line, item_id: "m1", output_index: 0, content_index: 0 },
  { type: "response.output_text.done", text: line, item_id: "m1", output_index: 0, content_index: 0 },
  { type: "response.completed", response: { id: "r1", status: "completed" } },
]
  .map((e) => `data: ${JSON.stringify(e)}\n`)
  .join("\n");

// Spark 호출은 차례대로 answers를 돌려준다(1: 버튼 찾기, 2: 윤곽 조각의 글자 읽기). 문자열이면 그 상태 코드의 오류 응답
function stub(...answers: (object | { status: number; text: string })[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  let k = 0;
  vi.stubEnv("MODEL_API_KEY", "test");
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    if (url.endsWith("/chat/completions")) {
      const a = answers[k++];
      if ("status" in a) return new Response(a.text, { status: a.status });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(a) } }] }), { status: 200 });
    }
    return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  });
  return calls;
}
// 성공 응답은 단계마다 한 줄(NDJSON): spark 줄이 먼저, 버튼을 찾았으면 sam 줄이 뒤따른다. json = 줄을 합친 것
const ask = async (body: object) => {
  const res = await POST(new Request("http://x/api/guide", { method: "POST", body: JSON.stringify(body) }));
  const lines = (await res.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  return { status: res.status, lines, json: Object.assign({}, ...lines) };
};
// 윤곽 조각을 실제로 잘라야 해서 진짜 JPEG(320×334 흰 화면)를 쓴다
const jpeg = await sharp({ create: { width: 320, height: 334, channels: 3, background: { r: 255, g: 255, b: 255 } } })
  .jpeg()
  .toBuffer();
const photo = { image: `data:image/jpeg;base64,${jpeg.toString("base64")}`, width: 320, height: 334, question: "체크인하려면 뭘 눌러요?", language: "Korean" };
const agree = { screen_summary: "위험물 안내 화면", found: true, target: { label: "동의", point: [750, 720], box: [650, 680, 850, 760] }, instruction: "오른쪽 아래 빨간 [동의] 버튼을 누르세요.", confidence: 0.9 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/api/guide", () => {
  it("Spark가 찾은 버튼(0–1000)을 사진 픽셀로 바꿔 SAM 3.1 박스 프롬프트로 보내고, 윤곽 조각의 글자가 버튼 이름과 같으면 윤곽·점·안내를 돌려준다", async () => {
    const calls = stub(agree, { text: "동의", buttons: 1 });
    const { status, json, lines } = await ask(photo);
    expect(status).toBe(200);
    // 기다리는 화면이 "finding the button" → "tracing its shape" → "Checking the label"로 실제 단계를 따라가게 단계마다 한 줄
    expect(lines.map((l) => l.stage)).toEqual(["spark", "sam", "check"]);
    expect(lines[0]).toMatchObject({ found: true, box: [208, 227, 272, 254] });
    expect(lines[0].mask).toBeUndefined();
    expect(calls.map((c) => c.url.split("/v1/")[1])).toEqual(["chat/completions", "responses", "chat/completions"]);
    // 검증은 effort minimal로 윤곽 주변 조각만 보낸다
    expect(calls[2].body.reasoning_effort).toBe("minimal");
    expect((calls[1].body.input as { content: { text?: string }[] }[])[0].content[0].text).toBe("<0f>1<|box;x1=208;y1=227;x2=271;y2=253;w=320;h=334|>");
    expect(json).toMatchObject({
      found: true,
      label: "동의",
      instruction: "오른쪽 아래 빨간 [동의] 버튼을 누르세요.",
      summary: "위험물 안내 화면",
      point: [240, 240],
      box: [208, 227, 272, 254],
      mask: { bounds: [211, 228, 271, 255], width: 60, height: 27 },
      verified: true,
      unsure: null,
    });
    expect(json.mask.path.startsWith("M")).toBe(true);
    expect(json.timing.sparkMs).toEqual(expect.any(Number));
  });

  it("평가 전용 noSam(개발 서버에서만): SAM을 부르지 않고 Spark 박스 조각으로 검증해 박스를 그린다. production에서는 무시한다", async () => {
    const calls = stub(agree, { text: "동의", buttons: 1 });
    const { json } = await ask({ ...photo, noSam: true });
    expect(calls.map((c) => c.url.split("/v1/")[1])).toEqual(["chat/completions", "chat/completions"]);
    expect(json).toMatchObject({ verified: true, mask: null, box: [208, 227, 272, 254], timing: { samMs: null } });
    vi.stubEnv("NODE_ENV", "production");
    const prod = stub(agree, { text: "동의", buttons: 1 });
    await ask({ ...photo, noSam: true });
    expect(prod.map((c) => c.url.split("/v1/")[1])).toEqual(["chat/completions", "responses", "chat/completions"]);
  });

  it("윤곽 조각의 글자가 다르면(S2: '2'라고 했는데 '3'을 오림) 윤곽·점·박스를 보내지 않고 고정 문구를 붙인다. 안내 문장은 그대로", async () => {
    stub({ ...agree, target: { ...agree.target, label: "2" }, instruction: "Press the '2' button." }, { text: "3", buttons: 1 });
    const { json, lines } = await ask(photo);
    expect(lines.at(-1)).toMatchObject({ stage: "check", verified: false, mask: null, point: null, box: null });
    expect(json).toMatchObject({ instruction: "Press the '2' button.", verified: false, mask: null, point: null, box: null, unsure: "정확한 위치는 확실하지 않아요. 화면에서 [2]를 찾아 누르세요." });
  });

  it("Spark 오류 원문(400 메시지 등)은 휴대폰에 보내지 않고 고정 오류로 바꾼다", async () => {
    stub({ status: 400, text: '{"error":{"message":"Invalid image_url: secret upstream detail"}}' });
    const { status, json } = await ask(photo);
    expect(status).toBe(502);
    expect(JSON.stringify(json)).not.toContain("upstream");
    expect(json.error).toBe("guide_failed");
  });

  it("화면에 답이 없으면(found=false) SAM을 부르지 않고 안내만 돌려준다. 이미지가 아니거나 질문이 없으면 400", async () => {
    const calls = stub({ screen_summary: "광고 화면", found: false, target: { label: "", point: [0, 0], box: [0, 0, 0, 0] }, instruction: "화면을 한 번 누른 뒤 다음 화면을 찍어 주세요.", confidence: 0.4 });
    const { json, lines } = await ask(photo);
    expect(calls).toHaveLength(1);
    expect(lines).toHaveLength(1);
    expect(json).toMatchObject({ found: false, point: null, box: null, mask: null, instruction: "화면을 한 번 누른 뒤 다음 화면을 찍어 주세요." });
    expect((await ask({ ...photo, image: "https://example.com/a.jpg" })).status).toBe(400);
    expect((await ask({ ...photo, question: " " })).status).toBe(400);
  });
});
