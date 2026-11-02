// 휴대폰의 결제 넘기기 안내. 키오스크가 알려 준 실제 버튼 이름(화면 글자 그대로, 번역하지 않음)을 넣어 사람이 화면에서 바로 찾게 한다.
import { langOf, type Lang } from "@/engine/turn";

const text: Record<Lang, { t: string; b: string }> = {
  en: { t: "Tap [{b}] on the kiosk yourself. KIBO never pays for you.", b: "Pay" },
  ko: { t: "키오스크에서 [{b}]를 직접 눌러 주세요. KIBO는 결제하지 않아요.", b: "결제" },
  ja: { t: "キオスクの［{b}］はご自身で押してください。KIBOは支払いをしません。", b: "お支払い" },
  vi: { t: "Hãy tự bấm [{b}] trên kiosk. KIBO không bao giờ thanh toán thay bạn.", b: "Thanh toán" },
  zh: { t: "请在自助机上亲自点击［{b}］。KIBO 不会替您付款。", b: "支付" },
  es: { t: "Pulse usted [{b}] en el quiosco. KIBO nunca paga por usted.", b: "Pagar" },
};

export function payText(language: string, button?: string) {
  const x = text[langOf(language)];
  return x.t.replace("{b}", button || x.b);
}
