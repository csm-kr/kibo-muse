// 휴대폰 화면의 고정 문구(휴대폰의 6개 언어). 키오스크 화면 글자가 아니라 사용자가 읽는 글이다
import { langOf, type Lang } from "@/engine/turn";

interface PhoneText {
  hold: string;
  listening: string;
  sending: string;
  tooShort: string;
  micBlocked: string;
  typeIt: string;
  send: string;
  tapping: (step: number, steps: number) => string;
  // 🔊 토글의 이름(누름 상태는 aria-pressed로)
  sound: string;
  // 주문 확인 카드와 끝 표시(키오스크가 주문 확인·결제 화면에 오면)
  orderTitle: string;
  total: string;
  paying: string;
  paid: (no: number) => string;
  // 받아쓰기가 비었거나 실패했고 서버 문구(say)도 없을 때
  retry: string;
  // 상태 줄: 장바구니 개수, 결제를 마친 뒤의 단계 이름
  items: (n: number) => string;
  paidLabel: string;
  // 안내 카메라 버튼의 이름(화면 읽기)
  camera: string;
  // 공항·기차 상태 줄: 여권 수, 인원, 좌석 목록
  passports: (n: number) => string;
  people: (n: number) => string;
  seats: (list: string[]) => string;
  // 대기 화면 인사(대화가 없을 때), 안내 모드 인사
  hello: string;
  helloSub: string;
  guideHello: string;
  // 마이크 아래 안내: 생각 중, 되묻기에 대답, 키오스크 조작 중
  thinking: string;
  answer: string;
  operating: string;
  // 영수증: 주문번호 머리, 결제 시각 줄, 받는 곳 안내
  orderNo: string;
  paidAt: (time: string) => string;
  pickup: string;
  // 머리의 연결 칩(아직 키오스크와 잇지 않음)
  notConnected: string;
  // 안내 모드(사진으로 누를 곳 찾기): 머리 이름·한 줄 설명, 닫기, 다시 찍기·다음 화면, 단계 표시 3개, 모델 칩 2개
  guideTitle: string;
  guideSub: string;
  close: string;
  retake: string;
  nextShot: string;
  stageSpark: string;
  stageSam: string;
  stageCheck: string;
  whereChip: string;
  shapeChip: string;
  // 질문을 쓰지 않았을 때 사진 아래 보이는 기본 질문(서버에는 영어 기본 질문을 그대로 보낸다), 사진 오류 2개, 사진 대체 글
  guideAsk: string;
  photoError: string;
  readError: string;
  photoAlt: string;
}

