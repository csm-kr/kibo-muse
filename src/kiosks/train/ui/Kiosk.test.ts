import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { initialState, step, type KioskEvent, type KioskState } from "../machine";
import { plan } from "../planner";
import { TrainKiosk } from "./Kiosk";

const html = (s: KioskState) => renderToStaticMarkup(createElement(TrainKiosk, { state: s, press: () => {}, onCard: () => {}, waitCard: false }));
// 값이 없는 버튼은 data-value가 없어야 KIBO 포인터(targetSelector)가 찾는다
const button = (e: KioskEvent) => (e.value === undefined ? new RegExp(`data-target="${e.target}"(?! data-value)`) : new RegExp(`data-target="${e.target}" data-value="${e.value}"`));

describe("기차 발매기 화면", () => {
  it("대표 과업(내일 9시 등대항 고속, 어른 2, 창가 나란히) 계획의 모든 탭과 사람의 결제 탭이 그때 화면에 버튼으로 있다", () => {
    let s = initialState("ko");
    const p = plan(s, { to: "harbor", day: 1, hour: 9, adults: 2, trainType: "express", seats: "window" });
    if (p.kind !== "plan") throw new Error(p.kind);
    const human: KioskEvent[] = [
      { by: "touch", target: "pay" },
      { by: "touch", target: "pay_method", value: "domestic_card" },
    ];
    for (const e of [...p.events, ...human]) {
      expect(html(s), `${s.screen} → ${e.target}:${e.value ?? ""}`).toMatch(button(e));
      const r = step(s, e);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(s.screen).toBe("card_insert");
    expect(html(s)).toContain('data-device="card"');
  });
});
