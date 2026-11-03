// 사용자 시험 기록(USERTEST.md 측정: 시간·탭·턴·오류·초기화). 키오스크 단독 화면이 메모리에 쌓고 진행자가 JSON으로 내려받는다.
// 음성·전사문 원문·사진은 넣지 않는다. 말은 턴이 있었다는 사실과 결과 종류(plan/clarify/reject…)만 남긴다.
// 장바구니는 메뉴 id만 남긴다(주문 확인 화면에 처음 도달할 때 한 번).

export interface TrialCartLine {
  menuId: string;
  mode: string;
  size: string | null;
  side: string | null;
  drink: string | null;
  remove: string[];
  add: string[];
  qty: number;
}

export interface TrialEvent {
  // Date.now() 기준 ms
  t: number;
  // start: 진행자 [시작] · tap: 화면 누름 · turn: 휴대폰에서 말 한 번 · result: 그 말의 결과 · done: KIBO 재생 끝
  // warning: 시간 초과 경고 · reset: 시간 초과로 처음 화면 · listen: 휴대폰 마이크를 켬(받아쓰기 실패도 시도로 센다)
  // cart: 주문 확인 화면에 처음 도달했을 때의 주문 방식과 장바구니
  kind: "start" | "tap" | "turn" | "result" | "done" | "warning" | "reset" | "listen" | "cart";
  by: "human" | "kibo" | "phone" | "kiosk" | "facilitator";
  // 이 사건 뒤의 화면
  screen: string;
  // tap이면 누른 대상(버튼 id)
  target?: string;
  // tap이면 그 버튼의 값(메뉴 id, 크기 등)
  value?: string;
  orderType?: string | null;
  cart?: TrialCartLine[];
  // start면 참가자 번호(P1–P3)와 조건(touch/kibo), 시도 번호(1부터, 기록을 지우기 전까지 이어진다)
  participant?: string;
  condition?: string;
  session?: number;
  // result면 plan | clarify | reject | error | busy
  result?: string;
}

export interface TrialSummary {
  // 마지막 [시작]부터 주문 확인 화면이 처음 보인 순간까지. [시작]이 없거나 도달하지 못했으면 null
  msToReview: number | null;
  humanTaps: number;
  kiboTaps: number;
  turns: number;
  // 말 시도(마이크를 켠 횟수)
  listens: number;
  // 되돌림: 사람이 누른 취소·수량 줄이기·줄 빼기·처음부터
  undos: number;
  rejects: number;
  // 처음 화면(idle)으로 돌아간 횟수(시간 초과든 사람이 [처음으로]를 눌렀든)
  resets: number;
  warnings: number;
}

const UNDO_TARGETS = ["cancel", "qty_minus", "remove_line", "start_over"];

export function summarize(events: TrialEvent[], goal = "review"): TrialSummary {
  let i = events.length - 1;
  while (i >= 0 && events[i].kind !== "start") i--;
  const start = i >= 0 ? events[i] : null;
  const s: TrialSummary = { msToReview: null, humanTaps: 0, kiboTaps: 0, turns: 0, listens: 0, undos: 0, rejects: 0, resets: 0, warnings: 0 };
  if (!start) return s;
  let screen = start.screen;
  for (const e of events.slice(i + 1)) {
    if (e.kind === "tap" && e.by === "human") s.humanTaps++;
    if (e.kind === "tap" && e.by === "kibo") s.kiboTaps++;
    if (e.kind === "turn") s.turns++;
    if (e.kind === "listen") s.listens++;
    if (e.kind === "tap" && e.by === "human" && UNDO_TARGETS.includes(e.target ?? "")) s.undos++;
    if (e.kind === "result" && e.result === "reject") s.rejects++;
    if (e.kind === "warning") s.warnings++;
    if (e.screen === "idle" && screen !== "idle") s.resets++;
    if (s.msToReview === null && e.screen === goal) s.msToReview = e.t - start.t;
    screen = e.screen;
  }
  return s;
}

