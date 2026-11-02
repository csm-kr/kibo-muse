import { C, Canvas, Txt } from "../Card";

export const metadata = { title: "KIBO film · end" };

// 장면 13 (10초)
export default function Page() {
  return (
    <Canvas>
      <div style={{ display: "flex", height: "100%", flexDirection: "column", justifyContent: "center", gap: 40 }}>
        <div className="film-in" style={{ fontSize: 80, fontWeight: 800, lineHeight: 1.1 }}>
          Any kiosk. Any language. Just say it.
        </div>
        <div className="film-in" style={{ animationDelay: "150ms", fontSize: 40, fontWeight: 600, color: C.second }}>
          Built with Muse Spark · Transcribe · SAM 3.1
        </div>
        <div className="film-fade" style={{ animationDelay: "300ms", fontSize: 36, fontFamily: "var(--font-geist-mono)" }}>
          <Txt t="⟦REPO⟧" />
        </div>
        <div className="film-fade" style={{ animationDelay: "300ms", fontSize: 28, color: C.muted }}>
          Code written during the event, Oct 26 – Nov 4, 2026 (US Eastern)
        </div>
      </div>
    </Canvas>
  );
}
