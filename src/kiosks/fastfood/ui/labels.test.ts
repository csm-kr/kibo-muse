import { describe, expect, it } from "vitest";
import { intentChips, lineName, orderLines, screenLabel, statusSummary } from "./labels";

describe("해석 결과 칩", () => {
  it("Spark가 알아들은 것을 짧은 칩으로 보이고('그게 다예요' 같은 채움 칩은 빼고), 주문 확인까지 가면 결제는 사람이 한다는 빨간 칩을 붙인다", () => {
    const chips = intentChips(
      { orderType: "eat_in", items: [{ menuId: "double_cheese", mode: "set", size: "L", drink: "zero_cola", remove: ["pickle"], addOns: [], qty: 1 }], checkout: true },
      "review",
      "en",
    );
    expect(chips).toEqual([
      { text: "Eat in", tone: "normal" },
      { text: "Double Cheeseburger · L set", tone: "normal" },
      { text: "Zero Cola", tone: "normal" },
      { text: "No Pickles", tone: "normal" },
      { text: "Pay → blocked. You tap Pay", tone: "blocked" },
    ]);
    // 버튼 이름만 키오스크 화면 글자로(한국어 키오스크의 결제 버튼은 '결제하기'). 칩의 나머지는 영어 그대로
    expect(intentChips({ checkout: true }, "review", "ko").at(-1)).toEqual({ text: "결제하기 → blocked. You tap 결제하기", tone: "blocked" });
    expect(intentChips({ current: { size: "L", drink: "cola" } }, "menu", "en")).toEqual([
      { text: "L", tone: "normal" },
      { text: "Cola", tone: "normal" },
    ]);
  });

  it("휴대폰 상태 줄의 단계 이름은 휴대폰의 6개 언어 모두로 있다", () => {
    for (const labels of Object.values(screenLabel)) expect(Object.keys(labels).sort()).toEqual(["en", "es", "ja", "ko", "vi", "zh"]);
    expect(screenLabel.set_drink.vi).toBe("Chọn đồ uống");
  });

  it("휴대폰 상태 줄의 요약(품목 수·합계)은 휴대폰 언어로 쓰고, 영어 'item(s)'를 섞지 않는다", () => {
    expect(statusSummary(1, 8300, "ko")).toBe("1개 · ₩8,300");
    expect(statusSummary(0, 0, "Korean")).toBe("0개 · ₩0");
    expect(statusSummary(2, 12600, "ja")).toBe("2点 · ₩12,600");
    expect(statusSummary(1, 8300, "vi")).toBe("1 món · ₩8,300");
    expect(statusSummary(1, 8300, "en")).toBe("1 item(s) · ₩8,300");
    for (const l of ["ko", "ja", "vi", "zh", "es"]) expect(statusSummary(3, 1000, l)).not.toMatch(/item/);
  });

  it("휴대폰에 품목 이름을 키오스크 화면 글자 그대로 보인다(상태 줄 앞머리, 주문 확인 카드의 품목 줄)", () => {
    const line = { menuId: "double_cheese", mode: "set" as const, size: "L" as const, side: "fries", drink: "zero_cola", remove: ["pickle"], add: ["bacon"], qty: 2, unitPrice: 8300 };
    expect(lineName(line, "ko")).toBe("더블 치즈버거 L 세트");
    expect(lineName({ ...line, size: null }, "ko")).toBe("더블 치즈버거 세트");
    expect(lineName({ ...line, mode: "single", size: null }, "en")).toBe("Double Cheeseburger");
    expect(orderLines([line], "ko")).toEqual([{ name: "더블 치즈버거 L 세트", detail: "감자튀김 · 제로 콜라 · − 피클 · + 베이컨 추가", qty: 2 }]);
    expect(orderLines([{ ...line, mode: "single", size: null, side: null, drink: null, remove: [], add: [], qty: 1 }], "en")).toEqual([{ name: "Double Cheeseburger", detail: "", qty: 1 }]);
    expect(statusSummary(2, 16600, "ko", "더블 치즈버거 L 세트")).toBe("더블 치즈버거 L 세트 · 2개 · ₩16,600");
  });
});
