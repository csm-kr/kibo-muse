// 개발 서버 /api/guide를 실제로 불러 단계 줄을 찍는다(평가 사진, 결과는 이 화면에만). 윤곽 경로는 길어서 뺀다
import sharp from "sharp";

const [base, ...cases] = process.argv.slice(2);
for (const c of cases) {
  const [file, question, language] = c.split("|");
  const img = sharp(file).rotate();
  const m = await img.metadata();
  const s = Math.min(1, 1280 / Math.max(m.width!, m.height!));
  const width = Math.round(m.width! * s);
  const height = Math.round(m.height! * s);
  const jpeg = await sharp(file).rotate().resize(width, height).jpeg({ quality: 85 }).toBuffer();
  const t0 = Date.now();
  const res = await fetch(`${base}/api/guide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: `data:image/jpeg;base64,${jpeg.toString("base64")}`, width, height, question, language }) });
  const text = await res.text();
  console.log(`== ${file.split("/").pop()} status=${res.status} ${Date.now() - t0}ms`);
  for (const l of text.trim().split("\n")) {
    const o = JSON.parse(l);
    if (o.mask) o.mask = { bounds: o.mask.bounds };
    console.log(JSON.stringify(o));
  }
}
