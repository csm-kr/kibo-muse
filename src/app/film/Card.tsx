// 영상 카드 공통: 1920×1080 고정 캔버스, 색·글꼴·여백은 FILM.md 4절.
// globals.css의 body가 Arial로 덮으므로 geist 글꼴을 직접 지정한다.

import type { CSSProperties, ReactNode } from "react";
import { fill } from "./fill";
import { numbers } from "./numbers";

export const C = { bg: "#042f2e", fg: "#f8fafc", accent: "#f97316", second: "#2dd4bf", muted: "#94a3b8", tbd: "#ef4444" };

// ⟦자리⟧를 채운 글. 빈 값은 빨간 TBD
export function Txt({ t }: { t: string }) {
  return (
    <>
      {fill(t, numbers).map((p, i) =>
        p.tbd ? (
          <span key={i} style={{ color: C.tbd }} data-tbd>
            TBD
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export function Canvas({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      data-film-canvas
      style={{ width: 1920, height: 1080, flexShrink: 0, overflow: "hidden", position: "relative", boxSizing: "border-box", padding: "96px 120px", background: C.bg, color: C.fg, fontFamily: "var(--font-geist-sans)", ...style }}
    >
      {children}
    </div>
  );
}

// 큰 숫자 / 설명 / 출처. 숫자 → +150ms 설명 → +300ms 출처
export function StatCard({ big, desc, source, bigColor = C.accent, bigSize = 220, descSize = 56, sourceSize = 28 }: { big: string; desc: string; source: string; bigColor?: string; bigSize?: number; descSize?: number; sourceSize?: number }) {
  return (
    <Canvas>
      <div style={{ display: "flex", height: "100%", flexDirection: "column", justifyContent: "center" }}>
        <div className="film-in" style={{ fontSize: bigSize, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: bigColor, letterSpacing: "-0.02em" }}>
          <Txt t={big} />
        </div>
        <div className="film-in" style={{ animationDelay: "150ms", marginTop: 48, maxWidth: 1400, fontSize: descSize, fontWeight: 600, lineHeight: 1.2 }}>
          <Txt t={desc} />
        </div>
        <div className="film-fade" style={{ animationDelay: "300ms", marginTop: 40, fontSize: sourceSize, color: C.muted }}>
          <Txt t={source} />
        </div>
      </div>
    </Canvas>
  );
}
