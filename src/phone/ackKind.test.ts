import { describe, expect, it } from "vitest";
import { ACK_LINES, ackKind } from "./ackKind";

describe("받아쓴 말의 종류(바로 하는 짧은 대답 고르기)", () => {
  it("질문·주문·짧은 대답을 가린다(받아쓰기는 물음표가 없을 수 있다)", () => {
    expect(ackKind("등대항 가는 거 몇 시에 있어요")).toBe("question");
    expect(ackKind("무슨 버거 있어?")).toBe("question");
    expect(ackKind("현금으로 낼 수 있나요")).toBe("question");
    expect(ackKind("더블 치즈버거 세트 하나 주세요")).toBe("request");
    expect(ackKind("내일 오후 3시 등대항 어른 둘")).toBe("request");
    expect(ackKind("네")).toBe("short");
    expect(ackKind("두 명이요")).toBe("short");
    expect(ackKind("How much is a ticket to Harborlight")).toBe("question");
    expect(ackKind("Two adults to Harborlight tomorrow")).toBe("request");
    expect(ackKind("yes please")).toBe("short");
  });

  it("언어마다 종류별로 서로 다른 대답 세 개가 있다('잠시만요' 하나만 되풀이하지 않게)", () => {
    for (const l of ["en", "ko", "ja", "vi", "zh", "es"] as const)
      for (const k of ["question", "request", "short"] as const) expect(new Set(ACK_LINES[l][k]).size).toBe(3);
  });
});
