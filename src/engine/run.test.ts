import { describe, expect, it } from "vitest";
import { newRun, trackRun } from "./run";

describe("나란히 비교용 실측", () => {
  it("터치는 첫 터치부터, KIBO는 마이크를 누른 순간부터 주문 확인 화면까지 시간을 재고, 사람이 누른 횟수와 넘긴 화면 수를 센다", () => {
    let touch = newRun("review");
    touch = trackRun(touch, { type: "step", by: "touch", screen: "order_type" }, 1_000);
    touch = trackRun(touch, { type: "step", by: "touch", screen: "menu" }, 4_000);
    touch = trackRun(touch, { type: "step", by: "touch", screen: "menu" }, 6_000); // 같은 화면 안의 터치
    touch = trackRun(touch, { type: "step", by: "touch", screen: "review" }, 31_000);
    touch = trackRun(touch, { type: "step", by: "touch", screen: "payment" }, 40_000); // 끝난 뒤는 세지 않는다
    expect(touch).toMatchObject({ startedAt: 1_000, endedAt: 31_000, humanTaps: 4, kiboTaps: 0, screens: 3 });

    let kibo = newRun("review");
    kibo = trackRun(kibo, { type: "listening" }, 500);
    kibo = trackRun(kibo, { type: "step", by: "kibo", screen: "order_type" }, 9_000);
    kibo = trackRun(kibo, { type: "step", by: "kibo", screen: "review" }, 18_000);
    expect(kibo).toMatchObject({ startedAt: 500, endedAt: 18_000, humanTaps: 0, kiboTaps: 2, screens: 2 });

    // 처음 화면으로 돌아가면 새로 잰다
    expect(trackRun(kibo, { type: "step", by: "touch", screen: "idle" }, 60_000)).toEqual(newRun("review"));
  });
});
