import { describe, expect, it } from "vitest";
import { payStep, payText } from "./pay";

describe("휴대폰 결제 넘기기 안내", () => {
  it("키오스크가 알려 준 실제 버튼 이름(화면 글자 그대로)을 휴대폰 언어 문장에 넣는다. 'KIBO는 결제하지 않는다'는 둘째 줄로 따로 준다", () => {
    expect(payText("vi", "결제하기")).toEqual({ tap: "Hãy tự bấm [결제하기] trên kiosk.", never: "KIBO không bao giờ thanh toán thay bạn." });
    expect(payText("ko", "결제하기")).toEqual({ tap: "키오스크에서 [결제하기]를 직접 눌러 주세요.", never: "KIBO는 결제하지 않아요." });
  });

  it("버튼 이름이 오지 않으면 키오스크 버튼 글자(한국어 화면 '결제하기', 그 밖은 영어 화면 'Pay')를 쓴다", () => {
    expect(payText("ko").tap).toBe("키오스크에서 [결제하기]를 직접 눌러 주세요.");
    expect([payText("en").tap, payText("ja").tap, payText("es").tap]).toEqual(["Tap [Pay] on the kiosk yourself.", "キオスクの［Pay］はご自身で押してください。", "Pulse usted [Pay] en el quiosco."]);
  });

  it("키오스크가 결제 방법 화면이면 '결제 방법을 고르고 카드를 넣어 주세요'로 바꾼다", () => {
    expect(payStep("ko", "payment")).toEqual({ tap: "키오스크에서 결제 방법을 고르고 카드를 넣어 주세요.", never: "KIBO는 결제하지 않아요." });
    expect(payStep("en", "payment").tap).toBe("Choose how to pay on the kiosk and insert your card.");
    expect(payStep("ko", "review", "결제하기")).toEqual(payText("ko", "결제하기"));
    // 키오스크가 자기 화면 언어(kioskLang)를 알려 주면 그 언어의 버튼 글자를 쓴다(영어 키오스크 + 한국어 휴대폰 → [Pay])
    expect(payStep("ko", "review", undefined, "en").tap).toBe("키오스크에서 [Pay]를 직접 눌러 주세요.");
    expect(payStep("en", "review", undefined, "ko").tap).toBe("Tap [결제하기] on the kiosk yourself.");
  });
});
