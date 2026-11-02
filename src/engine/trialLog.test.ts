import { describe, expect, it } from "vitest";
import { FASTFOOD_TASK, judgeTrial, summarize, type TrialCartLine, type TrialEvent } from "./trialLog";

const ev = (t: number, kind: TrialEvent["kind"], by: TrialEvent["by"], screen: string, extra: Partial<TrialEvent> = {}): TrialEvent => ({ t, kind, by, screen, ...extra });

describe("사용자 시험 기록 요약", () => {
  it("진행자 [시작] 뒤만 센다: 주문 확인(review)까지 ms, 사람·KIBO 탭, 말 턴, 말 시도(listen), 되돌림 탭, 거절, 초기화(처음 화면으로 돌아감), 시간 초과 경고", () => {
    const log: TrialEvent[] = [
      // 시작 전 연습은 세지 않는다
      ev(100, "tap", "human", "order_type", { target: "start" }),
      ev(1_000, "start", "facilitator", "idle"),
      ev(2_000, "tap", "human", "order_type", { target: "start" }),
      ev(2_500, "listen", "phone", "order_type"),
      ev(3_000, "turn", "phone", "order_type"),
      ev(5_000, "result", "kibo", "order_type", { result: "clarify" }),
      ev(9_000, "warning", "kiosk", "order_type"),
      ev(9_500, "reset", "kiosk", "idle"),
      // 받아쓰기에 실패한 말 시도(턴 없음)도 시도로 센다
      ev(10_000, "listen", "phone", "idle"),
      ev(10_500, "listen", "phone", "idle"),
      ev(11_000, "turn", "phone", "idle"),
      ev(12_000, "result", "kibo", "idle", { result: "reject" }),
      ev(14_000, "turn", "phone", "idle"),
      ev(16_000, "result", "kibo", "idle", { result: "plan" }),
      ev(16_700, "tap", "kibo", "order_type", { target: "start" }),
      ev(17_400, "tap", "kibo", "menu", { target: "eat_in" }),
      ev(18_100, "tap", "kibo", "review", { target: "cart" }),
      ev(20_000, "tap", "human", "menu", { target: "add_more" }),
      // 되돌림(빼기·취소·수량 줄이기·처음부터)
      ev(20_500, "tap", "human", "menu", { target: "cancel" }),
      ev(21_000, "tap", "human", "review", { target: "cart" }),
    ];
    expect(summarize(log)).toEqual({ msToReview: 17_100, humanTaps: 4, kiboTaps: 3, turns: 3, listens: 3, undos: 1, rejects: 1, resets: 1, warnings: 1 });
  });

  it("[시작]을 누르지 않았으면 시간은 null, 여러 번 눌렀으면 마지막 [시작]부터 센다", () => {
    expect(summarize([ev(10, "tap", "human", "review")]).msToReview).toBeNull();
    const twice = [ev(0, "start", "facilitator", "idle"), ev(5, "tap", "human", "review"), ev(100, "start", "facilitator", "idle"), ev(400, "tap", "human", "review")];
    expect(summarize(twice)).toMatchObject({ msToReview: 300, humanTaps: 1 });
  });

  it("주문 확인에 처음 도달할 때 남긴 장바구니로 과업 카드(먹고 가기, 더블 치즈버거 세트 라지, 감자튀김, 제로 콜라, 피클 빼기)를 판정한다. 포장을 골랐으면 orderType 불일치다", () => {
    const line: TrialCartLine = { menuId: "double_cheese", mode: "set", size: "L", side: "fries", drink: "zero_cola", remove: ["pickle"], add: [], qty: 1 };
    const run = (orderType: string, cart: TrialCartLine[]) => [ev(0, "start", "facilitator", "idle"), ev(5_000, "tap", "human", "menu", { target: "take_out" }), ev(9_000, "cart", "kiosk", "review", { orderType, cart }), ev(12_000, "cart", "kiosk", "review", { orderType: "eat_in", cart: [line] })];
    expect(judgeTrial(run("eat_in", [line]), FASTFOOD_TASK)).toEqual({ reached: true, correct: true, mismatches: [] });
    // 처음 도달한 장바구니로 판정한다(뒤에 고친 것은 보지 않는다)
    expect(judgeTrial(run("take_out", [line]), FASTFOOD_TASK)).toEqual({ reached: true, correct: false, mismatches: ["orderType: take_out (want eat_in)"] });
    // 줄 수가 같으면 항목별로 센다: 사이드만 틀리면 불일치 1개
    expect(judgeTrial(run("eat_in", [{ ...line, side: "coleslaw" }]), FASTFOOD_TASK).mismatches).toEqual(["side: coleslaw (want fries)"]);
    expect(judgeTrial(run("eat_in", [{ ...line, drink: "cola", remove: [] }]), FASTFOOD_TASK).mismatches).toEqual(["drink: cola (want zero_cola)", "remove: none (want pickle)"]);
    // 줄 수가 다르면 줄 단위로 센다
    expect(judgeTrial(run("eat_in", [line, { ...line, menuId: "fries", mode: "single", size: null, side: null, drink: null, remove: [] }]), FASTFOOD_TASK).mismatches).toEqual(["extra: fries single ×1"]);
    expect(judgeTrial([ev(0, "start", "facilitator", "idle")], FASTFOOD_TASK)).toEqual({ reached: false, correct: false, mismatches: [] });
  });
});
