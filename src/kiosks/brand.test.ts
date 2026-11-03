// 공항·기차 키오스크는 자기 브랜드 색만 쓴다(KIBO 청록·주황은 KIBO 띠와 포인터에만). 팝업 대화상자는 화면 낭독기가 읽을 이름이 있다
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as A from "./airport/machine";
import { booking } from "./airport/booking";
import { AirportKiosk } from "./airport/ui/Kiosk";
import * as T from "./train/machine";
import { TrainKiosk } from "./train/ui/Kiosk";

type Ev = { by: string; target: string; value?: string };
const KIBO_COLOR = /\b(?:bg|text|border|ring|from|to)-(?:teal|orange)-/;

// 화면의 버튼과 장치 이벤트로 상태를 넓이 우선으로 밟으며 화면마다 검사한다(화면당 perScreen개까지)
function walk<S extends { screen: string; popup: string | null }>(starts: S[], render: (s: S) => string, step: (s: S, e: Ev) => { ok: boolean; state?: S }, devices: Ev[], perScreen = 40) {
  const seen = new Set<string>();
  const per: Record<string, number> = {};
  const popups = new Set<string>();
  const q = [...starts];
  while (q.length) {
    const s = q.shift()!;
    const k = JSON.stringify(s);
    if (seen.has(k) || (per[s.screen] ?? 0) >= perScreen) continue;
    seen.add(k);
    per[s.screen] = (per[s.screen] ?? 0) + 1;
    const html = render(s);
    const where = `${s.screen}|${s.popup ?? ""}`;
    expect(html, where).not.toMatch(KIBO_COLOR);
    expect(html.split('role="dialog"').length, where).toBe(html.split(/role="dialog" aria-modal="true" aria-label="[^"]+"/).length);
    if (s.popup) popups.add(s.popup);
    const evs: Ev[] = [...html.matchAll(/data-target="([^"]+)"(?: data-value="([^"]*)")?/g)].map((m) => (m[2] === undefined ? { by: "touch", target: m[1] } : { by: "touch", target: m[1], value: m[2] }));
    for (const e of [...evs, ...devices]) {
      const r = step(s, e);
      if (r.ok && r.state) q.push(r.state);
    }
  }
  return popups;
}

describe("키오스크 브랜드", () => {
  it("공항: 모든 화면에 KIBO 청록·주황이 없고, 팝업 8종 모두 이름이 있다", () => {
    const popups = walk(
      [A.initialState("en")],
      (s) => renderToStaticMarkup(createElement(AirportKiosk, { state: s, press: () => {}, onDevice: () => {}, waitPassport: false })),
      (s, e) => A.step(s, e as A.KioskEvent) as never,
      [...booking.passengers.map((p) => ({ by: "device", target: "scan_passport", value: p.id })), { by: "device", target: "print_done" }],
    );
    expect([...popups].sort()).toEqual(["allowance", "end_adding", "excess", "exit_confirm", "exit_row", "help", "mileage", "paid_seat"]);
  });

  it("기차: 모든 화면에 KIBO 청록·주황이 없고, 팝업 2종과 역·열차 정보 창 모두 이름이 있다", () => {
    const popups = walk<T.KioskState>(
      // 좌석 부족 팝업은 여러 명이 거의 찬 칸을 고를 때만 떠서 넓이 우선 탐색 상한 안에 닿지 않는다. 그 팝업을 띄운 상태도 함께 본다
      [T.initialState("en"), { ...T.initialState("en"), popup: "not_enough_seats" }],
      (s) => renderToStaticMarkup(createElement(TrainKiosk, { state: s, press: () => {}, onCard: () => {}, waitCard: false })),
      (s, e) => T.step(s, e as T.KioskEvent) as never,
      [
        { by: "device", target: "card_inserted" },
        { by: "device", target: "print_done" },
      ],
    );
    expect([...popups].sort()).toEqual(["not_enough_seats", "operator"]);
  });
});
