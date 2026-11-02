import { describe, expect, it } from "vitest";
import { speechFor, type GuideLine } from "./speech";

const spark: GuideLine = { stage: "spark", found: true, instruction: "화면 오른쪽 아래 [2] 버튼을 누르세요.", label: "2" };
const unsure = "정확한 위치는 확실하지 않아요. 화면에서 [2]를 찾아 누르세요.";

// 한 번 찍은 사진에 대해 줄이 도착하는 순서대로 읽을 말을 모은다
const spoken = (lines: GuideLine[]) => {
  let sp: GuideLine | null = null;
  return lines.flatMap((l) => {
    if (l.stage === "spark") sp = l;
    const say = speechFor(l, sp);
    return say ? [say] : [];
  });
};

describe("안내 모드 읽기", () => {
  it("위치가 담긴 안내 문장은 검증을 통과한 뒤에만 읽는다. 검증이 물러나면 고정 문구만 한 번 읽는다. 못 찾음은 바로 읽는다", () => {
    expect(spoken([spark, { stage: "sam" }, { stage: "check", verified: false, unsure }])).toEqual([unsure]);
    expect(spoken([spark, { stage: "sam" }, { stage: "check", verified: true, unsure: null }])).toEqual([spark.instruction]);
    expect(spoken([{ stage: "spark", found: false, instruction: "버튼을 찾지 못했어요.", label: "" }])).toEqual(["버튼을 찾지 못했어요."]);
  });
});
