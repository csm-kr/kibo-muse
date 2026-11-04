"use client";

// 휴대폰 실시간 키오스크 카드(머리줄 아래). 키오스크가 상태가 바뀔 때마다·hello 때 보내는 status로 지금 화면과 담은 것을 보인다.
// 접힌 한 줄을 누르면 담은 줄(이름·수량·값)과 합계가 펼쳐진다(details). 화면 읽기가 시끄럽지 않게 aria-live는 두지 않는다(초점이 가면 읽힌다)
import type { LinkMsg } from "@/sync/link";
import { kioskCard } from "./status";
import { phoneText } from "./text";

const won = (n: number) => `₩${n.toLocaleString("en-US")}`;

export function KioskCard({ status, language }: { status: Extract<LinkMsg, { type: "status" }>; language: string }) {
  const tx = phoneText(language);
  const c = kioskCard(status, language);
  return (
    <details className="group mx-4 mb-2 shrink-0 rounded-2xl border border-[var(--k-line)] text-sm" data-kiosk-card>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 break-words">
          <span className="text-[var(--k-muted)]">{tx.kioskNow} · </span>
          <b>{c.label}</b>
          {c.summary && <span className="text-[var(--k-muted)]"> · {c.summary}</span>}
        </span>
        {c.lines.length > 0 && (
          <span className="shrink-0 text-[var(--k-muted)] group-open:rotate-180" aria-hidden>
            ▾
          </span>
        )}
      </summary>
      {c.lines.length > 0 && (
        <div className="border-t border-[var(--k-line)] px-3 py-2">
          <ul className="space-y-1">
            {c.lines.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="min-w-0 flex-1 break-words">{l.name}</span>
                <span className="shrink-0 tabular-nums">×{l.qty}</span>
                <span className="shrink-0 tabular-nums">{won(l.price)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex justify-between border-t border-dashed border-[var(--k-line)] pt-1 font-bold">
            <span>{tx.total}</span>
            <span className="tabular-nums">{won(c.total)}</span>
          </div>
        </div>
      )}
    </details>
  );
}
