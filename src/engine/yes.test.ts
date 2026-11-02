import { describe, expect, it } from "vitest";
import { isYes } from "./yes";

describe("관문 동의로 받는 고정 '예' 목록", () => {
  it("언어별 고정 목록과 (띄어쓰기·문장부호를 빼고) 똑같을 때만 동의다. 물음표·부정·잡음·덧붙인 말은 동의가 아니다", () => {
    const yes = ["네", "네, 확인했어요.", "예!", "확인했습니다", "Yes", "yes, I confirm", "OK", "はい", "確認しました", "Có", "Vâng", "Đúng rồi", "Được", "tôi xác nhận", "是的", "我已确认", "Sí", "lo confirmo"];
    const no = ["네?", "yes?", "아니요", "아니 네", "no", "いいえ", "không", "不", "음…", "", "   ", "네 근데 짐은 두 개요", "yes but wait", "네네네네 잠깐만요"];
    expect(yes.filter((s) => !isYes(s))).toEqual([]);
    expect(no.filter((s) => isYes(s))).toEqual([]);
  });

  it("'예' 머리말 + 목록 문장, 같은 말 되풀이도 동의다. 문장 전체가 맞아야 하므로 머리말 뒤에 다른 말이 붙으면 동의가 아니다", () => {
    const yes = ["네, 맞습니다", "네 그렇게 해 주세요", "네, 진행해 주세요", "Yes please confirm", "Yep, all good", "Sure, go ahead", "Go ahead", "Yes, go ahead", "うん、いいよ", "好的，没问题", "넵", "내", "네네", "네 알겠습니다", "그래", "좋아", "네, 그 자리로 확정해 주세요.", "Yes, I understand.", "Yes, confirm it.", "Yeah sure", "yes yes yes", "Sí, confirmo", "Vâng, tôi đã đọc và đồng ý.", "好吧"];
    const no = ["네 근데 라이터 있어요", "네 잠깐만요", "OK wait", "Confirm? Wait, which seats are those?", "Có, tôi có pin", "Dạ, tôi có pin dự phòng", "Được không", "是吗", "好吗", "짐 두 개예요", "확인 안 했어요", "동의 안 해요", "안 좋아요", "sí, pero tengo un encendedor", "claro que no", "uh yes but", "아뇨"];
    expect(yes.filter((s) => !isYes(s))).toEqual([]);
    expect(no.filter((s) => isYes(s))).toEqual([]);
  });

  it("존댓말 꼬리·머리(베트남어 ạ·dạ, 한국어 요)를 떼고 보고, 받아쓰기가 앞부분을 한 번 되풀이한 꼴과 단어 묶음을 바로 이어 되풀이한 꼴(줄이면 목록과 똑같을 때만)도 예로 본다. 부정어는 어떤 꼴로도 통과하지 않는다", () => {
    // critic-demo가 베트남어 합성 음성으로 실제 받아쓰기를 돌린 결과(transcribe_log.txt) 그대로
    const transcribed = ["Vâng, tôi xác nhận...", "Vâng,Vâng, tôi xác nhận.", "Vâng, tôiVâng, tôi xác nhận.", "Vâng, tôi xác nhận..", "Vâng,Tôi xác nhận.", "Vâng, tôi xác nhận", "Vâng, tôi xác xác nhận.", "Vâng, tôi xác nhận, tôi xác nhận."];
    const polite = ["Có ạ", "Vâng ạ", "Dạ có", "Dạ, tôi xác nhận", "Vâng, tôi xác nhận ạ", "Dạ vâng ạ", "네요", "예요", "はい、お願いします", "はい、そうです", "好的呀"];
    const negative = ["Không ạ", "Dạ không", "Không, không", "Không có", "Vâng, không", "아니요", "아니요 아니요", "네 아니요", "No", "No, no", "Yes no", "いいえ", "いいえ、いいえ", "不", "不是", "不不", "No sí", "Vâng, không không", "네 아니 아니요"];
    expect([...transcribed, ...polite].filter((s) => !isYes(s))).toEqual([]);
    expect(negative.filter((s) => isYes(s))).toEqual([]);
  });
});
