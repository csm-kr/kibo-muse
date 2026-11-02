// SAM 3.1 박스 프롬프트를 만들고, 스트림 출력(특수 토큰 + base85 마스크)을 읽는다. 읽기는 Meta 공식 파서(@meta-sam/parser)를 쓴다.
import { buildObjectPrompt, decodeMaskToRaster, decodeMaskToSVGPath, parseImageStream, recordsOfKind } from "@meta-sam/parser";
import { META_API_BASE } from "@/engine/spark";
import type { Box, RasterMask } from "./geometry";

export function boxPrompt([left, top, right, bottom]: Box, width: number, height: number) {
  return buildObjectPrompt({ size: { width, height }, objects: [{ id: 1, prompts: [{ box: { left, top, right, bottom } }] }] });
}

export interface SamMask extends RasterMask {
  // 래스터 좌표의 윤곽 경로. 그릴 때 bounds 왼쪽 위로 옮기고 bounds 크기 / 래스터 크기로 늘린다
  path: string;
  confidence?: number;
}

// SSE 글 → Responses 이벤트
async function* events(sse: string) {
  for (const line of sse.split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    yield JSON.parse(line.slice(6)) as { type: string };
  }
}

export async function readSam(sse: string): Promise<SamMask[]> {
  const result = await parseImageStream(events(sse)).finalResult;
  if (result.outcome.status !== "completed") throw new Error(`SAM ${JSON.stringify(result.outcome).slice(0, 300)}`);
  return recordsOfKind(result.records, "mask").map((m) => ({
    bounds: [m.bounds.left, m.bounds.top, m.bounds.right, m.bounds.bottom],
    width: m.mask.width,
    height: m.mask.height,
    raster: decodeMaskToRaster(m.mask),
    path: decodeMaskToSVGPath(m.mask),
    ...(m.confidence !== undefined && { confidence: m.confidence }),
  }));
}

// 보낸 이미지(dataUrl, width×height 픽셀)에서 박스 안 물체 하나의 마스크를 SAM 3.1에 묻는다. 키는 서버에만 있다
export async function samMask(dataUrl: string, box: Box, width: number, height: number) {
  const t0 = performance.now();
  const res = await fetch(`${META_API_BASE}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      model: "sam-3.1",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: boxPrompt(box, width, height) }, { type: "input_image", image_url: dataUrl }] }],
      stream: true,
      metadata: { include_confidence: "true" },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SAM HTTP ${res.status}: ${text.slice(0, 300)}`);
  return { masks: await readSam(text), ms: Math.round(performance.now() - t0) };
}
