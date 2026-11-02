import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { booking, LETTERS, ROWS } from "./booking";
import { initialState, step, type KioskEvent, type KioskState, type Target } from "./machine";
import { plan, type AirportIntent, type PlanResult } from "./planner";

function replayByKibo(start: KioskState, events: KioskEvent[]) {
  let state = start;
  for (const e of events) {
    expect(e.by).toBe("kibo");
    const r = step(state, e);
    if (!r.ok) throw new Error(`${e.target}(${e.value ?? ""}) 실패: ${r.error}`);
    state = r.state;
  }
  return state;
}

const scan = (s: KioskState, who: string) => {
  const r = step(s, { by: "device", target: "scan_passport", value: who });
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

// 사람이 휴대폰에서 확인 버튼을 누르거나 고정 "예" 목록과 맞는 말을 한다
const consent = (s: KioskState, what: string) => {
  const r = step(s, { by: "phone", target: "consent", value: what });
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

const planOk = (start: KioskState, intent: AirportIntent) => {
  const r: PlanResult = plan(start, intent);
  if (r.kind !== "plan") throw new Error(`plan expected, got ${JSON.stringify(r)}`);
  expect(replayByKibo(start, r.events)).toEqual(r.final);
  return r;
};

// "브리지항공으로 엄마랑 둘이 도쿄 가요. 나란히 앉고 싶고, 짐은 하나 부칠게요."
const task: AirportIntent = { airline: "bridge_air", travelers: 2, seats: "together", bags: 1 };

describe("KIBO 화면 경로 계획 — 공항 체크인", () => {
  it("대표 과업: 사람만 할 수 있는 관문 3곳(위험물 동의·여권·체크인 확정)에서 멈추고, 넘기면 이어 가서 나란한 좌석과 짐 1개로 발급까지 간다", () => {
    // 1. 항공사를 고르고 위험물 동의에서 멈춘다. 동의는 본인이 해야 한다
    let r = planOk(initialState(), task);
    expect(r.events.map((e) => e.target)).toEqual(["airline"]);
    expect(r.stop).toEqual({ kind: "ack", what: "dangerous_goods" });

    // 2. 사용자가 휴대폰에서 "네" → 그 증표로 동의를 누르고 여권 리더기 앞에서 멈춘다
    const intent = task;
    r = planOk(consent(r.final, "dangerous_goods"), intent);
    expect(r.events.map((e) => [e.target, e.value])).toEqual([
      ["accept_dangerous_goods", "dangerous_goods#1"],
      ["lookup", "passport"],
    ]);
    expect(r.stop).toEqual({ kind: "device", what: "passport", who: "self" });

    // 3. 본인 여권 → 일행 추가를 누르고 일행 여권을 기다린다
    r = planOk(scan(r.final, "p1"), intent);
    expect(r.events.map((e) => e.target)).toEqual(["add_companion"]);
    expect(r.stop).toEqual({ kind: "device", what: "passport", who: "companion" });

    // 4. 일행 여권 → 좌석맵에서 나란히 두 자리로 옮기고, 확정 전에 멈춘다
    r = planOk(scan(r.final, "p2"), intent);
    expect(r.events.map((e) => [e.target, e.value])).toEqual([
      ["proceed", undefined],
      ["end_add_yes", undefined],
      ["open_seat_map", undefined],
      ["seat", "36H"],
      ["select_passenger", "p2"],
      ["seat", "36K"],
      ["seat_continue", undefined],
    ]);
    expect(r.final.seats).toEqual({ p1: "36H", p2: "36K" });
    expect(r.stop).toEqual({ kind: "ack", what: "confirm_checkin", seats: { p1: "36H", p2: "36K" }, bags: { p1: 1, p2: 0 } });

    // 5. 사용자가 "네" → 확정, 짐 1개, 발급
    r = planOk(consent(r.final, "confirm_checkin"), intent);
    expect(r.events.map((e) => [e.target, e.value])).toEqual([
      ["confirm_checkin", "confirm_checkin#2"],
      ["bags_yes", undefined],
      ["set_bags", "p1:1"],
      ["bags_continue", undefined],
    ]);
    expect(r.final.screen).toBe("printing");
    expect(r.final.bags).toEqual({ p1: 1, p2: 0 });
    expect(r.stop).toBeNull();
  });

  it("필요한 정보가 빠지면 지어내지 않고 한 번에 모아 묻는다", () => {
    expect(plan(initialState(), { seats: "together" })).toEqual({ kind: "clarify", missing: ["airline", "travelers", "bags"] });
  });

  it("좌석이 이미 나란하면 좌석맵을 열지 않고, 좌석 선호를 말하지 않으면 배정된 좌석을 그대로 둔다", () => {
    let s = planOk(consent(planOk(initialState(), task).final, "dangerous_goods"), task).final;
    s = scan(s, "p1");
    const solo = planOk(s, { airline: "bridge_air", travelers: 1, bags: 0 });
    expect(solo.events.map((e) => e.target)).toEqual(["proceed", "end_add_yes"]);
    expect(solo.stop).toEqual({ kind: "ack", what: "confirm_checkin", seats: { p1: "34A" }, bags: { p1: 0 } });
  });
});

describe("속성 테스트", () => {
  const intentArb = fc.record(
    {
      airline: fc.constant("bridge_air"),
      travelers: fc.integer({ min: 1, max: 2 }),
      seats: fc.constantFrom("together" as const, "window" as const, "aisle" as const, "keep" as const),
      bags: fc.integer({ min: 0, max: 3 }),
    },
    { requiredKeys: ["airline", "travelers", "bags"] },
  );

  it("KIBO는 여권 스캔·발급 같은 기기 사건을 만들지 않고, 위험물 동의와 체크인 확정은 본인 확인이 있을 때만 누른다. 「일행 추가 종료」의 「네」는 스캔한 인원이 말한 인원과 같을 때만 누르고, 사람이 더 넣었으면 멈춘다. 관문을 사람이 넘기면 언제나 발급까지 간다", () => {
    fc.assert(
      fc.property(intentArb, fc.boolean(), (intent, extra) => {
        let s = initialState();
        const it: AirportIntent = intent;
        for (let round = 0; round < 10; round++) {
          const r = plan(s, it);
          // 사람이 말한 것보다 한 명 더 스캔했을 때만 계획을 거절할 수 있다
          if (r.kind !== "plan") {
            expect(r).toEqual({ kind: "reject", reason: "more_travelers_scanned" });
            expect(s.scanned.length).toBeGreaterThan(it.travelers!);
            return;
          }
          for (const e of r.events) {
            expect(e.by).toBe("kibo");
            expect(["scan_passport", "print_done"]).not.toContain(e.target);
            if (e.target === "end_add_yes") expect(s.scanned.length).toBe(it.travelers);
            s = replayByKibo(s, [e]);
          }
          if (!r.stop) {
            expect(s.screen).toBe("printing");
            expect(Object.values(s.bags).reduce((a, b) => a + b, 0)).toBe(it.bags);
            if (it.travelers === 2 && it.seats === "together") {
              const [a, b] = s.scanned.map((p) => s.seats[p]);
              expect(a.slice(0, -1)).toBe(b.slice(0, -1));
            }
            return;
          }
          // 사람이 관문을 넘긴다. extra면 혼자 간다고 해 놓고 일행 여권까지 넣는다
          if (r.stop.kind === "device") {
            s = scan(s, s.scanned.length === 0 ? "p1" : "p2");
            if (extra && s.screen === "passengers" && s.scanned.length === 1) {
              const r2 = step(s, { by: "touch", target: "add_companion" });
              if (r2.ok) s = scan(r2.state, "p2");
            }
          } else s = consent(s, r.stop.what);
        }
        throw new Error("10번 안에 끝나지 않았다");
      }),
    );
  });

  // 키오스크가 받아 주는 사건 중에서 하나씩 골라 걷는다(KIBO·기기·휴대폰 동의가 섞인다). 거절될 사건만 고르는 헛걸음을 없애
  // 관문 화면에 실제로 닿게 하고, 닿은 상태마다 금지된 사건을 찔러 본다
  const targets: Target[] = ["airline", "language", "accept_dangerous_goods", "lookup", "add_companion", "cancel_add", "proceed", "end_add_no", "end_add_yes", "open_seat_map", "mileage", "select_passenger", "seat", "scroll_up", "scroll_down", "seat_back", "seat_continue", "confirm_checkin", "bags_none", "bags_yes", "set_bags", "show_allowance", "bags_continue", "excess_ok", "finish", "exit", "exit_yes", "help", "close_popup"];
  const seats = ROWS.flatMap((r) => LETTERS.map((l) => `${r}${l}`));
  // 값을 보지 않는 버튼에 값을 바꿔 가며 넣으면 같은 사건이 수백 번 겹쳐 그 버튼만 고르게 된다. 버튼마다 뜻이 있는 값만 넣는다
  const valuesFor = (target: Target, s: KioskState): (string | undefined)[] =>
    ({
      airline: ["bridge_air", "haneul_sky"],
      lookup: ["passport", "booking_ref"],
      language: ["en", "ko"],
      select_passenger: ["p1", "p2"],
      seat: seats,
      set_bags: ["p1:0", "p1:1", "p1:2", "p2:0", "p2:1"],
      accept_dangerous_goods: [s.consent?.id],
      confirm_checkin: [s.consent?.id],
    })[target as string] ?? [undefined];
  const candidates = (s: KioskState): KioskEvent[] => [
    ...targets.flatMap((target) => valuesFor(target, s).map((value) => ({ by: "kibo" as const, target, value }))),
    ...booking.passengers.map((p) => ({ by: "device" as const, target: "scan_passport" as const, value: p.id })),
    { by: "device", target: "print_done" },
    { by: "phone", target: "consent", value: "dangerous_goods" },
    { by: "phone", target: "consent", value: "confirm_checkin" },
  ];
  const forbidden = (s: KioskState): KioskEvent[] => [
    ...(["accept_dangerous_goods", "confirm_checkin"] as const).flatMap((target) => [undefined, "forged", "dangerous_goods#1", "confirm_checkin#1"].filter((v) => v !== s.consent?.id).map((value) => ({ by: "kibo" as const, target, value }))),
    ...(["kibo", "touch"] as const).flatMap((by) => [{ by, target: "scan_passport" as const, value: "p1" }, { by, target: "print_done" as const }, { by, target: "consent" as const, value: s.screen === "flight_info" ? "confirm_checkin" : "dangerous_goods" }]),
  ];

  it("걷기: 어떤 순서로 가도 KIBO는 증표 없이 동의·확정을 못 하고, 기기 사건과 동의 증표를 못 만든다. 위험물·확정 관문 도달률을 출력한다", () => {
    const reach = { dangerous_goods: 0, flight_info: 0, runs: 0 };
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: 300, maxLength: 400 }), (choices) => {
        let s = initialState();
        const seen = new Set<string>();
        for (const c of choices) {
          seen.add(s.screen);
          for (const e of forbidden(s)) expect(step(s, e).ok, `${e.by}:${e.target}(${e.value}) @${s.screen}`).toBe(false);
          const ok = candidates(s).flatMap((e) => {
            const r = step(s, e);
            return r.ok ? [r.state] : [];
          });
          s = ok[c % ok.length];
        }
        reach.runs++;
        if (seen.has("dangerous_goods")) reach.dangerous_goods++;
        if (seen.has("flight_info")) reach.flight_info++;
      }),
      { numRuns: 60 },
    );
    const rate = { dangerous_goods: reach.dangerous_goods / reach.runs, flight_info: reach.flight_info / reach.runs };
    console.log("공항 걷기 관문 도달률", rate);
    expect(rate.dangerous_goods).toBeGreaterThanOrEqual(0.3);
    expect(rate.flight_info).toBeGreaterThanOrEqual(0.3);
  });
});
