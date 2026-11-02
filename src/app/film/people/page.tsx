import { C, Canvas, Txt } from "../Card";
import { people } from "../numbers";

export const metadata = { title: "KIBO film · people" };

const TBD = <span style={{ color: C.tbd }}>TBD</span>;
const done = (d: boolean | null, time: string | null) =>
  d === null ? (
    TBD
  ) : (
    <>
      <span style={{ color: d ? C.second : C.accent }}>{d ? "✓" : "✗"}</span> {time ?? TBD}
    </>
  );

// 장면 12 (10초): 참가자 / 터치 / KIBO / SEQ 터치→KIBO
export default function Page() {
  const cell = { padding: "28px 24px", borderBottom: "2px solid rgba(248,250,252,0.15)" } as const;
  return (
    <Canvas>
      <div style={{ display: "flex", height: "100%", flexDirection: "column", justifyContent: "center" }}>
        <table className="film-in" style={{ width: "100%", borderCollapse: "collapse", fontSize: 56, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr style={{ fontSize: 32, color: C.muted, textAlign: "left" }}>
              <th style={cell}>Participant</th>
              <th style={cell}>Touch</th>
              <th style={cell}>KIBO</th>
              <th style={cell}>SEQ touch → KIBO</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.name}>
                <td style={cell}>{p.name}</td>
                <td style={cell}>{done(p.touchDone, p.touchTime)}</td>
                <td style={cell}>{done(p.kiboDone, p.kiboTime)}</td>
                <td style={cell}>
                  {p.seqTouch ?? TBD} → {p.seqKibo ?? TBD}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="film-fade" style={{ animationDelay: "300ms", marginTop: 48, fontSize: 28, color: C.muted }}>
          <Txt t="Small trial (n=3), ⟦TRIAL_DATE⟧. Not a clinical study. Times from video: start signal → review screen." />
        </div>
      </div>
    </Canvas>
  );
}
