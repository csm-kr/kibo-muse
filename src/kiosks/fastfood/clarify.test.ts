import { describe, expect, it } from "vitest";
import { keywordsFor } from "../keywords";
import { mixedScript } from "../langmix";
import { answerKind, clarifySay, koParticles, orderLead } from "./clarify";
import { initialState } from "./machine";
import { plan, type Missing } from "./planner";

const missing: Missing[] = [{ field: "orderType" }, { field: "size", line: 0 }, { field: "drink", line: 0 }];
const intent = { items: [{ menuId: "double_cheese", mode: "set" as const, side: "fries", qty: 1 }] };

describe("패스트푸드 고정 되묻기 문구", () => {
  it("답 칩은 묻는 순서의 첫 빠진 칸(매장·포장 → 세트·단품 → 사이즈)으로 정하고, 음료만 빠졌으면 없다(고를 것이 많다)", () => {
    expect(answerKind(missing)).toBe("orderType");
    expect(answerKind([{ field: "size", line: 0 }, { field: "mode", line: 0 }])).toBe("mode");
    expect(answerKind([{ field: "drink", line: 0 }])).toBeUndefined();
  });

  it("담을 품목 이름(메뉴 데이터)과 빠진 칸만 묻는다. 품목 이름이 나와 다른 버거로 바꿔 담는 일이 보인다. 빠진 칸이 여럿이면 질문 하나로 묶는다(11/4 판정: 질문 세 개를 늘어놓음)", () => {
    expect(clarifySay(missing, intent, initialState(), "ko")).toBe("더블 치즈버거 세트 담을게요. 매장·포장, 사이즈(M·L), 음료만 알려 주세요.");
    expect(clarifySay(missing, intent, initialState(), "en-US")).toBe("I'll add Double Cheeseburger meal. Please tell me: eat in or take out, size (M or L), drink.");
    // 세트·단품을 아직 모르면 그것만 묻는다. 같은 칸이 여러 줄에 빠져도 한 번만 묻는다. 1개는 수량을 말하지 않는다
    const two = { items: [{ menuId: "bulgogi", qty: 2 }, { menuId: "veggie", qty: 1 }] };
    expect(clarifySay([{ field: "mode", line: 0 }, { field: "mode", line: 1 }], two, initialState(), "ko")).toBe("불고기버거 ×2, 베지 버거 담을게요. 세트로 할까요, 단품으로 할까요?");
  });

  it("고르다 멈춘 상품은 계획기가 합칠 때(같은 메뉴이고 정한 값이 서로 다르지 않을 때)만 빼고, 아니면 따로 말한다", () => {
    // 반례(critic-tech P1): 불고기 세트를 사이즈 화면에서 멈춘 채 「불고기 단품 하나 더」. 계획기는 세트의 사이즈·음료가 빠졌다고 본다
    const state = { ...initialState("ko"), screen: "set_size" as const, orderType: "take_out" as const, draft: { menuId: "bulgogi", mode: "set" as const, size: null, side: null, drink: null, remove: [], add: [], qty: 1 } };
    const single = { items: [{ menuId: "bulgogi", mode: "single" as const, qty: 1 }] };
    const r = plan(state, single);
    expect(r.kind).toBe("clarify");
    if (r.kind !== "clarify") return;
    expect(clarifySay(r.missing, single, state, "ko")).toBe("불고기버거 세트, 불고기버거 단품 담을게요. 사이즈(M·L), 음료만 알려 주세요.");
    // 같은 세트를 다시 적은 것이면 계획기처럼 한 번만 말한다
    const again = { items: [{ menuId: "bulgogi", mode: "set" as const, qty: 1 }] };
    const r2 = plan(state, again);
    if (r2.kind !== "clarify") throw new Error(r2.kind);
    expect(clarifySay(r2.missing, again, state, "ko")).toBe("불고기버거 세트 담을게요. 사이즈(M·L), 음료만 알려 주세요.");
  });

  it("2개 이상 수량은 모든 언어에서 ×N으로 쓰고(영어 복수형·스페인어 'menú' 앞 숫자 문제를 피함), 일본어·중국어는 문장 사이에 공백을 두지 않는다", () => {
    const all: Missing[] = [{ field: "orderType" }, { field: "mode", line: 0 }, { field: "size", line: 0 }, { field: "drink", line: 0 }];
    const two = { items: [{ menuId: "bulgogi", mode: "set" as const, qty: 2 }] };
    expect(clarifySay([{ field: "size", line: 0 }], two, initialState(), "en")).toBe("I'll add Bulgogi Burger meal ×2. Which size, M or L?");
    expect(clarifySay([{ field: "size", line: 0 }], two, initialState(), "es")).toBe("Voy a añadir menú Bulgogi Burger ×2. ¿Qué tamaño, M o L?");
    const one = { items: [{ menuId: "spicy_chicken", qty: 1 }] };
    expect(clarifySay(all, one, initialState(), "zh")).toBe("为您添加 Spicy Chicken Burger。请告诉我：堂食还是外带、套餐还是单点、M还是L、饮料。");
    expect(clarifySay(all, one, initialState(), "ja")).toBe("Spicy Chicken Burgerをカートに入れます。店内かお持ち帰りか、セットか単品か、サイズ（MかL）、お飲み物を教えてください。");
    expect(clarifySay([{ field: "mode", line: 0 }], one, initialState(), "es")).toBe("Voy a añadir Spicy Chicken Burger. ¿En menú o solo?");
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

describe("계획 앞에 말할 알아들은 내용(orderLead)", () => {
  it("이번에 담기는 것(세트 사이즈·사이드·음료, 2개 이상 수량)과 새로 정한 매장·포장을 말하고, 메뉴에 없는 말은 먼저 없다고 한다", () => {
    const s0 = initialState("ko");
    const ask = { orderType: "eat_in" as const, items: [{ menuId: "bulgogi", mode: "set" as const, size: "M" as const, drink: "cola", qty: 1 }, { menuId: "apple_pie", qty: 2 }] };
    const p = plan(s0, ask);
    if (p.kind !== "plan") throw new Error(p.kind);
    expect(orderLead(s0, p.final, "ko", [])).toBe("불고기버거 세트 M(감자튀김·콜라), 애플파이 2개, 매장 식사.");
    expect(orderLead(s0, p.final, "en", [])).toBe("Bulgogi Burger meal M (French Fries, Cola), Apple Pie ×2, eat in.");
    expect(orderLead(s0, p.final, "ko", ["사이다"])).toBe("사이다는 메뉴에 없어요. 불고기버거 세트 M(감자튀김·콜라), 애플파이 2개, 매장 식사.");
    expect(orderLead(s0, p.final, "ko", ["밀크셰이크", "빅맥"])).toBe("밀크셰이크, 빅맥은 메뉴에 없어요. 불고기버거 세트 M(감자튀김·콜라), 애플파이 2개, 매장 식사.");
    // 이미 담긴 줄·이미 정한 매장 식사는 다시 말하지 않는다
    const p2 = plan(p.final, { items: [{ menuId: "apple_pie", qty: 1 }] });
    if (p2.kind !== "plan") throw new Error(p2.kind);
    expect(orderLead(p.final, p2.final, "ko", [])).toBe("애플파이.");
    // 뺀 재료·추가도 말한다(11/4 판정: "피클 빼고"가 되말하기에 없음)
    const custom = plan(s0, { orderType: "take_out", items: [{ menuId: "classic", mode: "single", remove: ["pickle"], addOns: ["bacon"], qty: 1 }] });
    if (custom.kind !== "plan") throw new Error(custom.kind);
    expect(orderLead(s0, custom.final, "ko", [])).toBe("브리지 클래식 피클 빼고 베이컨 추가, 포장.");
    expect(orderLead(s0, custom.final, "en", [])).toBe("Bridge Classic without pickles, with bacon, take out.");
    // 담는 것 없이 주문 확인만(그게 다예요)이면 할 말이 없다
    const p3 = plan(p.final, { checkout: true });
    if (p3.kind !== "plan") throw new Error(p3.kind);
    expect(orderLead(p.final, p3.final, "ko", [])).toBe("");
  });
});

describe("Spark 되묻기의 한국어 조사", () => {
  it("영문 사이즈 글자 뒤 조사를 읽는 소리(엠·엘)에 맞춘다: L으로 → L로, M로 → M으로", () => {
    expect(koParticles("더블 치즈버거 세트 M으로 할까요 L으로 할까요?")).toBe("더블 치즈버거 세트 M으로 할까요 L로 할까요?");
    expect(koParticles("M로 드릴까요, L로 드릴까요?")).toBe("M으로 드릴까요, L로 드릴까요?");
  });
});
