import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { step, type Target } from "../machine";
import { FastfoodKiosk, type DemoPay } from "./Kiosk";
import { walk } from "./screens.fixture";

const render = (s: Parameters<typeof FastfoodKiosk>[0]["state"], pay: DemoPay = { no: null, onPay: () => {} }) => renderToStaticMarkup(createElement(FastfoodKiosk, { state: s, press: () => {}, pay }));
// 화면에 있는 KIBO 대상(data-target[=data-value])
const pairs = (html: string) =>
  [...html.matchAll(/<[a-z]+ [^>]*data-target="([^"]+)"[^>]*>/g)].map((m) => {
    const v = /data-value="([^"]*)"/.exec(m[0]);
    return v ? `${m[1]}=${v[1]}` : m[1];
  });

// 재디자인 전(29c58ea 이후 sage 넘김 시점) 화면별 대상. 더한 것은 machine이 이미 허용한 start_over(세트 4단계·confirm)뿐이다
const cats = "category=recommended category=burgers category=sides category=drinks category=desserts";
const expected: Record<string, string> = {
  idle: "start language=en",
  order_type: "order_type=eat_in order_type=take_out language=en language=ko start_over",
  menu_recommended: `${cats} item=double_cheese item=spicy_chicken item=bulgogi item=iced_latte item=sundae order_details start_over`,
  menu_burgers: `${cats} item=classic item=double_cheese item=spicy_chicken item=bulgogi item=shrimp item=veggie order_details start_over`,
  set_choice: "set_choice=set set_choice=single cancel start_over",
  set_size: "size=M size=L cancel start_over",
  set_side: "side=fries side=cheese_sticks side=coleslaw side=corn_salad side=nuggets4 cancel start_over",
  set_drink: "drink=cola drink=zero_cola drink=lemon_soda drink=orange_soda drink=iced_tea drink=americano drink=iced_latte drink=milkshake cancel start_over",
  confirm: "customize qty_minus qty_plus cancel add_to_cart start_over",
  customize: "toggle_ingredient=cheese toggle_ingredient=pickle toggle_ingredient=onion toggle_ingredient=lettuce toggle_ingredient=tomato toggle_ingredient=sauce toggle_addon=extra_cheese toggle_addon=bacon toggle_addon=extra_patty customize_done",
  added: "added_ok",
  menu_cart: `${cats} item=classic item=double_cheese item=spicy_chicken item=bulgogi item=shrimp item=veggie order_details start_over`,
  upsell: "upsell_add=sundae upsell_add=apple_pie upsell_no_thanks",
  review: "remove_line=0 add_more pay start_over",
  payment: "start_over",
};

describe("패스트푸드 키오스크 화면", () => {
  it("KIBO가 누르는 대상(target·value)은 화면마다 그대로이고 한 번씩만 있으며, 모두 그 화면에서 누를 수 있다", () => {
    const seen: string[] = [];
    for (const [name, s] of walk()) {
      const got = pairs(render(s));
      expect([...got].sort(), name).toEqual(expected[name].split(" ").sort());
      for (const p of got) {
        const [target, value] = p.split("=") as [Target, string | undefined];
        // 상태 때문에 거절(예: 빈 장바구니의 order_details)될 수는 있어도, 그 화면에 없는 버튼이면 안 된다
        const r = step(s, { by: target === "pay" ? "touch" : "kibo", target, value });
        expect(r.ok ? "" : r.error, `${name} ${p}`).not.toMatch(/^not_on_screen/);
      }
      seen.push(name);
    }
    expect(seen).toEqual(Object.keys(expected));
  });

  it("담은 개수와 금액을 하단 막대·주문 확인·결제 화면에 원화로 보이고, 모의 결제 뒤에는 주문번호와 시연 고지를 보인다", () => {
    const at = Object.fromEntries(walk());
    // 브리지 클래식 라지 세트(감자튀김·제로 콜라, 피클 뺌) = ₩7,100
    expect(render(at.menu_cart)).toMatch(/data-cart-count="1"/);
    expect(render(at.menu_cart)).toContain("₩7,100");
    expect(render(at.review).match(/₩7,100/g)!.length).toBeGreaterThanOrEqual(3);
    expect(render(at.payment)).toContain("₩7,100");
    const paid = render(at.payment, { no: 127, onPay: () => {} });
    expect(paid).toMatch(/data-paid="127"/);
    expect(paid).toContain("시연용이에요. 실제로 결제되지 않았어요.");
  });

  // 사용자 시험 참가자가 찍을 수 있어 보이는 QR은 KIBO 연결 QR(키오스크 바깥 배지) 하나뿐이어야 한다.
  // QR 모양 그림은 모듈 격자를 crispEdges로 그린다. 포인트 적립은 바코드 스캐너 그림으로 보인다
  it("키오스크 화면 어디에도 QR 모양 그림이 없다", () => {
    for (const [name, s] of walk()) expect(render(s), name).not.toMatch(/shape-rendering="crispEdges"/);
  });
});
