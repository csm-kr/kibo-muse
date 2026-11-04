import { describe, expect, it } from "vitest";
import { trialFileName } from "./TrialRecorder";

describe("사용자 시험 기록 파일 이름", () => {
  it("참가자와 조건을 넣는다. 시도가 여럿이면 각각 겹치지 않게 이어 붙인다(touch+kibo)", () => {
    const at = "2026-11-04T01:02:03.456Z";
    expect(trialFileName("fastfood", [{ participant: "P1", condition: "touch" }], at)).toBe("kibo-trial-fastfood-P1-touch-2026-11-04T01-02-03-456Z.json");
    expect(trialFileName("fastfood", [{ participant: "P1", condition: "touch" }, { participant: "P1", condition: "kibo" }, { participant: "P2", condition: "kibo" }], at)).toBe("kibo-trial-fastfood-P1+P2-touch+kibo-2026-11-04T01-02-03-456Z.json");
  });
});
