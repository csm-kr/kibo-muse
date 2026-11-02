// 안내 모드 실험: 사진 → Spark(점·박스·안내) → 픽셀 박스 → SAM 3.1 박스 프롬프트 → 마스크 → 채점.
// 실행: npx tsx --env-file=.env.local scripts/exp-guide.mts <gt.json> [--out 결과폴더] [--effort low] [--repeat 1] [--only 파일이름조각]
// gt.json: [{ file, task, lang, gtBox:[x1,y1,x2,y2] 원본 픽셀, alt?:[[...]] }]. 이미지는 평가에만 쓴다(제품·영상에 쓰지 않음).
// 키는 출력하지 않는다. 결과 폴더에 results.json과 장마다 겹친 그림(파랑 = 정답, 주황 = Spark 박스·점, 초록 = SAM 마스크)을 남긴다.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { coverage, fitWithin, inBox, iou, toPixelBox, toPixelPoint, type Box } from "@/guide/geometry";
import { locate, type GuideAnswer } from "@/guide/locate";
import { samMask as sam, type SamMask } from "@/guide/sam";

interface Case {
  id?: string;
  cond?: string[];
  file: string;
  task: string;
  lang: string;
  gtBox: Box;
  alt?: Box[];
}

const args = process.argv.slice(2);
const flag = (name: string, d: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : d;
};
const gtPath = args[0];
const outDir = flag("out", path.join(path.dirname(gtPath), "out"));
const effort = flag("effort", "low") as "minimal" | "low" | "medium" | "high";
const repeat = Number(flag("repeat", "1"));
const only = flag("only", "");
// --rescore: API를 다시 부르지 않고 결과 폴더의 results.json을 정답과 다시 채점한다
const rescore = args.includes("--rescore");
const LANG: Record<string, string> = { ko: "Korean", en: "English", ja: "Japanese", zh: "Chinese", vi: "Vietnamese", es: "Spanish" };

const pct = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

// 겹친 그림: 보낸 이미지 크기 기준
async function overlay(img: Buffer, w: number, h: number, gts: Box[], a: GuideAnswer | null, pbox: Box | null, ppt: [number, number] | null, m: SamMask | null, file: string) {
  const r = (b: Box, c: string) => `<rect x="${b[0]}" y="${b[1]}" width="${b[2] - b[0]}" height="${b[3] - b[1]}" fill="none" stroke="${c}" stroke-width="3"/>`;
  const mask = m
    ? `<path d="${m.path}" transform="translate(${m.bounds[0]} ${m.bounds[1]}) scale(${(m.bounds[2] - m.bounds[0]) / m.width} ${(m.bounds[3] - m.bounds[1]) / m.height})" fill="rgba(16,185,129,0.35)" stroke="#059669" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${gts.map((g) => r(g, "#2563eb")).join("")}${mask}${pbox ? r(pbox, "#f97316") : ""}${ppt ? `<circle cx="${ppt[0]}" cy="${ppt[1]}" r="8" fill="#f97316" stroke="white" stroke-width="2"/>` : ""}${a ? `<text x="8" y="${h - 10}" font-size="16" fill="black" stroke="white" stroke-width="3" paint-order="stroke">${a.target.label.replace(/[<&]/g, "")}</text>` : ""}</svg>`;
  await sharp(img).composite([{ input: Buffer.from(svg) }]).png().toFile(path.join(outDir, `${path.basename(file).replace(/\.\w+$/, "")}.png`));
}

