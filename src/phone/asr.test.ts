import { describe, expect, it } from "vitest";
import { cer, repeated, SENTENCES, summarize } from "./asr";

describe("받아쓰기 측정(/asr-test)", () => {
  it("CER: 공백·문장부호(대소문자도)를 빼고 레벤시테인 거리 ÷ 기준 글자 수", () => {
    expect([cer("라지로요", "라지로요."), cer("포장해 주세요", "포장해주세요"), cer("Large, please", "large please")]).toEqual([0, 0, 0]);
    expect(cer("그게 다예요", "그게 다에요")).toBe(0.2);
    expect(cer("네, 맞아요", "네 맞아요 맞아요")).toBe(0.75);
    expect(cer("라지로요", "")).toBe(1);
  });

  it("되풀이: 3글자 이상 덩어리가 바로 이어 반복되고, 기준 문장에는 그런 반복이 없을 때", () => {
    expect(repeated("그게 다예요", "그게 다예요 그게 다예요")).toBe(true);
    expect(repeated("That's all", "That's all. That's all.")).toBe(true);
    expect(repeated("라지로요", "라지로요")).toBe(false);
    expect(repeated("네, 맞아요", "네 네 맞아요")).toBe(false);
  });

  it("문장 20개(ko 1–17, en 18–20)와 갈래별 평균 CER·되풀이 건수", () => {
    expect(SENTENCES.map((s) => s.lang).join(",")).toBe([...Array(17).fill("Korean"), "English", "English", "English"].join(","));
    expect([SENTENCES[0].text, SENTENCES[19].text]).toEqual(["더블 치즈버거 세트 하나 주세요", "That's all"]);
    const row = (a: number, b: number, ra = false) => ({ a: { cer: a, repeated: ra }, b: { cer: b, repeated: false } });
    expect(summarize([row(0, 0.5, true), row(0.5, 0.5)])).toEqual({ n: 2, cerA: 0.25, cerB: 0.5, repeatsA: 1, repeatsB: 0 });
  });
});
