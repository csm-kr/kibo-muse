import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { initialState, step, type KioskEvent, type KioskState } from "./machine";
import { guardAcks, mergeIntent, plan, type PlanResult, type TrainIntent } from "./planner";
import { isSold, parseSeatId, stations, trains } from "./rail";

function replayByKibo(start: KioskState, events: KioskEvent[]) {
  let state = start;
  const screens = [state.screen];
  for (const e of events) {
    expect(e.by).toBe("kibo");
    const r = step(state, e);
    if (!r.ok) throw new Error(`${e.target}(${e.value ?? ""}) 실패: ${r.error}`);
    state = r.state;
    if (screens[screens.length - 1] !== state.screen) screens.push(state.screen);
  }
  return { state, screens };
}

const planOk = (start: KioskState, intent: TrainIntent) => {
  const r: PlanResult = plan(start, intent);
  if (r.kind !== "plan") throw new Error(`plan expected, got ${JSON.stringify(r)}`);
  expect(replayByKibo(start, r.events).state).toEqual(r.final);
  return r;
};

// "내일 아침 9시쯤 브리지중앙에서 등대항 가는 고속열차, 어른 2명, 창가 쪽 나란히"
const task: TrainIntent = { from: "central", to: "harbor", day: 1, hour: 9, adults: 2, trainType: "express", seats: "window" };

describe("KIBO 화면 경로 계획 — 기차 발매기", () => {
  it("대표 과업: 사람이 20번 누를 화면을 KIBO가 넘기고, 9시 열차의 같은 줄 창가·통로 두 자리를 골라 예약 확인에서 멈춘다. 결제는 사람에게 넘긴다", () => {
    const r = planOk(initialState(), task);
    const { screens } = replayByKibo(initialState(), r.events);
    expect(screens).toEqual(["idle", "journey", "station", "journey", "datetime", "journey", "passengers", "journey", "train_list", "train_info", "seat_select", "train_info", "reservation"]);
    expect(r.events).toHaveLength(18);
    expect(r.final.reservation).toEqual({ trainNo: 113, cls: "general", seats: ["7-1A", "7-1B"], total: 105600 });
    expect(r.stop).toEqual({ kind: "human", what: "pay", reservation: r.final.reservation });
  });

  it("필요한 정보가 빠지면 지어내지 않고 한 번에 모아 묻는다", () => {
    expect(plan(initialState(), { seats: "window" })).toEqual({ kind: "clarify", missing: ["to", "date", "passengers"] });
    // 세 권종이 모두 0이면 인원을 말한 것이 아니다
    expect(plan(initialState(), { to: "harbor", adults: 0, children: 0, seniors: 0 })).toEqual({ kind: "clarify", missing: ["date", "passengers"] });
  });

  it("원하는 시각보다 1시간 넘게 늦은 열차만 맞으면, 그 열차로 할지 사람에게 묻고 멈춘다. 받아들이면 이어 간다. 동의는 그 열차·그날에만 묶인다", () => {
    const morning: TrainIntent = { to: "harbor", day: 1, hour: 8, adults: 2, seatClass: "first", trainType: "express", seats: "window" };
    const r = planOk(initialState(), morning);
    expect(r.final.screen).toBe("train_list");
    expect(r.stop).toEqual({ kind: "ack", what: "later_train", trainNo: 117, dep: "10:00" });

    const ok = { trainNo: 117, day: 1 };
    const go = planOk(r.final, mergeIntent(morning, { acceptLaterTrain: ok }));
    expect(go.events[0]).toEqual({ by: "kibo", target: "fare", value: "117:first" });
    expect(go.final.reservation?.trainNo).toBe(117);
    expect(go.stop?.kind).toBe("human");

    // 동의한 뒤 날을 바꾸면 그날의 늦은 열차는 다시 묻는다
    expect(planOk(r.final, mergeIntent(morning, { acceptLaterTrain: ok, day: 2 })).stop).toEqual({ kind: "ack", what: "later_train", trainNo: 117, dep: "10:00" });
  });

  it("어른·경로 없이 어린이만 남으면 어린이만 타는 표인지 되묻고, 어린이만이라고 확인하면 예약한다", () => {
    const kidOnly: TrainIntent = { to: "harbor", day: 1, hour: 9, adults: 0, children: 1 };
    expect(plan(initialState(), kidOnly)).toEqual({ kind: "clarify", missing: ["child_only"] });
    expect(planOk(initialState(), { ...kidOnly, childrenOnly: true }).final.reservation?.seats).toHaveLength(1);
  });

  it("분까지 말하면(9시 반 이후) 그 시각 이후 열차를 고른다", () => {
    expect(planOk(initialState(), { to: "harbor", day: 1, hour: 9, minute: 30, adults: 1 }).final.reservation?.trainNo).toBe(115);
  });

  it("늦은 열차 동의는 키오스크가 바로 그 확인을 기다릴 때 한 말만 받아들인다", () => {
    const ok = { trainNo: 117, day: 1 };
    expect(guardAcks({ adults: 2, acceptLaterTrain: ok }, null)).toEqual({ adults: 2 });
    expect(guardAcks({ acceptLaterTrain: ok }, { kind: "ack", what: "later_train", trainNo: 117, dep: "10:00" })).toEqual({ acceptLaterTrain: ok });
  });
});

