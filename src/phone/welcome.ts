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

// 첫 인사(11/5 사용자: "처음 탭했을 때 키오스크 종류에 맞춰 인사해야 연결된 것도 알고, 궁금하면 물어보라고 하면 하기 편하다").
// 처음 쓰는 사람·어르신·외국인을 생각해 짧은 문장 넷: 인사, 무엇과 연결됐는지(쉬운 말), 무엇을 말하면 되는지 하나, 궁금하면 물어보라.
// 공항은 공용 기계라 항공사 이름을 넣지 않는다. 연결되면 화면에 글로, 처음 탭할 때 소리로 한 번
const greetings: Record<string, Record<Lang, string>> = {
  fastfood: {
    en: "Hello! You're connected to the Bridge Burger kiosk. Just tell me what you'd like to eat. If you have any questions, just ask.",
    ko: "안녕하세요. 브리지 버거 주문기와 연결됐어요. 드시고 싶은 걸 편하게 말씀해 주세요. 궁금한 사항이 있으면 물어보세요.",
    ja: "こんにちは。ブリッジバーガーの注文機につながりました。食べたいものを気軽に話してください。分からないことがあれば聞いてください。",
    vi: "Xin chào! Điện thoại đã kết nối với máy gọi món Bridge Burger. Bạn muốn ăn gì cứ nói với tôi. Có thắc mắc gì thì cứ hỏi tôi nhé.",
    zh: "您好！已连接到 Bridge Burger 点餐机。想吃什么，直接告诉我就行。有任何问题，都可以问我。",
    es: "¡Hola! Está conectado al quiosco de Bridge Burger. Dígame qué le gustaría comer. Si tiene alguna pregunta, pregúnteme.",
  },
  airport: {
    en: "Hello! You're connected to the airport check-in kiosk. Tell me your airline and how many of you are flying. If you have any questions, just ask.",
    ko: "안녕하세요. 공항 체크인 기계와 연결됐어요. 타실 항공사와 몇 분이 가시는지 말씀해 주세요. 궁금한 사항이 있으면 물어보세요.",
    ja: "こんにちは。空港のチェックイン機につながりました。航空会社と、何人で乗るかを話してください。分からないことがあれば聞いてください。",
    vi: "Xin chào! Điện thoại đã kết nối với máy làm thủ tục ở sân bay. Hãy cho tôi biết hãng bay và số người đi. Có thắc mắc gì thì cứ hỏi tôi nhé.",
    zh: "您好！已连接到机场自助值机机。请告诉我航空公司和几位乘机。有任何问题，都可以问我。",
    es: "¡Hola! Está conectado al quiosco de facturación del aeropuerto. Dígame su aerolínea y cuántas personas viajan. Si tiene alguna pregunta, pregúnteme.",
  },
  train: {
    en: "Hello! You're connected to the train ticket machine. Tell me where and when you'd like to go. If you have any questions, just ask.",
    ko: "안녕하세요. 기차표 발매기와 연결됐어요. 어디로, 언제 가시는지 말씀해 주세요. 궁금한 사항이 있으면 물어보세요.",
    ja: "こんにちは。きっぷの券売機につながりました。どこへ、いつ行くかを話してください。分からないことがあれば聞いてください。",
    vi: "Xin chào! Điện thoại đã kết nối với máy bán vé tàu. Hãy cho tôi biết bạn muốn đi đâu và khi nào. Có thắc mắc gì thì cứ hỏi tôi nhé.",
    zh: "您好！已连接到火车售票机。请告诉我您想去哪里、什么时候出发。有任何问题，都可以问我。",
    es: "¡Hola! Está conectado a la máquina de billetes de tren. Dígame adónde y cuándo quiere ir. Si tiene alguna pregunta, pregúnteme.",
  },
};

export const greeting = (kioskId: string | undefined, language: string) => (greetings[kioskId ?? "fastfood"] ?? greetings.fastfood)[langOf(language)];
