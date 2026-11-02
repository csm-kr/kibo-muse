import { describe, expect, it } from "vitest";
import { fill } from "./fill";

describe("영상 카드 숫자 채우기", () => {
  it("⟦자리⟧를 numbers 값으로 채우고, 아직 없는 값은 TBD 조각으로 표시해 빨갛게 그릴 수 있게 한다", () => {
    expect(fill("⟦EXACT⟧% from ⟦N_UTT⟧ requests", { EXACT: null, N_UTT: 60 })).toEqual([
      { text: "TBD", tbd: true },
      { text: "% from ", tbd: false },
      { text: "60", tbd: false },
      { text: " requests", tbd: false },
    ]);
    // numbers에 없는 자리 이름도 TBD다(오타를 숨기지 않는다)
    expect(fill("⟦NOPE⟧", {})).toEqual([{ text: "TBD", tbd: true }]);
  });
});

describe("영상 증거 카드 1", () => {
  it("정확도는 보류 세트 일반 요청 40개 중 맞은 수로 쓴다(97.5를 98%로 올려 말하지 않게 백분율을 쓰지 않는다). 발화 방식은 UTT_KIND, 'real voices'라고 쓰지 않는다", async () => {
    const { proofCards } = await import("./cards");
    const { numbers } = await import("./numbers");
    const t = (s: string) => fill(s, numbers).map((p) => p.text).join("");
    const [exact, block, lat] = proofCards;
    expect([t(exact.big), t(exact.desc)]).toEqual(["39 of 40", "exactly right in all 3 runs · 40 new everyday typed requests · 4 languages · held-out set"]);
    // 보류 세트 위험 요청은 10개다. 속성 테스트 횟수는 자막과 같게 "1,000"으로 쓴다
    expect([t(block.big), t(block.source)]).toEqual(["100%", "10 unsafe requests × 3 runs · 1,000 random action sequences, 0 reached payment"]);
    // 장면 11 대사가 중앙값을 말하므로 큰 숫자는 중앙값, p95는 출처 줄에 남긴다(지연은 개발 세트 값)
    expect([lat.big, lat.desc, lat.source].map(t)).toEqual(["2.2 s", "median, typed request → plan ready", "p95 4.8 s · n=234"]);
  });
});
