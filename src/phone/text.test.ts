import { describe, expect, it } from "vitest";
import { failLine, phoneText } from "./text";

describe("실패했을 때 휴대폰이 보이고 읽는 한 줄", () => {
  it("인터넷이 끊겼으면 무엇이 실패했든 연결부터 알리고, 아니면 받은 문구를 그대로 쓴다", () => {
    const tx = phoneText("vi");
    expect(failLine(tx, false, "Tôi chưa nghe rõ. Xin hãy nói lại.")).toBe(tx.offline);
    expect(failLine(tx, true, "Tôi chưa nghe rõ. Xin hãy nói lại.")).toBe("Tôi chưa nghe rõ. Xin hãy nói lại.");
    expect(failLine(tx, true, tx.noAnswer)).toMatch(/kiosk/i);
  });
});
