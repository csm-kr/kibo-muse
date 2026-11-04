import { describe, expect, it } from "vitest";
import { TAIL_MS } from "./ptt";
import { phoneText } from "./text";

describe("누르고 말하기", () => {
  it("말이 끝나 보낼 때 0.25초 더 녹음해 보낸다", () => {
    expect(TAIL_MS).toBe(250);
  });

  it("마이크 버튼 문구와 안내는 휴대폰 언어로 쓴다(6개 언어 모두, 빈 칸 없이)", () => {
    const ko = phoneText("ko-KR");
    // 한 번 탭하면 계속 듣는다(누른 채 말하기 없음). 처음 화면에 소리 켜기 안내
    expect([ko.hold, ko.tooShort, ko.sending, ko.send]).toEqual(["탭하고 말씀하세요", "너무 짧았어요. 다시 탭하고 말해 주세요", "보내는 중…", "보내기"]);
    expect(ko.soundTip).toBe("KIBO 목소리가 안 들리면 휴대폰 무음 모드를 끄고 소리를 키워 주세요");
    expect(ko.tapping(2, 7)).toBe("KIBO가 누르는 중 · 2/7");
    expect(ko.sound).toBe("대답을 소리로 듣기");
    expect([ko.orderTitle, ko.paying, ko.paid(57)]).toEqual(["주문 확인", "결제 화면이에요. 결제를 마치면 주문이 끝나요", "주문이 끝났어요 ✓ 번호 57"]);
    expect(phoneText("vi").paid(57)).toMatch(/57/);
    expect(ko.retry).toBe("다시 눌러서 말해 주세요");
    // 55초 자동 보냄, 연결 끊김
    expect([ko.tooLong, ko.reconnecting]).toEqual(["55초가 넘어서 여기까지 보냈어요", "다시 연결 중…"]);
    // 탭 모드(짧은 탭·화면 읽기의 두 번 탭)로 시작했을 때 한 번, KIBO가 누르기 시작할 때 한 번, 말풍선의 말한 사람, 대화 칸·언어 단추 이름
    expect([ko.toggleOn, ko.tapStart(14), ko.me, ko.chat, ko.language]).toEqual(["듣고 있어요. 말이 끝나면 저절로 보내요", "KIBO가 14번 누릅니다", "나:", "대화", "언어"]);
    expect([ko.waitLong, ko.kioskReset]).toEqual(["말씀을 이해하는 중이에요 · 보통 5–10초", "키오스크가 처음으로 돌아갔어요. 다시 말씀해 주세요."]);
    expect(phoneText("Japanese").tooShort).toBe("短すぎました。もう一度タップして話してください");
    const keys = Object.keys(phoneText("en")).sort();
    for (const l of ["en", "ko", "ja", "vi", "zh", "es"]) {
      const x = phoneText(l);
      expect(Object.keys(x).sort()).toEqual(keys);
      // 답 칩(answers)은 종류마다 글 목록이라 글로 펴서 본다
      for (const [k, v] of Object.entries(x)) expect(typeof v === "object" ? Object.values(v).flat().join(" ") : typeof v !== "function" ? v : k === "seats" ? (v as (xs: string[]) => string)(["3A"]) : (v as (a: number, b: number) => string)(1, 2)).toMatch(/\S/);
    }
    expect(phoneText("vi").hold).not.toBe(phoneText("en").hold);
    // 안내 모드(사진으로 누를 곳 찾기)의 머리·버튼·단계 표시도 6개 언어로 옮겨져 있다(영어를 그대로 두지 않는다)
    for (const l of ["ko", "ja", "vi", "zh", "es"])
      for (const k of ["guideTitle", "guideSub", "close", "retake", "nextShot", "stageSpark", "stageSam", "stageCheck", "whereChip", "shapeChip", "guideAsk", "photoError", "readError", "photoAlt", "soundTip", "bargeTip", "tooLong", "reconnecting", "toggleOn", "me", "chat", "language", "waitLong", "kioskReset"] as const) expect(phoneText(l)[k], `${l}.${k}`).not.toBe(phoneText("en")[k]);
  });
});
