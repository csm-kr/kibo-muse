import { describe, expect, it } from "vitest";
import { initialState } from "./machine";
import { interpret } from "./interpret";

describe("Spark 해석 어댑터 — 기차 승차권", () => {
  it("역을 enum으로 묶은 스키마로 요청하고, 말하지 않은 값(-1·none)은 뺀다. 인원은 말한 그대로(9명 넘어도) 넣고, 세 권종이 모두 0이면 말하지 않은 것으로 본다. 분은 시와 함께 받는다. 늦은 열차 동의는 스키마에 없다. 오늘 날짜·발매기 시각과 기다리는 관문을 함께 보낸다", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 요청 본문을 깊게 들여다보는 테스트
    let sent: Record<string, any> | undefined;
    let raw: Record<string, unknown> = { from: "none", to: "harbor", day: 1, hour: 9, minute: 30, adults: 12, children: -1, seniors: -1, seatClass: "none", trainType: "express", seats: "window", unknownFrom: "", unknownTo: "", unsupported: "none", exit: false, replyLanguage: "ko", say: "내일 9시 반 등대항 고속열차, 어른 12명이요." };
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      const content = JSON.stringify(raw);
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    };
    const r = await interpret("내일 아침 9시 등대항 가는 고속열차, 어른 12명, 창가로", initialState(), { kind: "ack", what: "later_train", trainNo: 103, dep: "10:30" }, { children: 0 }, { apiKey: "test", fetch: fakeFetch }, new Date(2026, 10, 3, 13));

    const schema = sent!.response_format.json_schema.schema;
    expect(Object.keys(schema.properties)).not.toContain("acceptLaterTrain");
    expect(schema.properties.to.enum).toContain("harbor");
    expect(schema.properties.unsupported.enum).toEqual(["none", "round_trip", "refund_or_change", "other_discount"]);
    expect(schema.required).toEqual(expect.arrayContaining(["minute", "unknownFrom", "unknownTo"]));
    expect(sent!.messages[1].content).toContain("Today is Tuesday 2026-11-03");
    expect(sent!.messages[1].content).toContain("Machine clock: 13:00 (today = day 0)");
    expect(sent!.messages[1].content).toContain("waiting for: confirmation to take the later train 103 at 10:30");
    expect(sent!.messages[1].content).toContain("Already known from earlier (do not ask again): children=0");
    // 11/5 실제 음성: "할머니랑 저 둘이"가 어떤 때는 어른 2명이 됐다
    expect(sent!.messages[0].content).toContain('A grandparent (할머니, 할아버지, grandma, grandpa) counts as a senior');
    expect(r.intent).toEqual({ to: "harbor", day: 1, hour: 9, minute: 30, adults: 12, trainType: "express", seats: "window" });
    expect([r.unsupported, r.unknownFrom, r.unknownTo, r.exit, r.replyLanguage]).toEqual(["none", "", "", false, "ko"]);

    // "등대항 가는 표 주세요": Spark가 말하지 않은 인원을 0으로 낸다. 앞에서 말한 인원을 지우지 않게 뺀다
    raw = { ...raw, day: -1, hour: -1, minute: -1, adults: 0, children: 0, seniors: 0 };
    expect((await interpret("등대항 가는 표 주세요.", initialState(), null, {}, { apiKey: "test", fetch: fakeFetch })).intent).toEqual({ to: "harbor", trainType: "express", seats: "window" });
  });
});
