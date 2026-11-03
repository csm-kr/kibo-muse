import { describe, expect, it } from "vitest";
import { MIN_HOLD_MS, TAIL_MS, releaseAction } from "./ptt";
import { phoneText } from "./text";

describe("누르고 말하기", () => {
  it("0.4초보다 짧게 누르면 보내지 않고, 그 이상이면 뗀 뒤 0.25초 더 녹음해 보낸다", () => {
    expect([MIN_HOLD_MS, TAIL_MS]).toEqual([400, 250]);
    expect([releaseAction(0), releaseAction(399), releaseAction(400), releaseAction(5_000)]).toEqual(["too_short", "too_short", "send", "send"]);
  });

  it("마이크 버튼 문구와 안내는 휴대폰 언어로 쓴다(6개 언어 모두, 빈 칸 없이)", () => {
    const ko = phoneText("ko-KR");
    expect([ko.tooShort, ko.sending, ko.send]).toEqual(["누른 채로 말해 주세요", "보내는 중…", "보내기"]);
    expect(ko.tapping(2, 7)).toBe("KIBO가 누르는 중 · 2/7");
    expect(ko.sound).toBe("대답을 소리로 듣기");
    expect([ko.orderTitle, ko.paying, ko.paid(57)]).toEqual(["주문 확인", "결제 화면이에요. 결제를 마치면 주문이 끝나요", "주문이 끝났어요 ✓ 번호 57"]);
    expect(phoneText("vi").paid(57)).toMatch(/57/);
    expect(ko.retry).toBe("다시 눌러서 말해 주세요");
    // 권한 창 사이에 뗌, 55초 자동 뗌, 연결 끊김
    expect([ko.allowRetry, ko.tooLong, ko.reconnecting]).toEqual(["마이크를 허용했으면 다시 눌러 말해 주세요", "55초가 넘어서 여기까지 보냈어요", "다시 연결 중…"]);
    // 화면 읽기: 두 번 탭으로 시작했을 때 한 번, KIBO가 누르기 시작할 때 한 번, 말풍선의 말한 사람, 대화 칸·언어 단추 이름
    expect([ko.toggleOn, ko.tapStart(14), ko.me, ko.chat, ko.language]).toEqual(["듣고 있어요. 다시 두 번 탭하면 보내요", "KIBO가 14번 누릅니다", "나:", "대화", "언어"]);
    expect(phoneText("Japanese").tooShort).toBe("押したまま話してください");
    const keys = Object.keys(phoneText("en")).sort();
    for (const l of ["en", "ko", "ja", "vi", "zh", "es"]) {
      const x = phoneText(l);
      expect(Object.keys(x).sort()).toEqual(keys);
      for (const [k, v] of Object.entries(x)) expect(typeof v !== "function" ? v : k === "seats" ? (v as (xs: string[]) => string)(["3A"]) : (v as (a: number, b: number) => string)(1, 2)).toMatch(/\S/);
    }
    expect(phoneText("vi").hold).not.toBe(phoneText("en").hold);
    // 안내 모드(사진으로 누를 곳 찾기)의 머리·버튼·단계 표시도 6개 언어로 옮겨져 있다(영어를 그대로 두지 않는다)
    for (const l of ["ko", "ja", "vi", "zh", "es"])
      for (const k of ["guideTitle", "guideSub", "close", "retake", "nextShot", "stageSpark", "stageSam", "stageCheck", "whereChip", "shapeChip", "guideAsk", "photoError", "readError", "photoAlt", "allowRetry", "tooLong", "reconnecting", "toggleOn", "me", "chat", "language"] as const) expect(phoneText(l)[k], `${l}.${k}`).not.toBe(phoneText("en")[k]);
  });
});
