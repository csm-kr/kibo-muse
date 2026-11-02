import { C, Canvas } from "../Card";

export const metadata = { title: "KIBO film · pipeline" };

// 장면 7 (16초). 0–4초 노드가 600ms 간격으로 켜지고 선이 400ms에 그려짐 → 4초 Spark 아래 JSON 카드
// → 8초 검증기 아래 빨간 칩(pay·consent·passport ✕) + "stays with you" → 16초까지 유지.
const nodes = [
  { name: "Your voice", sub: "🎤 any language" },
  { name: "Transcribe", sub: "speech → text" },
  { name: "Muse Spark", sub: "text → actions" },
  { name: "Server check", sub: "state machine" },
  { name: "Kiosk", sub: "real screens" },
];
const W = 260;
const GAP = (1680 - W * nodes.length) / (nodes.length - 1);
const x = (i: number) => i * (W + GAP);
const TOP = 100;

// Spark가 실제로 내는 의도(스키마 그대로, 이 장면에 필요한 필드만)
const json = `{
  "orderType": "eat_in",
  "items": [{
    "menuId": "double_cheese",
    "mode": "set", "size": "L",
    "drink": "zero_cola",
    "remove": ["pickle"] }],
  "checkout": true
}`;

export default function Page() {
  return (
    <Canvas>
      <div style={{ position: "relative", height: "100%" }}>
        {nodes.slice(0, -1).map((_, i) => (
          <div
            key={`line-${i}`}
            className="film-line"
            style={{ position: "absolute", left: x(i) + W, top: TOP + 68, width: GAP - 6, height: 4, background: C.second, animationDelay: `${600 * i + 200}ms` }}
          >
            {/* 화살촉 */}
            <div style={{ position: "absolute", right: -8, top: -8, borderLeft: `14px solid ${C.second}`, borderTop: "10px solid transparent", borderBottom: "10px solid transparent" }} />
          </div>
        ))}
        {nodes.map((n, i) => (
          <div
            key={n.name}
            className="film-node"
            style={{
              position: "absolute",
              left: x(i),
              top: TOP,
              width: W,
              height: 140,
              boxSizing: "border-box",
              border: `3px solid ${C.second}`,
              borderRadius: 24,
              background: "rgba(45,212,191,0.08)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              animationDelay: `${600 * i}ms`,
            }}
          >
            <div style={{ fontSize: 40, fontWeight: 700, whiteSpace: "nowrap", letterSpacing: "-0.03em" }}>{n.name}</div>
            <div style={{ fontSize: 28, color: C.muted, whiteSpace: "nowrap" }}>{n.sub}</div>
          </div>
        ))}
        <pre
          className="film-in"
          style={{
            position: "absolute",
            left: x(2) + W / 2 - 300,
            top: TOP + 190,
            width: 600,
            margin: 0,
            boxSizing: "border-box",
            padding: "24px 32px",
            borderRadius: 20,
            background: "rgba(248,250,252,0.08)",
            fontFamily: "var(--font-geist-mono)",
            fontSize: 28,
            lineHeight: 1.35,
            animationDelay: "4000ms",
          }}
        >
          {json}
        </pre>
        <div style={{ position: "absolute", left: x(3) + W / 2 - 230, top: TOP + 560, width: 460, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", gap: 14 }}>
            {["pay ✕", "consent ✕", "passport ✕"].map((t, i) => (
              <span key={t} className="film-in" style={{ animationDelay: `${8000 + 150 * i}ms`, padding: "8px 20px", borderRadius: 999, background: "#dc2626", fontSize: 30, fontWeight: 700, whiteSpace: "nowrap" }}>
                {t}
              </span>
            ))}
          </div>
          <div className="film-in" style={{ animationDelay: "8600ms", fontSize: 40, fontWeight: 700, color: C.accent }}>
            stays with you
          </div>
        </div>
      </div>
    </Canvas>
  );
}
