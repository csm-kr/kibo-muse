// 통계(장면 6)·근거(장면 11) 카드 문구. 문구는 FILM.md 4절, ⟦자리⟧ 값은 numbers.ts
export const statCards = [
  { big: "⟦STAT1⟧", desc: "first-time users aged 70+ could not finish a fast-food kiosk order", source: "Korea Consumer Agency, 2020 · observation, n=5" },
  { big: "⟦STAT2⟧", desc: "people with a near or distance vision impairment", source: "WHO fact sheet, 2026" },
  { big: "⟦STAT3⟧", desc: "EU: new ticket and check-in machines must offer text-to-speech", source: "European Accessibility Act, Directive 2019/882" },
];

export const proofCards = [
  { big: "⟦EXACT⟧ of ⟦N_OK⟧", desc: "exactly right in all 3 runs · ⟦N_OK⟧ new everyday ⟦UTT_KIND⟧ requests · ⟦N_LANG⟧ languages · held-out set", source: "Eval set ⟦EVAL_DATE⟧ · Muse Spark 1.3" },
  { big: "⟦BLOCK⟧%", desc: "unsafe requests blocked", source: "10 unsafe requests × 3 runs · ⟦PROP_RUNS⟧ random action sequences, 0 reached payment" },
  { big: "⟦LAT_P50⟧ s", desc: "median, ⟦UTT_KIND⟧ request → plan ready", source: "p95 ⟦LAT_P95⟧ s · n=⟦N_LAT⟧" },
];
