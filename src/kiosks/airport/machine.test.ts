import { describe, expect, it } from "vitest";
import { initialState, step, type KioskEvent, type KioskState } from "./machine";

const tap = (target: KioskEvent["target"], value?: string): KioskEvent => (value === undefined ? { by: "touch", target } : { by: "touch", target, value });
// 여권을 리더기에 넣는 것처럼 기기가 알려 오는 사건
const device = (target: KioskEvent["target"], value?: string): KioskEvent => (value === undefined ? { by: "device", target } : { by: "device", target, value });

function replay(events: KioskEvent[], start: KioskState = initialState()) {
  let state = start;
  const screens = [state.screen];
  for (const e of events) {
    const r = step(state, e);
    if (!r.ok) throw new Error(`${e.target}(${e.value ?? ""}) 실패: ${r.error}`);
    state = r.state;
    if (screens[screens.length - 1] !== state.screen) screens.push(state.screen);
  }
  return { state, screens };
}

// 대표 과업: 어머니와 2명, 나란히, 짐 1개 (명세 5-2의 터치 경로)
const touchTask: KioskEvent[] = [
  tap("airline", "bridge_air"),
  tap("accept_dangerous_goods"),
  tap("lookup", "passport"),
  device("scan_passport", "p1"),
  tap("add_companion"),
  device("scan_passport", "p2"),
  tap("proceed"),
  tap("end_add_yes"),
  tap("open_seat_map"),
  tap("seat", "36H"),
  tap("select_passenger", "p2"),
  tap("seat", "36K"),
  tap("seat_continue"),
  tap("confirm_checkin"),
  tap("bags_yes"),
  tap("set_bags", "p1:1"),
  tap("bags_continue"),
  device("print_done"),
];

