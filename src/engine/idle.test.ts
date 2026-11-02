import { describe, expect, it } from "vitest";
import { idlePhase } from "./idle";

describe("무조작 시간 초과", () => {
  it("90초 동안 조작이 없으면 30초를 세는 경고를 띄우고, 다 세면 처음 화면으로 돌린다. 대기 화면에서는 세지 않는다", () => {
    expect(idlePhase(89_999, "menu")).toEqual({ kind: "active" });
    expect(idlePhase(90_000, "menu")).toEqual({ kind: "warning", secondsLeft: 30 });
    expect(idlePhase(110_500, "menu")).toEqual({ kind: "warning", secondsLeft: 10 });
    expect(idlePhase(120_000, "menu")).toEqual({ kind: "reset" });
    expect(idlePhase(999_999, "idle")).toEqual({ kind: "active" });
  });
});