const cases = (JSON.parse(await readFile(gtPath, "utf8")) as Case[]).filter((c) => !only || c.file.includes(only));
await mkdir(outDir, { recursive: true });
const prior = rescore ? new Map((JSON.parse(await readFile(path.join(outDir, "results.json"), "utf8")).rows as Record<string, unknown>[]).map((r) => [r.file, r])) : null;
const rows: Record<string, unknown>[] = [];
for (const c of cases) {
  const meta = await sharp(c.file).rotate().metadata();
  const ow = meta.autoOrient?.width ?? meta.width!;
  const oh = meta.autoOrient?.height ?? meta.height!;
  const { width: w, height: h } = fitWithin(ow, oh);
  const s = w / ow;
  const jpeg = await sharp(c.file).rotate().resize(w, h).jpeg({ quality: 85 }).toBuffer();
  const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  const gts = [c.gtBox, ...(c.alt ?? [])].map((b) => b.map((v) => Math.round(v * s)) as Box);
  const row: Record<string, unknown> = { id: c.id, cond: c.cond ?? [], file: path.basename(c.file), task: c.task, lang: c.lang, size: [w, h] };
  const sparkMs: number[] = [];
  let a: GuideAnswer | null = null;
  const old = prior?.get(path.basename(c.file));
  if (old) {
    a = (old.answer as GuideAnswer) ?? null;
    sparkMs.push(...(old.sparkMs as number[]));
  }
  for (let k = 0; !prior && k < repeat; k++) {
    try {
      const r = await locate(dataUrl, c.task, LANG[c.lang] ?? c.lang, { effort });
      sparkMs.push(r.ms);
      a ??= r.answer;
    } catch (e) {
      row.sparkError = (e as Error).message.slice(0, 200);
    }
  }
  row.sparkMs = sparkMs;
  let pbox: Box | null = null;
  let ppt: [number, number] | null = null;
  let m: SamMask | null = null;
  if (a) {
    row.answer = a;
    pbox = toPixelBox(a.target.box, w, h);
    ppt = toPixelPoint(a.target.point, w, h);
    const hit = a.found && gts.some((g) => inBox(ppt!, g));
    const bestIou = Math.max(...gts.map((g) => iou(pbox!, g)));
    row.hit = hit;
    row.iou = Math.round(bestIou * 100) / 100;
    // 빗나간 거리: 점에서 가장 가까운 정답 박스까지(원본 픽셀)
    row.missPx = hit ? 0 : Math.round(Math.min(...gts.map((g) => Math.hypot(Math.max(g[0] - ppt![0], 0, ppt![0] - g[2]), Math.max(g[1] - ppt![1], 0, ppt![1] - g[3])))) / s);
    row.fail = hit ? null : !a.found ? "refused" : pbox[2] - pbox[0] < 2 || pbox[3] - pbox[1] < 2 ? "no_box" : "wrong_button";
    if (old) for (const k of ["samMs", "samObjects", "samCover", "samInGt", "samConfidence"]) row[k] = old[k];
    else if (a.found && pbox[2] - pbox[0] >= 2 && pbox[3] - pbox[1] >= 2) {
      const samMs: number[] = [];
      for (let k = 0; k < repeat; k++) {
        try {
          const r = await sam(dataUrl, pbox, w, h);
          samMs.push(r.ms);
          m ??= r.masks[0] ?? null;
        } catch (e) {
          row.samError = (e as Error).message.slice(0, 200);
        }
      }
      row.samMs = samMs;
      row.samObjects = m ? 1 : 0;
      if (m) {
        const cov = gts.map((g) => coverage(m!, g)).sort((x, y) => y.ofGt - x.ofGt)[0];
        row.samCover = Math.round(cov.ofGt * 100) / 100;
        row.samInGt = Math.round(cov.ofMask * 100) / 100;
        row.samConfidence = m.confidence;
      }
    }
  }
  if (!prior) await overlay(jpeg, w, h, gts, a, pbox, ppt, m, c.file);
  rows.push(row);
  console.log(JSON.stringify({ file: row.file, hit: row.hit, iou: row.iou, fail: row.fail, samCover: row.samCover, samInGt: row.samInGt, sparkMs: row.sparkMs, samMs: row.samMs, label: a?.target.label, conf: a?.confidence }));
}

const rate = (rs: Record<string, unknown>[]) => `${rs.filter((r) => r.hit).length}/${rs.length}`;
const tags = [...new Set(rows.flatMap((r) => r.cond as string[]))].sort();
const breakdown = {
  camera: rate(rows.filter((r) => (r.cond as string[]).includes("camera"))),
  notCamera: rate(rows.filter((r) => !(r.cond as string[]).includes("camera"))),
  byTag: Object.fromEntries(tags.map((t) => [t, rate(rows.filter((r) => (r.cond as string[]).includes(t)))])),
  misses: rows.filter((r) => !r.hit).map((r) => ({ id: r.id, label: (r.answer as GuideAnswer | undefined)?.target.label, missPx: r.missPx, iou: r.iou, cond: r.cond })),
};
const allSpark = rows.flatMap((r) => r.sparkMs as number[]);
const allSam = rows.flatMap((r) => (r.samMs as number[]) ?? []);
const fails: Record<string, number> = {};
for (const r of rows) if (r.fail) fails[r.fail as string] = (fails[r.fail as string] ?? 0) + 1;
const summary = {
  n: rows.length,
  hit: rows.filter((r) => r.hit).length,
  iou50: rows.filter((r) => (r.iou as number) >= 0.5).length,
  samCover70: rows.filter((r) => (r.samCover as number) >= 0.7).length,
  samRan: rows.filter((r) => r.samObjects !== undefined).length,
  sparkP50: pct(allSpark, 50),
  sparkP95: pct(allSpark, 95),
  samP50: pct(allSam, 50),
  samP95: pct(allSam, 95),
  fails,
  breakdown,
  effort,
  repeat,
};
await writeFile(path.join(outDir, "results.json"), JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary));
