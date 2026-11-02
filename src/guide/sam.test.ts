import { describe, expect, it } from "vitest";
import { boxPrompt, readSam } from "./sam";

// 문서(reading segmentation output)에 실린 실제 출력 한 줄: 320×334 이미지, 객체 하나
const line = "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|><|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>";
const sse = [
  { type: "response.created", response: { id: "r1", status: "in_progress" } },
  { type: "response.output_text.delta", delta: line, item_id: "m1", output_index: 0, content_index: 0 },
  { type: "response.output_text.done", text: line, item_id: "m1", output_index: 0, content_index: 0 },
  { type: "response.completed", response: { id: "r1", status: "completed" } },
]
  .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n`)
  .concat("data: [DONE]\n")
  .join("\n");

describe("SAM 3.1 박스 프롬프트와 출력 읽기", () => {
  it("픽셀 반열림 박스를 SAM 박스 토큰(끝 좌표 포함)으로 만든다", () => {
    expect(boxPrompt([211, 228, 271, 255], 320, 334)).toBe("<0f>1<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>");
  });

  it("스트림(SSE) 글을 읽어 객체마다 소스 픽셀 박스, 윤곽 경로(박스 기준), 마스크 래스터를 돌려준다", async () => {
    const masks = await readSam(sse);
    expect(masks).toHaveLength(1);
    const m = masks[0];
    expect(m.bounds).toEqual([211, 228, 271, 255]);
    expect([m.width, m.height]).toEqual([60, 27]);
    expect(m.raster).toHaveLength(60 * 27);
    expect(m.raster.reduce((a, b) => a + b, 0)).toBe(1539);
    expect(m.path.startsWith("M")).toBe(true);
  });

  it("실패 이벤트가 오면 오류를 던진다", async () => {
    const failed = `data: ${JSON.stringify({ type: "response.failed", response: { id: "r1", status: "failed", error: { message: "boom" } } })}\n\ndata: [DONE]\n`;
    await expect(readSam(failed)).rejects.toThrow();
  });
});
