import { afterEach, describe, expect, it, vi } from "vitest";
import type { LinkGate, LinkMsg } from "@/sync/link";
import { createTurn, planSay, rejectSay, type TurnDeps, type TurnPhase, type Understood } from "./turn";

type E = string;
const gate = { kind: "ack" as const, what: "dangerous_goods", text: "확인해 주세요", button: "확인했어요" };
const confirmCard = (bags: number) => ({ kind: "ack" as const, what: "confirm_checkin", text: `짐 ${bags}개, 확정할까요?`, button: "확정" });
const passportCard = { kind: "device" as const, what: "passport", text: "여권을 넣어 주세요" };

// 해석은 손으로 끝내는 약속, 재생은 바로 끝나는 가짜
function harness(over: Partial<TurnDeps<E>> = {}) {
  const sent: LinkMsg[] = [];
  const phases: TurnPhase[] = [];
  const asks: { text: string; resolve: (u: Understood<E>) => void; reject: (e: Error) => void; signal: AbortSignal }[] = [];
  const played: E[][] = [];
  const deps: TurnDeps<E> = {
    understand: (text, signal) => new Promise((resolve, reject) => asks.push({ text, resolve, reject, signal })),
    play: async (events) => {
      played.push(events);
      return true;
    },
    resume: () => null,
    send: (m) => sent.push(m),
    onPhase: (p) => phases.push(p),
    ...over,
  };
  const turn = createTurn(deps);
  const replies = () => sent.filter((m) => m.type === "reply");
  return { turn, sent, phases, asks, played, replies };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const planned = (events: E[], g = null as LinkGate | null): Understood<E> => ({ kind: "plan", events, lang: "ko", done: { say: "다 됐어요", gate: g } });
// 휴대폰에 마지막으로 뜬 관문 카드(id 포함)
const lastCard = (sent: LinkMsg[]) => sent.filter((m) => m.type === "done").at(-1)!.gate!;

afterEach(() => vi.useRealTimers());

describe("KIBO 한 턴", () => {
  it("말 한 번에 대답은 한 번(고정 문구), 재생이 끝난 뒤에 완료와 관문 카드를 보낸다", async () => {
    const h = harness();
    h.turn.hear({ id: "u1", text: "치즈버거", lang: "Korean" });
    expect(h.turn.phase()).toBe("thinking");
    h.asks[0].resolve(planned(["a", "b"], gate));
    await flush();
    expect(h.played).toEqual([["a", "b"]]);
    expect(h.sent).toEqual([
      { type: "reply", re: "u1", say: "알겠어요. 제가 2번 눌러 드릴게요.", replyLanguage: "ko", result: "plan", taps: 2 },
      { type: "done", re: "u1", ok: true, say: "다 됐어요", replyLanguage: "ko", gate: { ...gate, id: expect.any(String) } },
    ]);
    expect(h.phases).toEqual(["thinking", "replaying", "waiting_gate"]);
  });

  it("계획에 알아들은 내용(lead)이 있으면 '몇 번 눌러 드릴게요' 앞에 먼저 말한다(11/4: 고정 문구만 되풀이하면 알아들었는지 모른다)", async () => {
    const h = harness();
    h.turn.hear({ id: "u1", text: "불고기버거 세트", lang: "Korean" });
    h.asks[0].resolve({ ...planned(["a", "b"]), lead: "불고기버거 세트 M(감자튀김·콜라), 매장 식사." } as Understood<E>);
    await flush();
    expect(h.replies()[0].say).toBe("불고기버거 세트 M(감자튀김·콜라), 매장 식사. 알겠어요. 제가 2번 눌러 드릴게요.");
  });

  it("누를 것이 없는 턴에 서버가 Spark 답(answer)을 주면 '누를 버튼이 없어요' 대신 그 답을 말한다(11/4 실기기: 메뉴 화면 '무슨 버거 있어?'에 고정 문구)", async () => {
    const h = harness();
    h.turn.hear({ id: "u1", text: "무슨 버거 있어요?", lang: "Korean" });
    h.asks[0].resolve({ ...planned([]), answer: "불고기버거, 새우버거가 있어요." } as Understood<E>);
    await flush();
    expect(h.replies()[0].say).toBe("불고기버거, 새우버거가 있어요.");
  });

  it("서버가 말한 언어를 따라오라고 하면(followSpoken) 대답에 그 신호를 실어 휴대폰에 보낸다. 없으면 싣지 않는다", async () => {
    const h = harness();
    h.turn.hear({ id: "u1", text: "Can I get a cheeseburger meal", lang: "Korean" });
    h.asks[0].resolve({ kind: "clarify", say: "Which size?", lang: "en", followSpoken: true });
    await flush();
    h.turn.hear({ id: "u2", text: "치즈버거", lang: "Korean" });
    h.asks[1].resolve({ kind: "clarify", say: "사이즈는요?", lang: "ko" });
    await flush();
    expect(h.replies()).toEqual([
      { type: "reply", re: "u1", say: "Which size?", replyLanguage: "en", result: "clarify", followSpoken: true },
      { type: "reply", re: "u2", say: "사이즈는요?", replyLanguage: "ko", result: "clarify" },
    ]);
  });

  it("되묻기 답 칩 종류(answers)를 되묻는 대답과 완료(더 주문?)에 실어 휴대폰에 보낸다", async () => {
    const h = harness();
    h.turn.hear({ id: "u1", text: "치즈버거 세트", lang: "Korean" });
    h.asks[0].resolve({ kind: "clarify", say: "사이즈는요?", lang: "ko", answers: "size" });
    await flush();
    h.turn.hear({ id: "u2", text: "L", lang: "Korean" });
    h.asks[1].resolve({ kind: "plan", events: ["a"], lang: "ko", done: { say: "더 주문하실 게 있나요?", gate: null, answers: "more" } });
    await flush();
    expect(h.replies()[0]).toMatchObject({ result: "clarify", answers: "size" });
    expect(h.sent.find((m) => m.type === "done")).toMatchObject({ say: "더 주문하실 게 있나요?", answers: "more" });
  });

  it("되물을 때도 아는 만큼 먼저 누른다: 되묻는 대답을 먼저 보내고 그 버튼들을 재생한다. 완료(done)는 보내지 않는다", async () => {
    const h = harness();
    h.turn.hear({ id: "u1", text: "더블 치즈버거 세트, 먹고 갈게요", lang: "Korean" });
    h.asks[0].resolve({ kind: "clarify", say: "사이즈는요?", lang: "ko", events: ["start", "order_type"] });
    await flush();
    expect(h.sent).toEqual([{ type: "reply", re: "u1", say: "사이즈는요?", replyLanguage: "ko", result: "clarify" }]);
    expect(h.played).toEqual([["start", "order_type"]]);
    expect(h.phases).toEqual(["thinking", "replaying", "idle"]);
  });

  it("바쁠 때: 같은 메시지 id는 버리고, 같은 말은 '하던 대로' 답, 다른 말은 하나만 기다렸다 처리, 그 이상은 '다시 말해 달라' 답. 말마다 대답은 정확히 하나", async () => {
    const h = harness();
    h.turn.hear({ id: "u1", text: "더블 치즈버거 세트", lang: "Korean" });
    h.turn.hear({ id: "u1", text: "더블 치즈버거 세트", lang: "Korean" });
    h.turn.hear({ id: "u2", text: "더블 치즈버거  세트.", lang: "Korean" });
    h.turn.hear({ id: "u3", text: "애플파이도요", lang: "Korean" });
    h.turn.hear({ id: "u4", text: "콜라도", lang: "Korean" });
    expect(h.asks).toHaveLength(1);
    h.asks[0].resolve(planned(["a"]));
    await flush();
    expect(h.asks.map((a) => a.text)).toEqual(["더블 치즈버거 세트", "애플파이도요"]);
    h.asks[1].resolve({ kind: "clarify", say: "몇 개요?", lang: "ko" });
    await flush();
    const byRe: Record<string, string[]> = {};
    for (const m of h.replies()) if (m.type === "reply") (byRe[m.re] ??= []).push(m.result);
    expect(byRe).toEqual({ u1: ["plan"], u2: ["busy"], u3: ["clarify"], u4: ["busy"] });
    expect(h.turn.phase()).toBe("idle");
  });

  it("해석이 실패하면 사과한다. 8초가 지나면 '아직 생각 중' 고정 문구를 한 번 보내고 20초까지 기다린다. 20초 안의 답은 그대로 쓰고, 넘기면 사과하고 늦은 답은 버린다", async () => {
    vi.useFakeTimers();
    let slow = 0;
    const h = harness({ onSlow: () => slow++ });
    const slows = () => h.sent.filter((m) => m.type === "slow");
    h.turn.hear({ id: "u1", text: "치즈버거", lang: "Korean" });
    h.asks[0].reject(new Error("504"));
    await vi.advanceTimersByTimeAsync(0);
    h.turn.hear({ id: "u2", text: "여보세요?", lang: "Korean" });
    await vi.advanceTimersByTimeAsync(7_999);
    expect(slows()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(slows()).toEqual([{ type: "slow", re: "u2", say: "아직 생각 중이에요. 잠시만 기다려 주세요.", replyLanguage: "ko" }]);
    expect(slow).toBe(1);
    await vi.advanceTimersByTimeAsync(11_999);
    expect(h.asks[1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.asks[1].signal.aborted).toBe(true);
    expect(h.replies().map((m) => m.type === "reply" && [m.re, m.result])).toEqual([
      ["u1", "error"],
      ["u2", "error"],
    ]);
    expect(h.turn.phase()).toBe("idle");

    // 15초 만에 온 답은 정상 처리. 20초를 넘겨 버린 u2의 늦은 답은 쓰지 않는다
    h.turn.hear({ id: "u3", text: "콜라", lang: "Korean" });
    await vi.advanceTimersByTimeAsync(15_000);
    h.asks[2].resolve(planned(["cola"]));
    h.asks[1].resolve(planned(["late"]));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.replies().at(-1)).toMatchObject({ re: "u3", result: "plan" });
    expect(h.played).toEqual([["cola"]]);
    expect(slows().map((m) => m.type === "slow" && m.re)).toEqual(["u2", "u3"]);
  });

  it("재생이 실패하면 완료 대신 실패를 알린다. 관문 확인은 지금 떠 있는 카드의 id로, 관문을 기다릴 때만 받는다. 해석·재생 중에 온 확인과 옛 카드의 확인은 버리고 '처리 중' 고정 문구를 보낸다", async () => {
    const fail = harness({ play: async () => false });
    fail.turn.hear({ id: "u1", text: "치즈버거", lang: "Korean" });
    fail.asks[0].resolve(planned(["a"], gate));
    await flush();
    expect(fail.sent.at(-1)).toMatchObject({ type: "done", re: "u1", ok: false, gate: null });
    expect(fail.turn.phase()).toBe("idle");

    // B6: 「짐 1개」 카드 → "짐은 두 개예요" → 해석하는 동안 옛 카드의 [확정] → 새 카드 「짐 2개」가 떠도 그 확인은 적용되지 않는다
    const resumed: string[] = [];
    const h = harness({ resume: (what) => (resumed.push(what), { events: ["confirm"], lang: "ko", done: { say: "", gate: null } }) });
    h.turn.hear({ id: "u1", text: "도쿄", lang: "Korean" });
    h.asks[0].resolve(planned(["a"], confirmCard(1)));
    await flush();
    const card1 = lastCard(h.sent).id!;
    expect(card1).toBeTruthy();
    h.turn.hear({ id: "u2", text: "짐은 두 개예요", lang: "Korean" });
    h.turn.ack("confirm_checkin", card1);
    expect(h.sent.at(-1)).toEqual({ type: "reply", re: expect.stringMatching(new RegExp(`^ack:${card1}:`)), say: "지금 처리 중이에요. 새 안내가 나오면 그때 확인해 주세요.", replyLanguage: "ko", result: "busy" });
    h.asks[1].resolve(planned([], confirmCard(2)));
    await flush();
    expect(resumed).toEqual([]);
    const card2 = lastCard(h.sent).id!;
    expect(card2).not.toBe(card1);
    expect(h.turn.phase()).toBe("waiting_gate");
    h.turn.ack("confirm_checkin", card1); // 늦게 도착한 옛 카드 확인
    h.turn.ack("confirm_checkin"); // id 없는 확인
    await flush();
    expect(resumed).toEqual([]);
    h.turn.ack("confirm_checkin", card2);
    await flush();
    expect(resumed).toEqual(["confirm_checkin"]);
    expect(h.turn.phase()).toBe("idle");
  });

  it("확인 관문을 기다릴 때 고정 '예' 목록과 맞는 말은 Spark를 거치지 않고 동의로 이어 간다. '네?'는 해석으로 보낸다", async () => {
    const resumed: string[] = [];
    const h = harness({ resume: (what) => (resumed.push(what), { events: ["accept"], lang: "ko", done: { say: "", gate: null } }) });
    h.turn.hear({ id: "u1", text: "도쿄", lang: "Korean" });
    h.asks[0].resolve(planned(["a"], gate));
    await flush();
    h.turn.hear({ id: "u2", text: "네?", lang: "Korean" });
    expect(h.asks.map((a) => a.text)).toEqual(["도쿄", "네?"]);
    h.asks[1].resolve(planned([], gate));
    await flush();
    // 관문에서 '예'가 아니고 누를 것이 없으면 '알겠어요' 대신 어떻게 확인하는지 알려 준다
    expect(h.replies().at(-1)).toMatchObject({ re: "u2", say: '확인하시려면 "네"라고 말씀하시거나 [확인했어요] 버튼을 눌러 주세요. 금지 물품이 있으면 직원에게 문의해 주세요.' });
    h.turn.hear({ id: "u3", text: "네, 확인했어요.", lang: "Korean", gateId: lastCard(h.sent).id });
    await flush();
    expect(h.asks).toHaveLength(2);
    expect(resumed).toEqual(["dangerous_goods"]);
    expect(h.sent.filter((m) => m.type !== "reply" || m.re === "u3").slice(-2)).toEqual([
      { type: "reply", re: "u3", say: "알겠어요.", replyLanguage: "ko", result: "plan", taps: 0 },
      { type: "done", re: "u3", ok: true, say: "", replyLanguage: "ko", gate: null },
    ]);

    // 여권은 몸으로 하는 일이라 "네"로 넘어가지 않는다. 그 말은 해석으로 간다
    const p = harness({ resume: (what) => (resumed.push(what), null) });
    p.turn.hear({ id: "u1", text: "도쿄", lang: "Korean" });
    p.asks[0].resolve(planned(["a"], passportCard));
    await flush();
    p.turn.hear({ id: "u2", text: "네", lang: "Korean" });
    expect(p.asks.map((a) => a.text)).toEqual(["도쿄", "네"]);
    expect(resumed).toEqual(["dangerous_goods"]);
  });

  it("거절은 이유별 고정 문구로 답한다(수량 초과·못 하는 일·나가기). 누를 것이 없는 계획은 '알겠어요'처럼 성공으로 답하지 않는다", async () => {
    const h = harness();
    const say = async (id: string, u: Understood<E>) => {
      h.turn.hear({ id, text: id, lang: "Korean" });
      h.asks.at(-1)!.resolve(u);
      await flush();
      return h.replies().at(-1);
    };
    expect(await say("q", { kind: "reject", reason: "bad_qty", lang: "ko" })).toMatchObject({ result: "reject", say: "한 번에 10개까지 주문할 수 있어요." });
    expect(await say("u", { kind: "reject", reason: "unsupported", lang: "en" })).toMatchObject({ say: "To change or remove items already in your order, please tap them yourself on the order review screen." });
    expect(await say("x", { kind: "reject", reason: "other", lang: "ko" })).toMatchObject({ say: "죄송해요, 그건 이 키오스크에서 해 드릴 수 없어요. 다르게 말씀해 주시거나 직원을 불러 주세요." });
    expect(await say("n", planned([]))).toMatchObject({ result: "plan", taps: 0, say: "지금은 제가 누를 버튼이 없어요." });
    // 결제 화면(결제 완료·주문번호 포함)에서 새로 주문하면 "할 수 없어요"가 아니라 이유와 누를 버튼을 말한다(11/3 실기기)
    expect(rejectSay("payment_in_progress", "en", { b: "Start over" })).toBe("The kiosk is at payment, so I can't take a new order yet. To order again, tap [Start over] on the kiosk, then tell me.");
  });

  it("확정 관문에서 '그만할래요'(나가기)는 거절하고, 확정 카드를 다시 띄우지 않는다. 그다음 '네'는 동의가 아니라 해석으로 간다", async () => {
    const resumed: string[] = [];
    const h = harness({ resume: (what) => (resumed.push(what), { events: ["confirm"], lang: "ko", done: { say: "", gate: null } }) });
    h.turn.hear({ id: "u1", text: "도쿄", lang: "Korean" });
    h.asks[0].resolve(planned(["a"], confirmCard(1)));
    await flush();
    const cards = () => h.sent.filter((m) => m.type === "done" && m.gate).length;
    expect(cards()).toBe(1);
    h.turn.hear({ id: "u2", text: "체크인 그만할래요", lang: "Korean" });
    // 거절 문구는 서버가 키오스크 버튼 이름을 넣어 만든 것을 Station이 그대로 넘긴다
    const exitSay = "처음으로 가려면 화면 아래 [나가기]를 눌러 주세요. 체크인은 확정되지 않았어요.";
    h.asks[1].resolve({ kind: "reject", reason: "exit", lang: "ko", say: exitSay });
    await flush();
    expect(h.replies().at(-1)).toMatchObject({ re: "u2", result: "reject", say: exitSay });
    expect(cards()).toBe(1);
    expect(h.turn.phase()).toBe("idle");
    h.turn.hear({ id: "u3", text: "네", lang: "Korean" });
    expect(h.asks.map((a) => a.text)).toEqual(["도쿄", "체크인 그만할래요", "네"]);
    expect(resumed).toEqual([]);
  });

  it("'예' 빠른 길은 카드에 묶인다: 카드 id가 없거나 다른 '네'는 동의가 아니라 해석으로 간다(엿들은 제3자·옛 대기열의 '네')", async () => {
    const resumed: string[] = [];
    const h = harness({ resume: (what) => (resumed.push(what), null) });
    h.turn.hear({ id: "u1", text: "도쿄", lang: "Korean" });
    h.asks[0].resolve(planned(["a"], gate));
    await flush();
    h.turn.hear({ id: "u2", text: "네", lang: "Korean", gateId: "old-g9" });
    h.asks[1].resolve(planned([], gate));
    await flush();
    h.turn.hear({ id: "u3", text: "네", lang: "Korean" });
    expect(h.asks.map((a) => a.text)).toEqual(["도쿄", "네", "네"]);
    expect(resumed).toEqual([]);
  });

  it("휴대폰이 다시 연결해 hello를 보내면 다시 보낼 카드: 떠 있는 동안만 그 카드(id 포함), 넘기거나 화면을 만지면 없음", async () => {
    const h = harness({ resume: () => null });
    expect(h.turn.card()).toBeNull();
    h.turn.hear({ id: "u1", text: "도쿄", lang: "Korean" });
    h.asks[0].resolve(planned(["a"], gate));
    await flush();
    expect(h.turn.card()).toEqual(lastCard(h.sent));
    h.turn.ack(gate.what, lastCard(h.sent).id);
    await flush();
    expect(h.turn.card()).toBeNull();
    h.turn.hear({ id: "u2", text: "도쿄", lang: "Korean" });
    h.asks[1].resolve(planned(["a"], passportCard));
    await flush();
    expect(h.turn.card()).toMatchObject(passportCard);
    h.turn.touched();
    expect(h.turn.card()).toBeNull();
  });

  it("관문 카드 id에는 세션마다 다른 접두어가 붙는다(다시 열린 화면의 g1이 옛 카드의 g1과 겹치지 않게)", async () => {
    const ids = await Promise.all(
      [0, 1].map(async () => {
        const h = harness();
        h.turn.hear({ id: "u1", text: "도쿄", lang: "Korean" });
        h.asks[0].resolve(planned(["a"], gate));
        await flush();
        return lastCard(h.sent).id!;
      }),
    );
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("카드를 보낸 직후, 턴이 끝나기 전(재생 중)에 같은 id로 온 확인은 받지 않는다. 턴이 끝난 뒤 다시 온 확인은 한 번만 받는다", async () => {
    const resumed: string[] = [];
    const h = harness({
      resume: (what) => (resumed.push(what), { events: ["accept"], lang: "ko", done: { say: "", gate: null } }),
      send: (m) => {
        h.sent.push(m);
        // 같은 프로세스의 휴대폰이 카드를 받자마자(마이크로태스크) 확인을 보낸다
        if (m.type === "done" && m.gate) queueMicrotask(() => h.turn.ack(m.gate!.what, m.gate!.id));
      },
    });
    h.turn.hear({ id: "u1", text: "도쿄", lang: "Korean" });
    h.asks[0].resolve(planned(["a"], gate));
    await flush();
    expect(resumed).toEqual([]);
    expect(h.turn.phase()).toBe("waiting_gate");
    h.turn.ack("dangerous_goods", lastCard(h.sent).id);
    await flush();
    expect(resumed).toEqual(["dangerous_goods"]);
    expect(h.turn.phase()).toBe("idle");
  });
});

describe("계획 고정 문구", () => {
  it("누를 버튼 없이 늦은 열차 확인에서 멈추면 그 열차로 할지 묻는다(체크인 확정 문구가 아니다)", () => {
    expect(planSay(0, "ko", { what: "later_train", button: "이 열차로 할게요" })).toBe('이 열차로 하시려면 "네"라고 말씀하시거나 [이 열차로 할게요] 버튼을 눌러 주세요.');
    expect(planSay(0, "en", { what: "later_train", button: "Take this train" })).toBe('To take this train, say "yes" or tap [Take this train].');
  });
});
