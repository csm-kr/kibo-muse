import { describe, expect, it } from "vitest";
import { keywordsFor } from "../keywords";
import { mixedScript } from "../langmix";
import { clarifySay } from "./clarify";
import { initialState } from "./machine";
import { plan, type Missing } from "./planner";

const missing: Missing[] = [{ field: "orderType" }, { field: "size", line: 0 }, { field: "drink", line: 0 }];
const intent = { items: [{ menuId: "double_cheese", mode: "set" as const, side: "fries", qty: 1 }] };

describe("패스트푸드 고정 되묻기 문구", () => {
  it("담을 품목 이름(메뉴 데이터)과 빠진 칸만 묻는다. 품목 이름이 나와 다른 버거로 바꿔 담는 일이 보인다", () => {
    expect(clarifySay(missing, intent, initialState(), "ko")).toBe("더블 치즈버거 세트 ×1 담을게요. 매장에서 드시나요, 포장하시나요? 사이즈는 M, L 중 무엇으로 할까요? 음료는 무엇으로 할까요?");
    expect(clarifySay(missing, intent, initialState(), "en-US")).toBe("I'll add Double Cheeseburger meal ×1. Eat in or take out? Which size, M or L? Which drink would you like?");
    // 세트·단품을 아직 모르면 그것만 묻는다. 같은 칸이 여러 줄에 빠져도 한 번만 묻는다
    const two = { items: [{ menuId: "bulgogi", qty: 2 }, { menuId: "veggie", qty: 1 }] };
    expect(clarifySay([{ field: "mode", line: 0 }, { field: "mode", line: 1 }], two, initialState(), "ko")).toBe("불고기버거 ×2, 베지 버거 ×1 담을게요. 세트로 할까요, 단품으로 할까요?");
  });

  it("고르다 멈춘 상품은 계획기가 합칠 때(같은 메뉴이고 정한 값이 서로 다르지 않을 때)만 빼고, 아니면 따로 말한다", () => {
    // 반례(critic-tech P1): 불고기 세트를 사이즈 화면에서 멈춘 채 「불고기 단품 하나 더」. 계획기는 세트의 사이즈·음료가 빠졌다고 본다
    const state = { ...initialState("ko"), screen: "set_size" as const, orderType: "take_out" as const, draft: { menuId: "bulgogi", mode: "set" as const, size: null, side: null, drink: null, remove: [], add: [], qty: 1 } };
    const single = { items: [{ menuId: "bulgogi", mode: "single" as const, qty: 1 }] };
    const r = plan(state, single);
    expect(r.kind).toBe("clarify");
    if (r.kind !== "clarify") return;
    expect(clarifySay(r.missing, single, state, "ko")).toBe("불고기버거 세트 ×1, 불고기버거 단품 ×1 담을게요. 사이즈는 M, L 중 무엇으로 할까요? 음료는 무엇으로 할까요?");
    // 같은 세트를 다시 적은 것이면 계획기처럼 한 번만 말한다
    const again = { items: [{ menuId: "bulgogi", mode: "set" as const, qty: 1 }] };
    const r2 = plan(state, again);
    if (r2.kind !== "clarify") throw new Error(r2.kind);
    expect(clarifySay(r2.missing, again, state, "ko")).toBe("불고기버거 세트 ×1 담을게요. 사이즈는 M, L 중 무엇으로 할까요? 음료는 무엇으로 할까요?");
  });

  it("수량은 모든 언어에서 ×N으로 쓰고(영어 복수형·스페인어 'menú' 앞 숫자 문제를 피함), 일본어·중국어는 문장 사이에 공백을 두지 않는다", () => {
    const all: Missing[] = [{ field: "orderType" }, { field: "mode", line: 0 }, { field: "size", line: 0 }, { field: "drink", line: 0 }];
    const two = { items: [{ menuId: "bulgogi", mode: "set" as const, qty: 2 }] };
    expect(clarifySay([{ field: "size", line: 0 }], two, initialState(), "en")).toBe("I'll add Bulgogi Burger meal ×2. Which size, M or L?");
    expect(clarifySay([{ field: "size", line: 0 }], two, initialState(), "es")).toBe("Voy a añadir menú Bulgogi Burger ×2. ¿Qué tamaño, M o L?");
    const one = { items: [{ menuId: "spicy_chicken", qty: 1 }] };
    expect(clarifySay(all, one, initialState(), "zh")).toBe("为您添加 Spicy Chicken Burger ×1。请问是堂食还是外带？要套餐还是单点？请问要M还是L？请问饮料要哪一种？");
    expect(clarifySay(all, one, initialState(), "ja")).toBe("Spicy Chicken Burger ×1をカートに入れます。店内でお召し上がりですか、お持ち帰りですか？セットにしますか、単品にしますか？サイズはM、Lのどちらにしますか？お飲み物は何にしますか？");
    expect(clarifySay([{ field: "mode", line: 0 }], one, initialState(), "es")).toBe("Voy a añadir Spicy Chicken Burger ×1. ¿En menú o solo?");
  });

  it("6개 언어 모두 그 언어의 문자 체계만 쓴다(문구 자체가 섞임으로 걸리지 않는다)", () => {
    const all: Missing[] = [{ field: "orderType" }, { field: "mode", line: 0 }, { field: "size", line: 0 }, { field: "drink", line: 0 }];
    for (const l of ["en", "ko", "ja", "vi", "zh", "es"]) {
      const say = clarifySay(all, { items: [{ menuId: "spicy_chicken", qty: 1 }] }, initialState(), l);
      expect(say, l).toMatch(/Spicy Chicken Burger|스파이시 치킨버거/);
      expect(mixedScript(say, l, "", keywordsFor("fastfood")), `${l}: ${say}`).toBe(false);
    }
  });
});