const text: Record<Lang, PhoneText> = {
  en: {
    hold: "Hold to talk, release to send",
    listening: "Listening… release to send",
    sending: "Sending…",
    tooShort: "Hold the button while you speak",
    micBlocked: "The microphone is blocked. You can type instead.",
    typeIt: "…or type it",
    send: "Send",
    tapping: (s, n) => `KIBO is tapping · ${s}/${n}`,

    sound: "Read replies aloud",

    orderTitle: "Your order",
    total: "Total",
    paying: "You're on the payment screen. Your order is done once you pay",
    paid: (n) => `Your order is done ✓ No. ${n}`,

    retry: "Please hold the button and say it again",

    items: (n) => (n === 1 ? "1 item" : `${n} items`),
    paidLabel: "Payment complete",
    camera: "Take a photo of the kiosk screen",
    passports: (n) => (n === 1 ? "1 passport" : `${n} passports`),
    people: (n) => (n === 1 ? "1 passenger" : `${n} passengers`),
    seats: (xs) => `${xs.length === 1 ? "seat" : "seats"} ${xs.join("·")}`,
    hello: "Hi, I'm KIBO",
    helloSub: "I tap the kiosk for you",
    guideHello: "Take a photo of a kiosk screen and I'll show you where to tap",
    thinking: "Thinking…",
    answer: "Hold to answer",
    operating: "KIBO is tapping the kiosk",
    orderNo: "Order number",
    paidAt: (t) => `Paid ${t} · paid at the kiosk`,
    pickup: "Pick up at the counter when your number is called",
    notConnected: "Not connected",
    guideTitle: "Guide",
    guideSub: "KIBO shows, you tap",
    close: "Close",
    retake: "Take again",
    nextShot: "Next screen",
    stageSpark: "Muse Spark · finding the button",
    stageSam: "SAM 3.1 · tracing its shape",
    stageCheck: "Checking the label",
    whereChip: "Muse Spark: where",
    shapeChip: "SAM 3.1: exact shape",
    guideAsk: "What should I press next on this screen?",
    photoError: "Couldn't read this photo. Please take it again with the camera (HEIC isn't supported).",
    readError: "Couldn't read the screen. Please try again.",
    photoAlt: "Kiosk screen photo",
  },
  ko: {
    hold: "누른 채로 말하고, 다 말하면 떼세요",
    listening: "듣고 있어요… 떼면 보내요",
    sending: "보내는 중…",
    tooShort: "누른 채로 말해 주세요",
    micBlocked: "마이크를 쓸 수 없어요. 글로 써 주세요.",
    typeIt: "…또는 글로 쓰기",
    send: "보내기",
    tapping: (s, n) => `KIBO가 누르는 중 · ${s}/${n}`,

    sound: "대답을 소리로 듣기",

    orderTitle: "주문 확인",
    total: "합계",
    paying: "결제 화면이에요. 결제를 마치면 주문이 끝나요",
    paid: (n) => `주문이 끝났어요 ✓ 번호 ${n}`,

    retry: "다시 눌러서 말해 주세요",

    items: (n) => `${n}개`,
    paidLabel: "결제 완료",
    camera: "키오스크 화면 사진 찍기",
    passports: (n) => `여권 ${n}개`,
    people: (n) => `${n}명`,
    seats: (xs) => `좌석 ${xs.join("·")}`,
    hello: "안녕하세요, KIBO예요",
    helloSub: "키오스크를 대신 눌러 드려요",
    guideHello: "키오스크 화면을 찍으면 누를 곳을 알려 드려요",
    thinking: "생각하고 있어요",
    answer: "눌러서 대답하세요",
    operating: "KIBO가 키오스크를 누르고 있어요",
    orderNo: "주문번호",
    paidAt: (t) => `결제 ${t} · 키오스크에서 결제됨`,
    pickup: "번호가 불리면 카운터에서 받으세요",
    notConnected: "연결 전",
    guideTitle: "안내",
    guideSub: "KIBO가 알려 주고, 누르는 건 직접",
    close: "닫기",
    retake: "다시 찍기",
    nextShot: "다음 화면 찍기",
    stageSpark: "Muse Spark · 버튼 찾는 중",
    stageSam: "SAM 3.1 · 모양 그리는 중",
    stageCheck: "글자 확인 중",
    whereChip: "Muse Spark: 위치",
    shapeChip: "SAM 3.1: 정확한 모양",
    guideAsk: "이 화면에서 다음에 무엇을 눌러야 하나요?",
    photoError: "사진을 읽지 못했어요. 카메라로 다시 찍어 주세요(HEIC는 지원하지 않아요).",
    readError: "화면을 읽지 못했어요. 다시 해 주세요.",
    photoAlt: "키오스크 화면 사진",
  },
  ja: {
    hold: "押したまま話して、離すと送信",
    listening: "聞いています… 離すと送信",
    sending: "送信中…",
    tooShort: "押したまま話してください",
    micBlocked: "マイクが使えません。文字で入力してください。",
    typeIt: "…または文字で入力",
    send: "送信",
    tapping: (s, n) => `KIBOが操作中 · ${s}/${n}`,

    sound: "返事を音声で聞く",

    orderTitle: "ご注文の確認",
    total: "合計",
    paying: "お支払い画面です。お支払いが済むとご注文が完了します",
    paid: (n) => `ご注文が完了しました ✓ 番号 ${n}`,

    retry: "もう一度押して話してください",

    items: (n) => `${n}点`,
    paidLabel: "お支払い完了",
    camera: "キオスクの画面を撮影",
    passports: (n) => `パスポート ${n}冊`,
    people: (n) => `${n}名`,
    seats: (xs) => `座席 ${xs.join("·")}`,
    hello: "こんにちは、KIBOです",
    helloSub: "キオスクを代わりに操作します",
    guideHello: "キオスクの画面を撮影すると、押す場所をお知らせします",
    thinking: "考えています",
    answer: "押して答えてください",
    operating: "KIBOがキオスクを操作しています",
    orderNo: "注文番号",
    paidAt: (t) => `お支払い ${t} · キオスクで支払い済み`,
    pickup: "番号が呼ばれたらカウンターでお受け取りください",
    notConnected: "未接続",
    guideTitle: "ガイド",
    guideSub: "KIBOが示し、押すのはご自身で",
    close: "閉じる",
    retake: "撮り直す",
    nextShot: "次の画面を撮る",
    stageSpark: "Muse Spark · ボタンを探しています",
    stageSam: "SAM 3.1 · 形をなぞっています",
    stageCheck: "文字を確認しています",
    whereChip: "Muse Spark: 位置",
    shapeChip: "SAM 3.1: 正確な形",
    guideAsk: "この画面で次に何を押せばいいですか？",
    photoError: "写真を読み込めませんでした。カメラでもう一度撮ってください（HEICは使えません）。",
    readError: "画面を読み取れませんでした。もう一度お試しください。",
    photoAlt: "キオスク画面の写真",
  },
  vi: {
    hold: "Giữ để nói, thả ra để gửi",
    listening: "Đang nghe… thả ra để gửi",
    sending: "Đang gửi…",
    tooShort: "Hãy giữ nút trong khi nói",
    micBlocked: "Không dùng được micrô. Bạn có thể gõ chữ.",
    typeIt: "…hoặc gõ chữ",
    send: "Gửi",
    tapping: (s, n) => `KIBO đang bấm · ${s}/${n}`,

    sound: "Đọc to câu trả lời",

    orderTitle: "Đơn của bạn",
    total: "Tổng",
    paying: "Đây là màn hình thanh toán. Thanh toán xong là đơn hoàn tất",
    paid: (n) => `Đơn đã xong ✓ Số ${n}`,

    retry: "Hãy nhấn giữ và nói lại",

    items: (n) => `${n} món`,
    paidLabel: "Đã thanh toán",
    camera: "Chụp ảnh màn hình kiosk",
    passports: (n) => `${n} hộ chiếu`,
    people: (n) => `${n} hành khách`,
    seats: (xs) => `ghế ${xs.join("·")}`,
    hello: "Xin chào, tôi là KIBO",
    helloSub: "Tôi bấm kiosk thay bạn",
    guideHello: "Chụp màn hình kiosk, tôi sẽ chỉ chỗ cần bấm",
    thinking: "Đang suy nghĩ",
    answer: "Giữ nút để trả lời",
    operating: "KIBO đang bấm kiosk",
    orderNo: "Số đơn",
    paidAt: (t) => `Thanh toán ${t} · đã trả tại kiosk`,
    pickup: "Khi số của bạn được gọi, hãy nhận tại quầy",
    notConnected: "Chưa kết nối",
    guideTitle: "Hướng dẫn",
    guideSub: "KIBO chỉ, bạn tự bấm",
    close: "Đóng",
    retake: "Chụp lại",
    nextShot: "Chụp màn hình tiếp",
    stageSpark: "Muse Spark · đang tìm nút",
    stageSam: "SAM 3.1 · đang vẽ hình dạng",
    stageCheck: "Đang kiểm tra chữ",
    whereChip: "Muse Spark: vị trí",
    shapeChip: "SAM 3.1: hình dạng chính xác",
    guideAsk: "Trên màn hình này tôi nên bấm gì tiếp theo?",
    photoError: "Không đọc được ảnh này. Hãy chụp lại bằng camera (không hỗ trợ HEIC).",
    readError: "Không đọc được màn hình. Hãy thử lại.",
    photoAlt: "Ảnh màn hình kiosk",
  },
  zh: {
    hold: "按住说话，松开发送",
    listening: "正在听… 松开发送",
    sending: "正在发送…",
    tooShort: "请按住按钮说话",
    micBlocked: "无法使用麦克风。可以改为输入文字。",
    typeIt: "…或输入文字",
    send: "发送",
    tapping: (s, n) => `KIBO 正在点击 · ${s}/${n}`,

    sound: "朗读回复",

    orderTitle: "确认订单",
    total: "合计",
    paying: "这是支付页面。付款完成后订单就完成了",
    paid: (n) => `订单已完成 ✓ 号码 ${n}`,

    retry: "请再按住说一遍",

    items: (n) => `${n} 件`,
    paidLabel: "支付完成",
    camera: "拍摄自助机屏幕",
    passports: (n) => `护照 ${n} 本`,
    people: (n) => `${n} 位乘客`,
    seats: (xs) => `座位 ${xs.join("·")}`,
    hello: "你好，我是 KIBO",
    helloSub: "我替您操作自助机",
    guideHello: "拍下自助机屏幕，我会告诉您该点哪里",
    thinking: "正在思考",
    answer: "按住回答",
    operating: "KIBO 正在操作自助机",
    orderNo: "订单号",
    paidAt: (t) => `支付 ${t} · 已在自助机付款`,
    pickup: "叫到号码时请到柜台取餐",
    notConnected: "未连接",
    guideTitle: "指引",
    guideSub: "KIBO 指给您看，由您来点",
    close: "关闭",
    retake: "重拍",
    nextShot: "拍下一个画面",
    stageSpark: "Muse Spark · 正在找按钮",
    stageSam: "SAM 3.1 · 正在描出形状",
    stageCheck: "正在核对文字",
    whereChip: "Muse Spark: 位置",
    shapeChip: "SAM 3.1: 精确形状",
    guideAsk: "这个画面下一步该点什么？",
    photoError: "无法读取这张照片。请用相机重新拍摄（不支持 HEIC）。",
    readError: "无法识别画面。请再试一次。",
    photoAlt: "自助机画面照片",
  },
  es: {
    hold: "Mantén pulsado para hablar, suelta para enviar",
    listening: "Escuchando… suelta para enviar",
    sending: "Enviando…",
    tooShort: "Mantén pulsado el botón mientras hablas",
    micBlocked: "El micrófono está bloqueado. Puedes escribir.",
    typeIt: "…o escríbelo",
    send: "Enviar",
    tapping: (s, n) => `KIBO está pulsando · ${s}/${n}`,

    sound: "Leer las respuestas en voz alta",

    orderTitle: "Tu pedido",
    total: "Total",
    paying: "Estás en la pantalla de pago. El pedido termina cuando pagues",
    paid: (n) => `Pedido terminado ✓ Número ${n}`,

    retry: "Mantén pulsado y dilo otra vez",

    items: (n) => (n === 1 ? "1 producto" : `${n} productos`),
    paidLabel: "Pago completado",
    camera: "Fotografiar la pantalla del quiosco",
    passports: (n) => (n === 1 ? "1 pasaporte" : `${n} pasaportes`),
    people: (n) => (n === 1 ? "1 pasajero" : `${n} pasajeros`),
    seats: (xs) => `${xs.length === 1 ? "asiento" : "asientos"} ${xs.join("·")}`,
    hello: "Hola, soy KIBO",
    helloSub: "Toco el quiosco por usted",
    guideHello: "Haga una foto de la pantalla del quiosco y le diré dónde tocar",
    thinking: "Pensando…",
    answer: "Mantenga pulsado para responder",
    operating: "KIBO está tocando el quiosco",
    orderNo: "Número de pedido",
    paidAt: (t) => `Pagado ${t} · en el quiosco`,
    pickup: "Recoja en el mostrador cuando llamen su número",
    notConnected: "Sin conexión",
    guideTitle: "Guía",
    guideSub: "KIBO le indica, usted toca",
    close: "Cerrar",
    retake: "Repetir foto",
    nextShot: "Siguiente pantalla",
    stageSpark: "Muse Spark · buscando el botón",
    stageSam: "SAM 3.1 · trazando su forma",
    stageCheck: "Comprobando el texto",
    whereChip: "Muse Spark: dónde",
    shapeChip: "SAM 3.1: forma exacta",
    guideAsk: "¿Qué debo pulsar ahora en esta pantalla?",
    photoError: "No se pudo leer esta foto. Vuelva a tomarla con la cámara (HEIC no es compatible).",
    readError: "No se pudo leer la pantalla. Inténtelo de nuevo.",
    photoAlt: "Foto de la pantalla del quiosco",
  },
};

export const phoneText = (language: string) => text[langOf(language)];
