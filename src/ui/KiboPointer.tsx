"use client";

// KIBO가 누르는 자리를 보이는 포인터(청록 원 + 흰 "K"). 키오스크 화면 위 층에 놓는다.
// 한 단계 640ms(라운드2 모션 명세): 0 이동 240 · 180 주황 테두리 120 · 300 누름 90 · 330 물결 450 · 390 놓기 130 · 520 화면 바뀜 140·테두리 사라짐 100.
// 포인터는 단계 사이에 남고 재생이 끝나면 사라진다. 끝난 화면에 사람이 누를 버튼(finale)이 있으면 그 버튼에 고리를 두 번 그린다.
// 움직임 줄이기 설정이면 자리만 옮기고 움직임은 뺀다.

import { useLayoutEffect, useRef } from "react";
import { DOT, pointerGeometry, targetSelector, type Box } from "./pointer";

type Spot = { target: string; value?: string };

const MOVE = "cubic-bezier(0.22,1,0.36,1)";
const PRESS = "cubic-bezier(0.4,0,1,1)";
const RELEASE = "cubic-bezier(0.34,1.56,0.64,1)";
// 누름(300)부터 놓기 끝(520)까지 220ms 중 누름 90ms의 비율
const PRESSED_AT = 90 / 220;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function place(el: HTMLElement, b: Box) {
  Object.assign(el.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
}

export function KiboPointer({ hl, active, screen, finale }: { hl: Spot | null; active: boolean; screen: string; finale?: Spot | null }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<string | null>(null);
  const wasActive = useRef(false);
  const lastScreen = useRef(screen);

  const find = (s: Spot) => {
    const layer = layerRef.current!;
    const el = layer.parentElement?.querySelector<HTMLElement>(targetSelector(s.target, s.value));
    return el ? { el, g: pointerGeometry(layer.getBoundingClientRect(), layer.offsetWidth, layer.offsetHeight, el.getBoundingClientRect()) } : null;
  };

  // 한 단계: 이동 → 테두리 → 누름·물결 → 놓기. hl이 비면(step 직후) 테두리만 사라진다
  useLayoutEffect(() => {
    const layer = layerRef.current!, move = moveRef.current!, dot = dotRef.current!, ring = ringRef.current!;
    const still = reduced();
    if (!hl) {
      if (ring.style.opacity === "1") {
        ring.style.opacity = "0";
        if (!still) ring.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: "linear" });
      }
      return;
    }
    const hit = find(hl);
    if (!hit) return;
    const { el, g } = hit;
    const to = `translate(${g.dot.left}px, ${g.dot.top}px)`;
    const from = posRef.current;
    posRef.current = to;
    move.style.transform = to;
    move.style.opacity = "1";
    place(ring, g.ring);
    ring.style.opacity = "1";
    if (still) return;
    if (from === null) {
      // 첫 단계: 휴대폰 쪽(오른쪽 가장자리)에서 들어온다
      move.animate([{ transform: `translate(${layer.offsetWidth + 8}px, ${g.dot.top}px)`, opacity: 0 }, { transform: to, opacity: 1 }], { duration: 300, easing: MOVE });
    } else {
      move.animate([{ transform: from }, { transform: to }], { duration: 240, easing: MOVE });
    }
    ring.animate([{ opacity: 0, transform: "scale(1.06)" }, { opacity: 1, transform: "scale(1)" }], { delay: 180, duration: 120, easing: "cubic-bezier(0.2,0,0,1)", fill: "backwards" });
    dot.animate([{ transform: "scale(1)", easing: PRESS }, { transform: "scale(0.82)", offset: PRESSED_AT, easing: RELEASE }, { transform: "scale(1)" }], { delay: 300, duration: 220 });
    el.animate(
      [
        { transform: "scale(1)", filter: "brightness(1)", easing: PRESS },
        { transform: "scale(0.95)", filter: "brightness(0.92)", offset: PRESSED_AT, easing: RELEASE },
        { transform: "scale(1)", filter: "brightness(1)" },
      ],
      { delay: 300, duration: 220 },
    );
    const ripple = document.createElement("div");
    ripple.className = "pointer-events-none absolute rounded-full bg-teal-400";
    place(ripple, { left: g.x - 48, top: g.y - 48, width: 96, height: 96 });
    ripple.style.opacity = "0";
    layer.appendChild(ripple);
    ripple.animate([{ transform: "scale(0)", opacity: 0.45 }, { transform: "scale(1)", opacity: 0 }], { delay: 330, duration: 450, easing: "cubic-bezier(0,0,0.2,1)" }).onfinish = () => ripple.remove();
  }, [hl]);

  // 재생 중 화면이 바뀌면 새 화면이 옆에서 밀려 들어온다
  useLayoutEffect(() => {
    if (lastScreen.current === screen) return;
    lastScreen.current = screen;
    const content = layerRef.current?.parentElement?.firstElementChild;
    if (!active || !(content instanceof HTMLElement) || content === layerRef.current || reduced()) return;
    content.animate([{ opacity: 0.4, transform: "translateX(16px)" }, { opacity: 1, transform: "none" }], { duration: 140, easing: "ease-out" });
  }, [screen, active]);

  // 재생 끝: 포인터가 사라지고, 사람이 누를 버튼에 고리를 두 번 그린다
  useLayoutEffect(() => {
    const was = wasActive.current;
    wasActive.current = active;
    if (!was || active) return;
    const layer = layerRef.current!, move = moveRef.current!, ring = ringRef.current!;
    posRef.current = null;
    ring.style.opacity = "0";
    move.style.opacity = "0";
    const still = reduced();
    if (!still) move.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out" });
    const hit = finale ? find(finale) : null;
    if (!hit || still) return;
    const halo = document.createElement("div");
    halo.className = "pointer-events-none absolute rounded-2xl border-4 border-orange-500";
    halo.dataset.kiboFinale = finale!.target;
    place(halo, hit.g.ring);
    layer.appendChild(halo);
    halo.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.15)" }], { duration: 700, iterations: 2, easing: "ease-out" }).onfinish = () => halo.remove();
    // finale는 재생이 끝난 순간의 것만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-30" aria-hidden>
      <div ref={ringRef} className="absolute rounded-xl border-4 border-orange-500" style={{ opacity: 0 }} />
      <div ref={moveRef} className="absolute top-0 left-0 z-10" style={{ opacity: 0 }} data-kibo-pointer>
        <div ref={dotRef} style={{ width: DOT, height: DOT }} className="flex items-center justify-center rounded-full bg-teal-700 text-base font-black text-white shadow-[0_0_0_3px_white,0_4px_10px_rgba(0,0,0,0.35)]">
          K
        </div>
      </div>
    </div>
  );
}
