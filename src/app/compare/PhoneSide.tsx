"use client";

// 나란히 비교의 오른쪽: 사람이 한 문장(말풍선), 휴대폰, 휴대폰과 키오스크를 잇는 선.
// 처음 보는 사람이 "왜 화면이 저절로 넘어가는지"를 한눈에 알게 한다.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Phone } from "@/phone/Phone";
import { openLink } from "@/sync/link";

// 내장 휴대폰의 높이(Phone.tsx embedded의 h-[880px]), 말풍선과 휴대폰 사이(gap-4), 페이지 위아래 여백(main p-4)
const PHONE_H = 880;
const GAP = 16;
const PAD = 16;

// 가로 배치(xl, 1280 이상)에서 화면 높이가 모자라면(1440×900 노트북) 휴대폰을 줄여 입력란까지 첫 화면에 들인다.
// 1920×1080(영상)은 들어가므로 1 그대로. 좁은 화면은 세로로 쌓아 스크롤하므로 줄이지 않는다
export function phoneZoom(viewW: number, viewH: number, bubbleH: number) {
  if (viewW < 1280) return 1;
  return Math.min(1, (viewH - 2 * PAD - bubbleH - GAP) / PHONE_H);
}

export function PhoneSide({ room }: { room: string }) {
  const [said, setSaid] = useState<{ text: string; n: number } | null>(null);
  const [busy, setBusy] = useState(false);
  // 맞추기 전(서버 렌더)에는 null. 그동안 휴대폰을 숨겨 크기가 바뀌며 밀리는 것을 없앤다(키오스크 useFitScale과 같은 방식).
  // 말풍선 높이는 처음(빈 말풍선) 것으로 잰다. 말할 때마다 휴대폰 크기가 바뀌지 않게
  const bubble = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const h = bubble.current?.offsetHeight ?? 0;
    const fit = () => setZoom(phoneZoom(window.innerWidth, window.innerHeight, h));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    // 같은 화면 안 휴대폰의 말과, Supabase 키가 있으면 실제 휴대폰의 말도 받는다
    const link = openLink(room);
    const off = link.subscribe((m) => {
      if (m.type === "utterance") setSaid((p) => ({ text: m.text, n: (p?.n ?? 0) + 1 }));
      if (m.type === "status") setBusy(m.busy);
    });
    return () => {
      off();
      link.close();
    };
  }, [room]);

  return (
    // 좁은 화면에서는 이음선을 빼고 말풍선·휴대폰을 화면 폭에 맞춘다(최대 400). xl(1280) 이상은 그대로
    <div className="flex items-center max-xl:w-full max-xl:justify-center">
      <svg width="72" height="24" viewBox="0 0 72 24" className="shrink-0 overflow-visible max-xl:hidden" aria-hidden data-kibo-link={busy ? "busy" : "idle"}>
        <line x1="0" y1="12" x2="72" y2="12" stroke="#0f766e" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 10" className={busy ? "kibo-link-busy" : ""} />
        {said && <circle key={said.n} cx="72" cy="12" r="5" fill="#0f766e" className="kibo-link-dot" />}
      </svg>
      <div className="flex flex-col items-center gap-4 max-xl:w-full max-xl:max-w-[400px]">
        {/* 긴 문장은 24px·3줄, 아주 긴 문장(100자 넘음, 베트남어 등)은 22px·4줄에서 자른다(말풍선이 휴대폰을 밀어내지 않게) */}
        <div ref={bubble} className={`relative w-[400px] max-xl:w-full rounded-3xl bg-white px-6 py-4 leading-snug font-semibold shadow-md ${!said ? "text-[28px]" : said.text.length > 100 ? "text-[22px]" : said.text.length > 60 ? "text-[24px]" : "text-[28px]"}`} data-said>
          {said ? <span className={said.text.length > 100 ? "line-clamp-4" : "line-clamp-3"}>{`“${said.text}”`}</span> : <span className="text-neutral-500">Say one sentence on the phone</span>}
          <span className="absolute -bottom-3 left-1/2 h-6 w-6 -translate-x-1/2 rotate-45 bg-white" aria-hidden />
        </div>
        <div className="max-xl:w-full" style={zoom === null ? { visibility: "hidden" } : zoom < 1 ? { zoom } : undefined}>
          <Phone room={room} embedded />
        </div>
      </div>
    </div>
  );
}