describe("공항 체크인 키오스크 — 실제 화면 흐름", () => {
  it("터치로 대표 과업을 하면 화면 14개를 거쳐 완료되고(조회 방법 선택 포함), 탭 16회·여권 스캔 2회가 든다", () => {
    const { state, screens } = replay([...touchTask, tap("finish")]);
    expect(screens).toEqual([
      "idle",
      "dangerous_goods",
      "lookup",
      "passport",
      "passengers",
      "add_passenger",
      "passengers",
      "flight_info",
      "seat_map",
      "flight_info",
      "bags_question",
      "bag_count",
      "printing",
      "complete",
      "idle",
    ]);
    expect(touchTask.filter((e) => e.by === "touch").length + 1).toBe(16);
    expect(touchTask.filter((e) => e.target === "scan_passport").length).toBe(2);
    expect(state).toEqual(initialState());

    const done = replay(touchTask).state;
    expect(done.screen).toBe("complete");
    expect(done.seats).toEqual({ p1: "36H", p2: "36K" });
    expect(done.bags).toEqual({ p1: 1, p2: 0 });
    expect(done.checkedIn).toBe(true);
  });

  it("여권 스캔과 발급 완료는 기기만 알릴 수 있다. KIBO나 화면 터치로는 할 수 없다", () => {
    const atPassport = replay(touchTask.slice(0, 3)).state;
    expect(step(atPassport, { by: "kibo", target: "scan_passport", value: "p1" })).toEqual({ ok: false, error: "device_only" });
    expect(step(atPassport, { by: "touch", target: "scan_passport", value: "p1" })).toEqual({ ok: false, error: "device_only" });
    expect(step(atPassport, { by: "device", target: "proceed" })).toEqual({ ok: false, error: "not_a_device_event" });
  });

  it("위험물 동의·체크인 확정: KIBO는 휴대폰에서 온 동의 증표가 있어야 누를 수 있다. 증표는 휴대폰만 그 관문 화면에서 만들고, 화면이 바뀌면 사라진다", () => {
    const kibo = (target: KioskEvent["target"], value?: string): KioskEvent => (value === undefined ? { by: "kibo", target } : { by: "kibo", target, value });
    const phone = (value: string): KioskEvent => ({ by: "phone", target: "consent", value });
    const atDg = replay(touchTask.slice(0, 1)).state;
    expect(step(atDg, kibo("accept_dangerous_goods"))).toEqual({ ok: false, error: "consent_required" });
    expect(step(atDg, kibo("consent", "dangerous_goods"))).toEqual({ ok: false, error: "phone_only" });
    expect(step(atDg, tap("consent", "dangerous_goods"))).toEqual({ ok: false, error: "phone_only" });
    expect(step(atDg, { by: "phone", target: "accept_dangerous_goods" })).toEqual({ ok: false, error: "not_a_phone_event" });
    expect(step(atDg, phone("confirm_checkin"))).toEqual({ ok: false, error: "bad_consent" });
    const agreed = replay([phone("dangerous_goods")], atDg).state;
    expect(step(agreed, kibo("accept_dangerous_goods", "forged"))).toEqual({ ok: false, error: "consent_required" });
    expect(replay([kibo("accept_dangerous_goods", agreed.consent!.id)], agreed).state).toMatchObject({ screen: "lookup", consent: null });

    const atInfo = replay(touchTask.slice(0, 8)).state;
    expect(atInfo.screen).toBe("flight_info");
    const confirmed = replay([phone("confirm_checkin")], atInfo).state;
    // 동의한 뒤 좌석맵을 열었다 오면 좌석이 바뀌었을 수 있으니 증표는 사라진다
    const back = replay([tap("open_seat_map"), tap("seat_back")], confirmed).state;
    expect(back.consent).toBeNull();
    expect(step(back, kibo("confirm_checkin", confirmed.consent!.id))).toEqual({ ok: false, error: "consent_required" });
    expect(replay([kibo("confirm_checkin", confirmed.consent!.id)], confirmed).state.screen).toBe("bags_question");
    // 증표는 종류에 묶인다: 위험물 동의 증표로는 체크인을 확정할 수 없다
    const dgToken = { ...atInfo, consent: { what: "dangerous_goods" as const, id: "dangerous_goods#9" } };
    expect(step(dgToken, kibo("confirm_checkin", "dangerous_goods#9"))).toEqual({ ok: false, error: "consent_required" });
    // 사람이 키오스크 화면에서 직접 누르는 것은 그 자체로 동의다
    expect(step(atInfo, tap("confirm_checkin")).ok).toBe(true);
  });

  it("좌석맵: 다른 승객의 좌석은 고를 수 없고, 유료·비상구 좌석은 안내 팝업만 뜨며, 보이지 않는 열은 스크롤해야 누를 수 있다", () => {
    const atMap = replay(touchTask.slice(0, 9)).state;
    expect(atMap.screen).toBe("seat_map");
    expect(atMap.seatSel).toBe("p1");

    expect(step(atMap, tap("seat", "36A"))).toEqual({ ok: false, error: "seat_taken" });

    const paid = replay([tap("seat", "32A")], atMap).state;
    expect(paid.popup).toBe("paid_seat");
    expect(paid.seatDraft).toEqual(atMap.seatDraft);

    // 34A가 보이는 첫 화면은 31–38열이다. 42열은 내려야 보인다
    expect(step(atMap, tap("seat", "42H"))).toEqual({ ok: false, error: "row_not_visible" });
    const scrolled = replay([tap("scroll_down"), tap("seat", "42H")], atMap).state;
    expect(scrolled.seatDraft).toEqual({ p1: "42H", p2: "41G" });

    // 일행 좌석을 누르면 서로 맞바꾼다
    const swapped = replay([tap("scroll_down"), tap("seat", "41G")], atMap).state;
    expect(swapped.seatDraft).toEqual({ p1: "41G", p2: "34A" });

    // 뒤로는 바꾼 것을 버린다
    const back = replay([tap("scroll_down"), tap("seat", "42H"), tap("seat_back")], atMap).state;
    expect(back.screen).toBe("flight_info");
    expect(back.seats).toEqual({ p1: "34A", p2: "41G" });
  });

  it("나가기는 확인 팝업을 거쳐 처음 화면으로 돌아가고, 팝업이 열려 있으면 다른 버튼은 누를 수 없다", () => {
    const at = replay(touchTask.slice(0, 5)).state;
    const asking = replay([tap("exit")], at).state;
    expect(asking.popup).toBe("exit_confirm");
    expect(step(asking, tap("proceed"))).toEqual({ ok: false, error: "popup_open:exit_confirm" });
    expect(replay([tap("close_popup")], asking).state).toEqual(at);
    expect(replay([tap("exit_yes")], asking).state).toEqual(initialState());
  });

  it("허용량을 넘는 짐은 초과 안내 팝업을 거쳐 발급으로 간다", () => {
    const atBags = replay(touchTask.slice(0, 15)).state;
    expect(atBags.screen).toBe("bag_count");
    const over = replay([tap("set_bags", "p1:2"), tap("bags_continue")], atBags).state;
    expect(over.popup).toBe("excess");
    expect(replay([tap("excess_ok")], over).state.screen).toBe("printing");
  });

  it("조회 방법 선택: 여권을 고르면 여권 스캔으로 간다. 이 시연은 여권 조회만 되므로 다른 방법은 안내 띠만 띄우고 화면에 남는다", () => {
    const atLookup = replay(touchTask.slice(0, 2)).state;
    expect(atLookup.screen).toBe("lookup");
    expect(replay([tap("lookup", "booking_ref")], atLookup).state).toMatchObject({ screen: "lookup", banner: "passport_only" });
    expect(step(atLookup, tap("lookup", "boarding_pass"))).toEqual({ ok: false, error: "bad_lookup" });
    expect(replay([tap("lookup", "passport")], atLookup).state).toMatchObject({ screen: "passport", banner: null });
  });

  it("승객 화면에서 다음을 누르면 「일행 추가를 종료하시겠습니까?」가 뜬다. 아니오는 일행 추가로, 네는 좌석·항공편 화면으로 가고, 팝업이 떠 있으면 다른 버튼은 누를 수 없다", () => {
    const asking = replay(touchTask.slice(0, 7)).state;
    expect(asking).toMatchObject({ screen: "passengers", popup: "end_adding" });
    expect(step(asking, tap("add_companion"))).toEqual({ ok: false, error: "popup_open:end_adding" });
    expect(replay([tap("end_add_no")], asking).state).toMatchObject({ screen: "add_passenger", popup: null, addReturn: "passengers" });
    expect(replay([tap("end_add_yes")], asking).state).toMatchObject({ screen: "flight_info", popup: null });
  });
});
