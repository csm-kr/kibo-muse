import { describe, expect, it } from "vitest";
import { payText } from "./pay";

describe("휴대폰 결제 넘기기 안내", () => {
  it("키오스크가 알려 준 실제 버튼 이름(화면 글자 그대로)을 휴대폰 언어 문장에 넣는다. 없으면 그 언어의 일반 이름", () => {
    expect(payText("vi", "결제하기")).toBe("Hãy tự bấm [결제하기] trên kiosk. KIBO không bao giờ thanh toán thay bạn.");
    expect(payText("ko", "결제하기")).toBe("키오스크에서 [결제하기]를 직접 눌러 주세요. KIBO는 결제하지 않아요.");
    expect(payText("en")).toBe("Tap [Pay] on the kiosk yourself. KIBO never pays for you.");
  });
});