describe("예약 뒤 바꾸기", () => {
  it("예약 화면에서 좌석 배치(창가→통로)나 등급만 바꿔 달라고 해도 결제 전 예약을 취소하고 다시 고른다(11/4: '창가 말고 통로로'에 누를 것이 없었다)", () => {
    const base: TrainIntent = { to: "harbor", day: 1, hour: 9, adults: 1, seats: "window" };
    const first = plan(initialState("ko"), base);
    if (first.kind !== "plan") throw new Error(first.kind);
    const aisle = plan(first.final, { ...base, seats: "aisle" });
    expect(aisle.kind).toBe("plan");
    if (aisle.kind !== "plan") return;
    expect(aisle.events[0]).toMatchObject({ by: "kibo", target: "cancel_reservation" });
    expect(aisle.final.screen).toBe("reservation");
    // 통로 자리는 B·C
    expect(["B", "C"]).toContain(aisle.final.reservation!.seats[0].slice(-1));
    const firstClass = plan(first.final, { ...base, seatClass: "first" });
    if (firstClass.kind !== "plan") throw new Error(firstClass.kind);
    expect(firstClass.final.reservation!.cls).toBe("first");
    // 같은 요청을 다시 하면 누를 것이 없다(취소하지 않는다)
    const same = plan(first.final, base);
    expect(same.kind === "plan" && same.events.length).toBe(0);
  });
});

describe("속성 테스트", () => {
  const intentArb = fc
    .record({
      to: fc.constantFrom(...stations.map((s) => s.id).filter((id) => id !== "central")),
      day: fc.integer({ min: 1, max: 6 }),
      hour: fc.integer({ min: 5, max: 22 }),
      adults: fc.integer({ min: 0, max: 3 }),
      children: fc.integer({ min: 0, max: 1 }),
      seniors: fc.integer({ min: 0, max: 1 }),
      seatClass: fc.constantFrom("general" as const, "first" as const),
      seats: fc.constantFrom("window" as const, "aisle" as const, "together" as const, "auto" as const),
      trainType: fc.constantFrom("express" as const, "local" as const, "any" as const),
    })
    .filter((i) => i.adults + i.children + i.seniors > 0);

  it("KIBO는 결제·결제 수단·기기 사건을 만들지 않고, 계획은 언제나 실행되며, 예약은 인원만큼의 팔리지 않은 서로 다른 좌석이다. 2–4명은 좌석을 말하지 않아도 같은 호차 같은 줄이고, 그럴 수 없으면 알림을 남긴다", () => {
    fc.assert(
      fc.property(intentArb, (intent) => {
        let s = initialState();
        let it: TrainIntent = { ...intent, childrenOnly: true };
        for (let round = 0; round < 3; round++) {
          const r = plan(s, it);
          if (r.kind === "reject") {
            expect(["no_trains_available"]).toContain(r.reason);
            return;
          }
          expect(r.kind).toBe("plan");
          if (r.kind !== "plan") return;
          for (const e of r.events) expect(["pay", "pay_method", "card_inserted", "print_done"]).not.toContain(e.target);
          s = replayByKibo(s, r.events).state;
          if (r.stop?.kind === "ack") {
            it = mergeIntent(it, { acceptLaterTrain: { trainNo: r.stop.trainNo, day: intent.day } });
            continue;
          }
          expect(s.screen).toBe("reservation");
          const res = s.reservation!;
          const n = intent.adults + intent.children + intent.seniors;
          expect(new Set(res.seats).size).toBe(n);
          const t = trains.find((x) => x.no === res.trainNo)!;
          for (const seat of res.seats) expect(isSold(t, s.day, seat)).toBe(false);
          const rows = new Set(res.seats.map((x) => `${parseSeatId(x).car}-${parseSeatId(x).row}`));
          if (n >= 2 && rows.size > 1) expect(r.notes).toContain("no_matching_seats");
          if (n >= 2 && n <= 3 && intent.seatClass === "general") expect(rows.size).toBe(1);
          return;
        }
        throw new Error("3번 안에 끝나지 않았다");
      }),
    );
  });
});
