"use client";

// 나란히 비교의 오른쪽: 사람이 한 문장(말풍선), 휴대폰, 휴대폰과 키오스크를 잇는 선.
// 처음 보는 사람이 "왜 화면이 저절로 넘어가는지"를 한눈에 알게 한다.

import { useEffect, useState } from "react";
import { Phone } from "@/phone/Phone";
import { openLink } from "@/sync/link";

export function PhoneSide({ room }: { room: string }) {
  const [said, setSaid] = useState<{ text: string; n: number } | null>(null);
  const [busy, setBusy] = useState(false);

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
    <div className="flex items-center">
      <svg width="72" height="24" viewBox="0 0 72 24" className="shrink-0 overflow-visible" aria-hidden data-kibo-link={busy ? "busy" : "idle"}>
        <line x1="0" y1="12" x2="72" y2="12" stroke="#0f766e" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 10" className={busy ? "kibo-link-busy" : ""} />
        {said && <circle key={said.n} cx="72" cy="12" r="5" fill="#0f766e" className="kibo-link-dot" />}
      </svg>
      <div className="flex flex-col items-center gap-4">
        {/* 긴 문장은 24px·3줄, 아주 긴 문장(100자 넘음, 베트남어 등)은 22px·4줄에서 자른다(말풍선이 휴대폰을 밀어내지 않게) */}
        <div className={`relative w-[400px] rounded-3xl bg-white px-6 py-4 leading-snug font-semibold shadow-md ${!said ? "text-[28px]" : said.text.length > 100 ? "text-[22px]" : said.text.length > 60 ? "text-[24px]" : "text-[28px]"}`} data-said>
          {said ? <span className={said.text.length > 100 ? "line-clamp-4" : "line-clamp-3"}>{`“${said.text}”`}</span> : <span className="text-neutral-400">Say one sentence on the phone</span>}
          <span className="absolute -bottom-3 left-1/2 h-6 w-6 -translate-x-1/2 rotate-45 bg-white" aria-hidden />
        </div>
        <Phone room={room} embedded />
      </div>
    </div>
  );
}
