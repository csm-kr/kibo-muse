// 안내 모드: 사람이 찍은 키오스크 사진 + 질문 → Muse Spark가 눌러야 할 버튼(어디) → SAM 3.1이 그 버튼의 정확한 모양
// → 윤곽 조각을 잘라 Spark가 글자를 다시 읽어 버튼 이름과 같은지 검증.
// KIBO는 누르지 않는다. 사진은 저장하지 않고 이 요청 안에서만 모델에 보낸다. 키는 서버에만 있다.
// 성공 응답은 단계마다 한 줄(NDJSON): spark(찾음) → sam(윤곽 땀) → check(검증 결과와 그릴 것).
// 휴대폰 기다림 화면이 실제 단계를 따라가고, 안내 문장은 spark 줄에서 바로 읽는다.
// 틀린 윤곽 하나가 윤곽 없는 것보다 나쁘다: 검증이 다르거나 실패하면 윤곽·점·박스를 보내지 않고 고정 문구(unsure)를 붙인다.
import { toPixelBox, toPixelPoint, type Box } from "@/guide/geometry";
import { locate } from "@/guide/locate";
import { samMask } from "@/guide/sam";
import { checkBox, cropDataUrl, cropVerified, readButtonText, unsureText } from "@/guide/verify";
import { logError, MAX, overSize, rateLimited, tooLarge } from "@/server/guard";

const okSize = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) <= 4096;
const line = (o: object) => new TextEncoder().encode(`${JSON.stringify(o)}\n`);

export async function POST(req: Request) {
  // 사진(약 1.5MB) + 질문을 넘는 본문은 읽기 전에 거절한다. 휴대폰은 긴 변 1280 JPEG로 줄여 보낸다
  if (Number(req.headers.get("content-length") ?? 0) > MAX.imageChars + 10_000) return tooLarge(req, "photo");
  const limited = rateLimited("guide", req);
  if (limited) return limited;
  const { image, width, height, question, language, noSam } = (await req.json()) as { image?: string; width?: number; height?: number; question?: string; language?: string; noSam?: boolean };
  // 평가 전용(eval/README "What SAM 3.1 adds"): SAM 없이 Spark 박스로 검증·표시한 경우와 짝지어 비교한다. production에서는 무시한다
  const skipSam = noSam === true && process.env.NODE_ENV !== "production";
  if (typeof image === "string" && overSize("imageChars", image.length)) return tooLarge(req, "photo");
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image) || !okSize(width) || !okSize(height))
    return Response.json({ error: "image must be a resized data:image URL with its width and height" }, { status: 400 });
  if (typeof question !== "string" || !question.trim()) return Response.json({ error: "question is required" }, { status: 400 });
  const lang = language || "English";

  const t0 = performance.now();
  let spark;
  try {
    spark = await locate(image, question.trim().slice(0, 300), lang);
  } catch (e) {
    // Spark 오류 원문은 휴대폰에 보내지 않는다
    logError("guide", e);
    return Response.json({ error: "guide_failed" }, { status: 502 });
  }
  const { answer: a, ms: sparkMs } = spark;
  const base = { stage: "spark", found: a.found, summary: a.screen_summary, instruction: a.instruction, label: a.target.label, confidence: a.confidence };
  const headers = { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" };
  if (!a.found) return new Response(line({ ...base, point: null, box: null, mask: null, timing: { sparkMs, samMs: null, totalMs: Math.round(performance.now() - t0) } }), { headers });

  const box = toPixelBox(a.target.box, width, height);
  const point = toPixelPoint(a.target.point, width, height);
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      c.enqueue(line({ ...base, point, box, timing: { sparkMs } }));
      let mask = null;
      let samMs: number | null = null;
      if (!skipSam && box[2] - box[0] >= 2 && box[3] - box[1] >= 2) {
        try {
          const r = await samMask(image, box, width, height);
          samMs = r.ms;
          const m = r.masks[0];
          if (m) mask = { path: m.path, bounds: m.bounds, width: m.width, height: m.height };
        } catch (e) {
          logError("guide sam", e);
        }
      }
      c.enqueue(line({ stage: "sam", traced: mask !== null, timing: { sparkMs, samMs } }));

      // 검증: 그릴 자리(SAM 윤곽, 없으면 Spark 박스) 주변 조각의 글자가 버튼 이름과 같은가
      const drawn: Box = mask ? (mask.bounds as Box) : box;
      let read: { text: string; buttons: number } | null = null;
      let checkMs: number | null = null;
      if (drawn[2] - drawn[0] >= 2 && drawn[3] - drawn[1] >= 2) {
        try {
          const r = await readButtonText(await cropDataUrl(image, checkBox(drawn, width, height)));
          read = { text: r.text, buttons: r.buttons };
          checkMs = r.ms;
        } catch (e) {
          logError("guide check", e);
        }
      }
      // 글자가 맞고 조각 안 버튼이 하나뿐이어야 그린다
      const verified = cropVerified(read, a.target.label);
      const timing = { sparkMs, samMs, checkMs, totalMs: Math.round(performance.now() - t0) };
      const checked = { read: read?.text ?? null, buttons: read?.buttons ?? null };
      if (verified) c.enqueue(line({ stage: "check", verified, ...checked, mask, point, box, unsure: null, timing }));
      else c.enqueue(line({ stage: "check", verified, ...checked, mask: null, point: null, box: null, unsure: unsureText(a.target.label, lang), timing }));
      c.close();
    },
  });
  return new Response(stream, { headers });
}
