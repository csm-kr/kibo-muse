"use client";

// 안내 모드: KIBO가 조작할 수 없는 실제 키오스크 앞에서 사용자가 화면을 찍으면, 눌러야 할 버튼 하나를 사진 위에 표시하고 읽어 준다.
// Muse Spark가 "어디"(점·박스·안내 문장), SAM 3.1이 "정확한 모양"(윤곽)을 맡는다. KIBO는 누르지 않는다.
// 사진은 휴대폰에서 긴 변 1280 JPEG로 줄여 보내고 저장하지 않는다. EXIF 회전은 createImageBitmap이 보정한다. HEIC는 지원하지 않는다.
// 서버는 단계마다 한 줄씩 보낸다(spark → sam → check). 기다림 화면은 그 실제 단계를 따라간다.
// 윤곽·점·확대 칸은 검증(check)을 통과한 뒤에만 그린다. 틀린 윤곽 하나가 윤곽 없는 것보다 나쁘다.

import { useRef, useState } from "react";
import { fitWithin, maskTransform, zoomBox, type Box, type Point } from "@/guide/geometry";
import { speechFor, type GuideLine } from "@/guide/speech";
import { CameraIcon, KiboMark } from "./icons";
import { speak } from "./speak";
import { phoneText } from "./text";

interface Shot {
  image: string;
  width: number;
  height: number;
  question: string;
}
interface Mask {
  path: string;
  bounds: Box;
  width: number;
  height: number;
}
interface SparkLine {
  found: boolean;
  summary: string;
  instruction: string;
  label: string;
  box: Box | null;
  // 서버가 고른 대답 언어(질문 언어가 휴대폰 언어와 분명히 다르면 질문 언어)
  replyLanguage?: string;
}
interface CheckLine {
  verified: boolean;
  mask: Mask | null;
  point: Point | null;
  box: Box | null;
  unsure: string | null;
}
// 사진 위에 그릴 것. pending = 검증 전(Spark 박스를 점선으로만)
type Draw = { mask: Mask | null; box: Box | null; point: Point | null; pending: boolean };

const DEFAULT_QUESTION = "What should I press next on this screen?";
// 단계 표시 문구는 휴대폰 언어(phoneText)로, 점 색은 휴대폰 토큰(청록·주황)으로
const STAGE_TEXT = { spark: "stageSpark", sam: "stageSam", check: "stageCheck" } as const;
const STAGE_DOT = { spark: "bg-[var(--k-teal)]", sam: "bg-[var(--k-orange)]", check: "bg-[var(--k-teal)]" } as const;

async function shrink(file: File): Promise<Omit<Shot, "question">> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = fitWithin(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  return { image: canvas.toDataURL("image/jpeg", 0.85), width, height };
}

