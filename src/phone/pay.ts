// 휴대폰의 결제 넘기기 안내. 키오스크가 알려 준 실제 버튼 이름(화면 글자 그대로, 번역하지 않음)을 넣어 사람이 화면에서 바로 찾게 한다.
// tap: 눌러 달라는 줄(크게), never: KIBO는 결제하지 않는다는 줄(작게)
// 버튼 이름이 오지 않으면 키오스크 버튼 글자를 쓴다: 키오스크 화면은 한국어('결제하기')나 영어('Pay')뿐이다
import { langOf, type Lang } from "@/engine/turn";

const text: Record<Lang, { t: string; m: string; n: string; b: string }> = {
  en: { t: "Tap [{b}] on the kiosk yourself.", m: "Choose how to pay on the kiosk and insert your card.", n: "KIBO never pays for you.", b: "Pay" },
  ko: { t: "키오스크에서 [{b}]를 직접 눌러 주세요.", m: "키오스크에서 결제 방법을 고르고 카드를 넣어 주세요.", n: "KIBO는 결제하지 않아요.", b: "결제하기" },
  ja: { t: "キオスクの［{b}］はご自身で押してください。", m: "キオスクで支払い方法を選び、カードを入れてください。", n: "KIBOは支払いをしません。", b: "Pay" },
  vi: { t: "Hãy tự bấm [{b}] trên kiosk.", m: "Hãy chọn cách thanh toán trên kiosk và đưa thẻ vào.", n: "KIBO không bao giờ thanh toán thay bạn.", b: "Pay" },
  zh: { t: "请在自助机上亲自点击［{b}］。", m: "请在自助机上选择支付方式并插入银行卡。", n: "KIBO 不会替您付款。", b: "Pay" },
  es: { t: "Pulse usted [{b}] en el quiosco.", m: "Elija la forma de pago en el quiosco e inserte su tarjeta.", n: "KIBO nunca paga por usted.", b: "Pay" },
};

export function payText(language: string, button?: string) {
  const x = text[langOf(language)];
  return { tap: x.t.replace("{b}", button || x.b), never: x.n };
}

// 키오스크 화면 언어별 결제 버튼 글자(키오스크 strings의 pay와 같다)
const kioskPay = { en: "Pay", ko: "결제하기" } as const;

// 키오스크가 결제 방법 화면(payment)이면 [결제] 대신 결제 방법·카드 안내.
// 버튼 이름이 안 오면 키오스크가 알려 준 화면 언어(kioskLang)의 버튼 글자, 그것도 없으면 휴대폰 언어 기본값
export function payStep(language: string, screen: string, button?: string, kioskLang?: keyof typeof kioskPay) {
  const x = text[langOf(language)];
  return screen === "payment" ? { tap: x.m, never: x.n } : payText(language, button || (kioskLang && kioskPay[kioskLang]));
}
