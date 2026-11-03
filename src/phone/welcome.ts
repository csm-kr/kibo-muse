// 대기 화면(대화가 없을 때)에 보이는 예시 문장 2개. 짝지은 키오스크에 맞춰 보인다(누르는 기능은 없다).
// 이름은 키오스크 데이터의 가상 이름만 쓴다
import { langOf, type Lang } from "@/engine/turn";

const examples: Record<string, Record<Lang, [string, string]>> = {
  fastfood: {
    en: ["A large double cheeseburger meal with Zero Cola, please.", "No pickles, for here. That's all."],
    ko: ["더블 치즈버거 라지 세트, 음료는 제로 콜라로 주세요.", "피클 빼고, 먹고 갈게요. 그게 다예요."],
    ja: ["ダブルチーズバーガーのLセット、ドリンクはコーラゼロで。", "ピクルス抜きで、店内で。以上です。"],
    vi: ["Một combo double cheeseburger cỡ lớn, nước là Zero Cola.", "Không dưa chua, ăn tại đây. Vậy thôi."],
    zh: ["一份大号双层芝士汉堡套餐，饮料要零度可乐。", "不要酸黄瓜，堂食。就这些。"],
    es: ["Un menú grande de hamburguesa doble con queso y Zero Cola.", "Sin pepinillos, para comer aquí. Eso es todo."],
  },
  airport: {
    en: ["Bridge Air to Tokyo, me and my mom.", "We'd like to sit together and check one bag."],
    ko: ["브리지항공으로 엄마랑 둘이 도쿄 가요.", "나란히 앉고 싶고, 짐은 하나 부칠게요."],
    ja: ["ブリッジエアで母と二人、東京へ行きます。", "隣同士の席で、預ける荷物は一つです。"],
    vi: ["Bay Bridge Air đi Tokyo, tôi và mẹ.", "Chúng tôi muốn ngồi cạnh nhau và ký gửi một kiện hành lý."],
    zh: ["我和妈妈坐 Bridge Air 去东京。", "想坐在一起，托运一件行李。"],
    es: ["Bridge Air a Tokio, mi madre y yo.", "Queremos sentarnos juntos y facturar una maleta."],
  },
  train: {
    en: ["Two adults to Harborlight tomorrow around 9 am.", "The express, window seats together please."],
    ko: ["내일 아침 9시쯤 등대항 가는 고속열차요.", "어른 2명, 창가 쪽 나란히 앉고 싶어요."],
    ja: ["明日の朝9時ごろ、Harborlight行きの特急で大人2人。", "窓側の隣同士の席がいいです。"],
    vi: ["Ngày mai khoảng 9 giờ sáng, 2 người lớn đi Harborlight.", "Tàu nhanh, ngồi cạnh nhau phía cửa sổ."],
    zh: ["明天早上9点左右去 Harborlight 的快车，两个大人。", "想要靠窗并排的座位。"],
    es: ["Dos adultos a Harborlight mañana hacia las 9.", "En el tren rápido, ventanilla y juntos, por favor."],
  },
};

export const welcomeExamples = (kioskId: string | undefined, language: string) => (examples[kioskId ?? "fastfood"] ?? examples.fastfood)[langOf(language)];
