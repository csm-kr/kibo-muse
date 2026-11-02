// 안내 모드에서 줄(spark → sam → check)마다 소리 내어 읽을 말. 휴대폰 화면에서 쓴다(서버 모듈을 끌어오지 않게 따로 둔다).
// Spark의 안내 문장에는 위치("오른쪽 아래")가 들어 있다. 저시력 사용자는 들은 위치를 믿으므로 글자 검증을 통과한 뒤에만 읽고,
// 검증이 물러나면 위치 없는 고정 문구만 읽는다. 버튼을 못 찾았다는 말은 위치가 없어 바로 읽는다.

export type GuideLine =
  | { stage: "spark"; found: boolean; instruction: string; label: string }
  | { stage: "sam" }
  | { stage: "check"; verified: boolean; unsure: string | null };

export function speechFor(line: GuideLine, spark: GuideLine | null): string | null {
  if (line.stage === "spark") return line.found ? null : line.instruction;
  if (line.stage === "check") return line.verified ? (spark?.stage === "spark" ? spark.instruction : null) : line.unsure;
  return null;
}
