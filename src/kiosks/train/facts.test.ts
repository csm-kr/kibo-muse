import { describe, expect, it } from "vitest";
import { fillStations, misspelledStation, railFacts } from "./facts";
import { legs } from "./rail";

describe("기차 사실(Spark가 질문에 답할 자료)", () => {
  it("역마다 노선·걸리는 시간·요금, 완행 출발 시각, 고속 첫차·막차를 철도 자료에서 만든다(역은 {id})", () => {
    const f = railFacts();
    const ex = legs("central", "harbor").find((l) => l.train.type === "express")!;
    expect(f).toContain(`{harbor} (south line): express ${ex.arr - ex.dep} min, ₩${ex.fare.general!.toLocaleString("en-US")} standard / ₩${ex.fare.first!.toLocaleString("en-US")} first class; local`);
    expect(f).toContain("leaves 07:10, 10:10, 13:10, 16:10, 19:10");
    expect(f).toContain("{willow} (south/west line)");
    expect(f).toContain("first 06:00, last 21:30");
    expect(f).not.toMatch(/등대항|Harborlight/);
  });

  it("{id}를 대답 언어의 정확한 역 이름으로 채운다(한국어는 한국어 이름, 그 밖은 영어 이름). 모르는 {id}가 있으면 null", () => {
    expect(fillStations("{harbor}행은 30분마다 있어요.", "ko")).toBe("등대항행은 30분마다 있어요.");
    expect(fillStations("Trains to {harbor} leave every 30 minutes.", "en")).toBe("Trains to Harborlight leave every 30 minutes.");
    expect(fillStations("{busan}은 없어요.", "ko")).toBeNull();
  });

  it("한국어는 역 이름 받침에 맞게 조사를 고친다(실측 '단풍언덕로'·'등대항로'). Spark가 이름을 바로 쓴 경우도 고친다", () => {
    expect(fillStations("{maple}로 가시는군요. {pinecoast}이에요? {harbor}를 고르셨어요.", "ko")).toBe("단풍언덕으로 가시는군요. 솔바닷가예요? 등대항을 고르셨어요.");
    expect(fillStations("산호만로 2일 뒤, 버들둑와 솔바닷가이나 서풍은 어떠세요?", "ko")).toBe("산호만으로 2일 뒤, 버들둑과 솔바닷가나 서풍은 어떠세요?");
    expect(fillStations("산호만가는 열차, 등대항이요.", "ko")).toBe("산호만가는 열차, 등대항이요.");
  });

  it("화면 용어(고속·완행·특실·일반실)와 결제 수단(현금 없음)을 사실에 넣는다", () => {
    const f = railFacts();
    expect(f).toContain("express = 고속, local = 완행, first class = 특실, standard = 일반실");
    expect(f).toContain("Domestic card, Overseas card, QR pay, Overseas bank card; no cash");
  });

  it("역 이름을 한 글자 틀리게 쓴 문장을 잡는다(실측 '버들둱'). 정확한 이름·노선에 없는 역 이름은 통과한다", () => {
    expect(misspelledStation("버들둱으로 가시는 몇 시 열차로 하시겠어요?")).toBe(true);
    expect(misspelledStation("Trains to Harbourlight leave hourly.")).toBe(true);
    expect(misspelledStation("버들둑으로 가시는 몇 시 열차로 하시겠어요?")).toBe(false);
    expect(misspelledStation("서울은 이 노선에 없어요. 등대항이나 산호만은 어떠세요?")).toBe(false);
  });
});
