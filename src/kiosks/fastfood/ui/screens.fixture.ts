// 테스트용: 사람 터치만으로 13개 화면 상태를 차례로 만든다(kioskcap.mjs와 같은 경로)
import { initialState, step, type KioskState, type Target } from "../machine";

export function walk(lang: "en" | "ko" = "ko") {
  const out: [string, KioskState][] = [];
  let s = initialState(lang);
  const go = (target: Target, value?: string) => {
    const r = step(s, { by: "touch", target, value });
    if (!r.ok) throw new Error(`${target} ${value ?? ""}: ${r.error}`);
    s = r.state;
  };
  const shot = (name: string) => out.push([name, s]);
  shot("idle");
  go("start"); shot("order_type");
  go("order_type", "eat_in"); shot("menu_recommended");
  go("category", "burgers"); shot("menu_burgers");
  go("item", "classic"); shot("set_choice");
  go("set_choice", "set"); shot("set_size");
  go("size", "L"); shot("set_side");
  go("side", "fries"); shot("set_drink");
  go("drink", "zero_cola"); shot("confirm");
  go("customize"); go("toggle_ingredient", "pickle"); shot("customize");
  go("customize_done"); go("add_to_cart"); shot("added");
  go("added_ok"); shot("menu_cart");
  go("order_details"); shot("upsell");
  go("upsell_no_thanks"); shot("review");
  go("pay"); shot("payment");
  return out;
}