// 사진 + 표시. crop이 있으면 그 영역만 확대해 보인다(같은 그림을 옮기고 늘린다)
function Photo({ shot, draw, alt, crop }: { shot: Shot; draw: Draw | null; alt: string; crop?: Box }) {
  const r = Math.max(shot.width, shot.height) / 45;
  const layer = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- 휴대폰에서 만든 data URL. 최적화 대상이 아니다 */}
      <img src={shot.image} alt={alt} className="block w-full" />
      {draw && (
        <svg viewBox={`0 0 ${shot.width} ${shot.height}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          {draw.mask ? (
            <path d={draw.mask.path} transform={maskTransform(draw.mask.bounds, draw.mask.width, draw.mask.height)} fill="rgba(249,115,22,0.3)" stroke="#f97316" strokeWidth={4} vectorEffect="non-scaling-stroke" data-guide-mask />
          ) : (
            draw.box && (
              // 검증 전은 "찾는 중"이라 확정 색(주황)이 아닌 회색 점선으로 그린다
              <rect x={draw.box[0]} y={draw.box[1]} width={draw.box[2] - draw.box[0]} height={draw.box[3] - draw.box[1]} fill={draw.pending ? "rgba(212,212,212,0.12)" : "rgba(249,115,22,0.15)"} stroke={draw.pending ? "#d4d4d4" : "#f97316"} strokeWidth={4} strokeDasharray={draw.pending ? "10 8" : undefined} vectorEffect="non-scaling-stroke" rx={8} data-guide-box={draw.pending ? "pending" : "final"} />
            )
          )}
          {/* 점은 속이 빈 고리로 그려 버튼 글자를 가리지 않는다. 확대 칸에서는 고리가 글자를 덮어 그리지 않는다 */}
          {draw.point && !crop && (
            <g fill="none" data-guide-point>
              <circle cx={draw.point[0]} cy={draw.point[1]} r={r} stroke="white" strokeWidth={7} vectorEffect="non-scaling-stroke" />
              <circle cx={draw.point[0]} cy={draw.point[1]} r={r} stroke="#f97316" strokeWidth={4} vectorEffect="non-scaling-stroke" />
            </g>
          )}
        </svg>
      )}
    </>
  );
  if (!crop) return <div className="relative overflow-hidden rounded-lg">{layer}</div>;
  const [x1, y1, x2, y2] = crop;
  const cw = x2 - x1;
  const ch = y2 - y1;
  return (
    <div className="relative overflow-hidden rounded-lg" style={{ aspectRatio: `${cw} / ${ch}` }} data-guide-zoom>
      <div className="absolute" style={{ width: `${(100 * shot.width) / cw}%`, left: `${(-100 * x1) / cw}%`, top: `${(-100 * y1) / ch}%` }}>
        {layer}
      </div>
    </div>
  );
}

// question: 입력 칸의 글(비면 기본 질문). language: 안내 문장 언어(Spark), tts: 읽기 언어
export function GuideCamera({ question, language, tts, onAsked }: { question: string; language: string; tts: string; onAsked?: () => void }) {
  const tx = phoneText(tts);
  const fileRef = useRef<HTMLInputElement>(null);
  // 다시 찍으면 앞 요청의 늦은 응답은 버린다
  const reqRef = useRef(0);
  const [shot, setShot] = useState<Shot | null>(null);
  const [spark, setSpark] = useState<SparkLine | null>(null);
  const [samDone, setSamDone] = useState(false);
  const [check, setCheck] = useState<CheckLine | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    const req = ++reqRef.current;
    setSpark(null);
    setSamDone(false);
    setCheck(null);
    setError(null);
    let s: Shot;
    try {
      // 다음 화면을 찍을 때 입력 칸이 비어 있으면 앞 질문을 이어서 쓴다(같은 일을 하는 중)
      s = { ...(await shrink(file)), question: question.trim() || shot?.question || DEFAULT_QUESTION };
    } catch {
      setShot(null);
      setError(tx.photoError);
      return;
    }
    setShot(s);
    onAsked?.();
    try {
      const res = await fetch(`/api/guide?lang=${encodeURIComponent(language)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...s, language }) });
      if (!res.ok || !res.body) {
        // 한도·크기 초과는 서버의 고정 문구(사용자 언어)를 그대로 보인다
        const j = (await res.json().catch(() => null)) as { say?: string } | null;
        if (j?.say) {
          if (req === reqRef.current) setError(j.say);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let sparkLine: GuideLine | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done || req !== reqRef.current) break;
        buf += value;
        for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
          const l = JSON.parse(buf.slice(0, i)) as { stage: string } & SparkLine & CheckLine;
          buf = buf.slice(i + 1);
          if (l.stage === "spark") {
            setSpark(l);
            sparkLine = l as GuideLine;
          } else if (l.stage === "sam") setSamDone(true);
          else if (l.stage === "check") setCheck(l);
          // 위치가 담긴 안내 문장은 검증을 통과한 뒤에 읽는다. 물러나면 고정 문구만
          const say = speechFor(l as GuideLine, sparkLine);
          // 질문 언어로 답했으면(한국어 휴대폰에 영어 질문) 그 언어로 읽는다
          if (say) speak(say, (sparkLine?.stage === "spark" ? sparkLine.replyLanguage : undefined) ?? tts);
        }
      }
    } catch {
      if (req === reqRef.current) setError(tx.readError);
    }
  }

  const close = () => {
    reqRef.current++;
    setShot(null);
    setSpark(null);
    setSamDone(false);
    setCheck(null);
    setError(null);
    window.speechSynthesis?.cancel();
  };
  const retake = () => fileRef.current?.click();

  // 지금 단계: Spark가 버튼을 찾는 중 → SAM이 모양을 따는 중 → 글자 검증 중 → 끝
  const stage = error ? null : !spark ? "spark" : spark.found && !check ? (samDone ? "check" : "sam") : null;
  const verified = check?.verified === true;
  const draw: Draw | null = verified ? { mask: check.mask, box: check.box, point: check.point, pending: false } : spark?.found && !check ? { mask: null, box: spark.box, point: null, pending: true } : null;
  const crop = shot && verified && check.box ? zoomBox(check.box, shot.width, shot.height) : null;
  // 확대해도 사진과 거의 같으면 확대 칸을 띄우지 않는다
  const showZoom = shot && crop && crop[2] - crop[0] < shot.width * 0.7;

  return (
    <>
      <button type="button" onClick={retake} aria-label={tx.camera} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--k-line)] px-2.5" data-guide-camera>
        <CameraIcon />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void onPhoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {(shot || error) && (
        <div className="absolute inset-0 z-40 flex flex-col bg-[var(--k-bg)] text-white" data-guide={error ? "error" : stage ? `looking_${stage}` : !spark?.found ? "not_found" : verified ? "found" : "unsure"}>
          <div className="flex items-center gap-2 px-4 py-3">
            <KiboMark />
            <span className="font-bold">{tx.guideTitle}</span>
            <span className="text-sm text-[var(--k-muted)]">· {tx.guideSub}</span>
            <button type="button" onClick={close} className="ml-auto min-h-11 rounded-lg bg-white/15 px-3 py-1.5 text-sm">
              {tx.close}
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3">
            {shot && (
              <div className="relative">
                <Photo shot={shot} draw={draw} alt={spark?.instruction ?? tx.photoAlt} />
                {stage === "spark" && <div className="absolute inset-0 rounded-lg bg-black/35" aria-hidden />}
                {stage && (
                  <div className="absolute top-2 left-2 flex items-center gap-2 rounded-full bg-neutral-900/85 px-3 py-1.5 text-base font-semibold" role="status" data-guide-stage={stage}>
                    <span className={`h-2.5 w-2.5 rounded-full motion-safe:animate-pulse ${STAGE_DOT[stage]}`} aria-hidden />
                    {tx[STAGE_TEXT[stage]]}
                  </div>
                )}
              </div>
            )}
            {showZoom && <Photo shot={shot} draw={draw} alt="" crop={crop} />}
            {spark && (
              <div className="flex flex-wrap gap-1.5 text-base font-semibold">
                <span className="rounded-full border border-white/30 px-2.5 py-0.5">{tx.whereChip}</span>
                {verified && check.mask && <span className="rounded-full border border-white/30 px-2.5 py-0.5">{tx.shapeChip}</span>}
              </div>
            )}
          </div>
          <div className="space-y-3 px-4 pt-3 pb-6" aria-live="polite">
            {shot && <div className="text-sm opacity-70">“{shot.question === DEFAULT_QUESTION ? tx.guideAsk : shot.question}”</div>}
            {spark && (
              <div className="rounded-xl bg-white p-4 text-lg leading-snug text-neutral-900">
                {spark.found && spark.label && <div className="mb-1 text-sm font-bold text-orange-700">[{spark.label}]</div>}
                {/* Spark의 위치 표현("오른쪽 아래")은 검증을 통과했을 때만 보인다. 못 찾았다는 말은 그대로 */}
                {(!spark.found || verified) && spark.instruction}
              </div>
            )}
            {check && !check.verified && check.unsure && (
              <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-base leading-snug text-neutral-900" data-guide-unsure>
                {check.unsure}
              </div>
            )}
            {/* 오류는 빨강 바탕 큰 상자 대신 빨간 띠와 밝은 빨강 글자(바탕 위 7.62) */}
            {error && <div className="rounded-xl border-l-4 border-[#F87171] bg-[var(--k-surface)] p-4 text-lg leading-snug text-[#FCA5A5]">{error}</div>}
            {/* 주황 위 글자는 ink(5.16) */}
            <button type="button" onClick={retake} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--k-orange)] py-3 text-lg font-bold text-[var(--k-ink)]">
              <CameraIcon /> {spark ? tx.nextShot : tx.retake}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
