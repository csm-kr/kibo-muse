"use client";

// 키오스크 위 띠: 해석 중에는 "Understanding… · Muse Spark", 알아들으면 의도 칩이 차례로 나타나고, 재생 중에는 누른 수를 보인다.
// slot: 키오스크 바깥, 키오스크 바로 위 칸에 놓는다(나란히 비교·영상). 키오스크 화면을 덮지 않아 KIBO가 누르는 버튼이 가려지지 않는다.
// overlay: 개발 화면처럼 칸이 없을 때 키오스크 화면 맨 위에 겹친다.
// slot 글자 크기는 720p 절반 크기에서도 읽히게 정했다(제목 32px, 모델 이름표 20px, 칩 22px).
// 나란히 비교의 칸은 폭이 약 400px이라 22px 칩이 두 줄에 다 들어가지 않는다. 그래서 slot에서는 칩을 한 줄로 두고,
// 넘치면 재생 진행도에 맞춰 왼쪽에서 오른쪽으로 흘린다(가려진 쪽은 흐리게). 줄이 반쯤 잘려 보이는 일이 없다.

import { useLayoutEffect, useRef } from "react";
import type { TurnPhase } from "@/engine/turn";

export interface BandChip {
  text: string;
  tone: "normal" | "blocked";
}

// 칩 줄을 얼마나 흘릴지: 재생 전에는 맨 왼쪽(처음 칩부터), 재생 중에는 진행도 i/n만큼. more = 가려진 쪽
export function chipScroll(scrollWidth: number, clientWidth: number, progress: { i: number; n: number } | null) {
  const max = Math.max(0, scrollWidth - clientWidth);
  const left = progress && progress.n > 0 ? Math.round((max * Math.min(progress.i, progress.n)) / progress.n) : 0;
  const more = max === 0 ? "none" : left <= 0 ? "right" : left >= max ? "left" : "both";
  return { left, more };
}

const chipClass = (c: BandChip) => (c.tone === "blocked" ? "bg-red-600 text-white" : "bg-white text-neutral-900");

// yourTurn: 사람 관문을 기다리는 동안(공항) 주황 띠로 사람이 할 일을 알린다. slot일 때만 쓴다(키오스크 화면을 덮지 않게)
// slow: 해석이 8초를 넘겼다('Still thinking')
export function KiboBand({ phase, chips, progress, slot = false, yourTurn, slow = false }: { phase: TurnPhase; chips: BandChip[]; progress: { i: number; n: number } | null; slot?: boolean; yourTurn?: string | null; slow?: boolean }) {
  const rowRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const { left, more } = chipScroll(row.scrollWidth, row.clientWidth, progress);
    row.scrollTo({ left, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    row.dataset.more = more;
  }, [chips, progress]);

  if (phase === "waiting_gate" && slot && yourTurn)
    return (
      // 주황 위 글자는 진한 청록(ink #042F2E, 대비 5.16). 흰 글자는 2.80이라 쓰지 않는다
      <div className="flex h-full items-center rounded-2xl bg-orange-500 px-5 text-[32px] leading-tight font-bold text-[#042F2E]" data-kibo-band="your_turn" aria-live="polite">
        Your turn · {yourTurn}
      </div>
    );
  if (phase !== "thinking" && phase !== "replaying") return null;

  const title =
    phase === "thinking" ? (
      <span data-kibo-slow={slow || undefined}>
        {slow ? "Still thinking" : "Understanding"}
        <span className="kibo-dots" aria-hidden>
          <i>.</i>
          <i>.</i>
          <i>.</i>
        </span>
      </span>
    ) : (
      <span>KIBO is tapping{progress ? ` · ${progress.i}/${progress.n}${slot ? "" : " taps"}` : ""}</span>
    );
  // 한 단계(640ms) 진행 막대. 단계마다 새로 찬다
  const bar = phase === "replaying" && progress && (
    <div className={`h-1.5 overflow-hidden rounded-full bg-white/20 ${slot ? "flex-1" : "mt-1.5 w-full"}`}>
      <div key={progress.i} className="kibo-step-bar h-full bg-orange-400" />
    </div>
  );
  const chipEls = chips.map((c, i) => (
    <span key={`${i}-${c.text}`} className={`kibo-chip shrink-0 rounded-full px-3 py-0.5 font-semibold ${slot ? "text-[22px] leading-tight" : "text-sm"} ${chipClass(c)}`} style={{ animationDelay: `${i * 70}ms` }}>
      {c.text}
    </span>
  ));

  if (slot)
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-neutral-900 px-4 pt-2 pb-2.5 text-white" data-kibo-band={phase} aria-live="polite">
        <div className="truncate text-[32px] leading-tight font-bold">{title}</div>
        <div className="mt-1 flex items-center gap-3">
          <span className="shrink-0 rounded-full border border-white/30 px-2.5 py-0.5 text-[20px] leading-tight font-semibold tracking-wide">Meta · Muse Spark</span>
          {bar}
        </div>
        {chips.length > 0 && (
          <div ref={rowRef} className="mt-auto flex gap-1.5 overflow-hidden whitespace-nowrap data-[more=both]:[mask-image:linear-gradient(to_right,transparent,black_28px,black_calc(100%-28px),transparent)] data-[more=left]:[mask-image:linear-gradient(to_right,transparent,black_28px)] data-[more=right]:[mask-image:linear-gradient(to_left,transparent,black_28px)]" data-kibo-chips>
            {chipEls}
          </div>
        )}
      </div>
    );

  return (
    <div className="absolute inset-x-0 top-0 z-30 overflow-hidden bg-neutral-900/92 px-4 pt-2 pb-2.5 text-white shadow-lg" data-kibo-band={phase} aria-live="polite">
      <div className="flex items-center gap-2 text-lg font-bold">
        {title}
        <span className="ml-auto rounded-full border border-white/30 px-2.5 py-0.5 text-xs font-semibold tracking-wide">Meta · Muse Spark</span>
      </div>
      {bar}
      {chips.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{chipEls}</div>}
    </div>
  );
}