// 사용자 시험 과업 카드의 정답(USERTEST.md): 먹고 가기, 더블 치즈버거 세트 라지, 감자튀김, 제로 콜라, 피클 빼기
export interface TrialTask {
  orderType: string;
  cart: TrialCartLine[];
}
export const FASTFOOD_TASK: TrialTask = {
  orderType: "eat_in",
  cart: [{ menuId: "double_cheese", mode: "set", size: "L", side: "fries", drink: "zero_cola", remove: ["pickle"], add: [], qty: 1 }],
};

const FIELDS = ["menuId", "mode", "size", "side", "drink", "remove", "add", "qty"] as const;
const lineKey = (l: TrialCartLine) => [l.menuId, l.mode, l.size, l.side, l.drink, ...[...l.remove].sort().map((x) => `-${x}`), ...[...l.add].sort().map((x) => `+${x}`), `×${l.qty}`].filter(Boolean).join(" ");

// 마지막 [시작] 뒤 주문 확인에 처음 도달했을 때의 장바구니를 과업과 비교한다. 도달은 했지만 틀리면 "오류 완료"
export function judgeTrial(events: TrialEvent[], task: TrialTask): { reached: boolean; correct: boolean; mismatches: string[] } {
  const i = events.findLastIndex((e) => e.kind === "start");
  const cart = events.slice(i + 1).find((e) => e.kind === "cart");
  if (!cart) return { reached: false, correct: false, mismatches: [] };
  const mismatches: string[] = [];
  if (cart.orderType !== task.orderType) mismatches.push(`orderType: ${cart.orderType} (want ${task.orderType})`);
  // 똑같은 줄은 먼저 짝짓고, 남은 줄 수가 같으면 차례대로 항목별로 비교한다(사이드 하나만 틀리면 불일치 1개)
  const got = [...(cart.cart ?? [])];
  const want: TrialCartLine[] = [];
  for (const w of task.cart) {
    const k = got.findIndex((g) => lineKey(g) === lineKey(w));
    if (k >= 0) got.splice(k, 1);
    else want.push(w);
  }
  if (got.length === want.length) {
    const show = (v: unknown) => (Array.isArray(v) ? (v.length ? [...v].sort().join(",") : "none") : String(v));
    want.forEach((w, i) => {
      for (const f of FIELDS) if (show(got[i][f]) !== show(w[f])) mismatches.push(`${f}: ${show(got[i][f])} (want ${show(w[f])})`);
    });
  } else {
    for (const w of want) mismatches.push(`missing: ${lineKey(w)}`);
    for (const g of got) mismatches.push(`extra: ${lineKey(g)}`);
  }
  return { reached: true, correct: mismatches.length === 0, mismatches };
}

// [시작]·[다시 시작]: 앞 기록은 그대로 두고, 참가자·시도 사이를 가르는 start(시도 번호와 시작 시각 t)를 붙인다
export function startSession(events: TrialEvent[], t: number, screen: string, participant: string, condition: string): TrialEvent[] {
  const session = events.filter((e) => e.kind === "start").length + 1;
  return [...events, { t, kind: "start", by: "facilitator", screen, participant, condition, session }];
}

// [기록 저장]: 쌓인 시도 전부와 시도별 요약·판정. room은 넣지 않는다(파일을 받은 사람이 그 키오스크에 말을 걸 수 있다)
export function trialExport(kiosk: string, events: TrialEvent[], task: TrialTask | undefined, now: number) {
  const starts = events.flatMap((e, i) => (e.kind === "start" ? [i] : []));
  const sessions = starts.map((i, n) => {
    const slice = events.slice(i, starts[n + 1] ?? events.length);
    const st = events[i];
    return { session: st.session ?? n + 1, participant: st.participant ?? null, condition: st.condition ?? null, startedAt: new Date(st.t).toISOString(), summary: summarize(slice), judge: task ? judgeTrial(slice, task) : null };
  });
  return { kiosk, exportedAt: new Date(now).toISOString(), sessions, events };
}

// 되돌릴 수 없는 일(기록 지우기)은 두 번 묻는다. 처음에 아니요면 두 번째는 묻지 않는다
export const askTwice = (ask: (message: string) => boolean, first: string, second: string) => ask(first) && ask(second);
