import { describe, expect, it } from "vitest";
import { intentChips, screenLabel } from "./labels";

describe("해석 결과 칩", () => {
  it("Spark가 알아들은 것을 짧은 칩으로 보이고('그게 다예요' 같은 채움 칩은 빼고), 주문 확인까지 가면 결제는 사람이 한다는 빨간 칩을 붙인다", () => {
    const chips = intentChips(
      { orderType: "eat_in", items: [{ menuId: "double_cheese", mode: "set", size: "L", drink: "zero_cola", remove: ["pickle"], addOns: [], qty: 1 }], checkout: true },
      "review",
    );
    expect(chips).toEqual([
      { text: "Eat in", tone: "normal" },
      { text: "Double Cheeseburger · L set", tone: "normal" },
      { text: "Zero Cola", tone: "normal" },
      { text: "No Pickles", tone: "normal" },
      { text: "Pay → blocked. You tap Pay", tone: "blocked" },
    ]);
    expect(intentChips({ current: { size: "L", drink: "cola" } }, "menu")).toEqual([
      { text: "L", tone: "normal" },
      { text: "Cola", tone: "normal" },
    ]);
  });

  it("휴대폰 상태 줄의 단계 이름은 휴대폰의 6개 언어 모두로 있다", () => {
    for (const labels of Object.values(screenLabel)) expect(Object.keys(labels).sort()).toEqual(["en", "es", "ja", "ko", "vi", "zh"]);
    expect(screenLabel.set_drink.vi).toBe("Chọn đồ uống");
  });
});
