// 휴대폰 화면의 고정 문구(휴대폰의 6개 언어). 키오스크 화면 글자가 아니라 사용자가 읽는 글이다
import { langOf, type Lang } from "@/engine/turn";
import type { Answers } from "@/sync/link";

interface PhoneText {
  hold: string;
  // 첫 화면: KIBO 목소리가 안 들리면 소리를 켜 달라는 안내
  soundTip: string;
  listening: string;
  // 마이크가 화면 밖일 때 띄우는 작은 누르고 말하기의 글자(짧게)
  talk: string;
  // 말한 언어를 따라 휴대폰 언어를 바꿨다는 한 줄(바뀐 언어로)과, 되돌리기 버튼의 이름(원래 언어로. 보이는 글자는 '↩ 언어 이름')
  switched: string;
  switchBack: string;
  // 머리줄 아래 실시간 키오스크 카드의 머리말
  kioskNow: string;
  // 되묻기 답 칩. 보이는 글자 그대로 키오스크에 보낸다(휴대폰 언어. Spark가 이해한다)
  answers: Record<Answers, string[]>;
  // [더 주문할게요]를 눌렀을 때 휴대폰이 바로 붙이는 KIBO 고정 턴(키오스크로 보내지 않는다)
  moreAsk: string;
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
  // 55초가 되어 저절로 보냈을 때, 키오스크와의 연결이 끊겼을 때(머리줄)
  tooLong: string;
  reconnecting: string;
  // 보낸 뒤 3초가 지나도 대답이 없을 때 안내 줄
  waitLong: string;
  // 되물은 뒤 키오스크가 시간 초과로 첫 화면에 돌아갔을 때 한 번
  kioskReset: string;
  // 화면 읽기: 두 번 탭으로 녹음을 시작했을 때 한 번, KIBO가 누르기 시작할 때 한 번(진행 띠는 읽히지 않는다), 말풍선의 말한 사람(나), 대화 칸 이름, 언어 단추 이름('언어: 한국어')
  toggleOn: string;
  noSpeech: string;
  tapStart: (steps: number) => string;
  me: string;
  chat: string;
  language: string;
  // 말을 보냈는데 키오스크가 25초 안에 대답하지 않을 때(키오스크 화면이 닫힘·연결 끊김), 휴대폰 인터넷이 끊겼을 때
  noAnswer: string;
  offline: string;
  // 상태 줄: 장바구니 개수, 결제를 마친 뒤의 단계 이름
  items: (n: number) => string;
  paidLabel: string;
  // 안내 카메라 버튼의 이름(화면 읽기)
  camera: string;
  // 공항·기차 상태 줄: 여권 수, 인원, 좌석 목록
  passports: (n: number) => string;
  people: (n: number) => string;
  seats: (list: string[]) => string;
  // 공항 상태 줄: 부치는 짐 개수. 기차 상태 줄: 타는 날(월, 일, 요일 0=일요일), 출발 시각, 좌석 등급
  bags: (n: number) => string;
  day: (month: number, date: number, weekday: number) => string;
  departs: (hhmm: string) => string;
  standardClass: string;
  firstClass: string;
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
    hold: "Tap and talk",
    soundTip: "Can't hear KIBO? Turn off silent mode and turn up the volume",
    listening: "Listening…",
    talk: "Talk",
    switched: "Switched to English",
    switchBack: "Back to English",
    kioskNow: "Kiosk now",
    answers: { orderType: ["For here", "To go"], mode: ["Meal", "Single"], size: ["Size M", "Size L"], more: ["That's all", "I want to order more"] },
    moreAsk: "Sure. Tell me what else you'd like.",
    sending: "Sending…",
    tooShort: "That was too short. Tap and talk again",
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
    tooLong: "That was over 55 seconds, so I sent what you said so far",
    reconnecting: "Reconnecting…",
    waitLong: "Understanding what you said · usually 5–10 s",
    kioskReset: "The kiosk went back to the start. Please say your order again.",
    toggleOn: "Listening. I'll send it when you stop talking",
    noSpeech: "I didn't hear anything, so I stopped listening. Tap to speak again",
    tapStart: (n) => `KIBO will tap ${n} times`,
    me: "Me:",
    chat: "Conversation",
    language: "Language",
    noAnswer: "The kiosk didn't answer. Check that its screen is on, then say it again.",
    offline: "Your phone is offline. Connect to the internet, then say it again.",

    items: (n) => (n === 1 ? "1 item" : `${n} items`),
    paidLabel: "Payment complete",
    camera: "Take a photo of the kiosk screen",
    passports: (n) => (n === 1 ? "1 passport" : `${n} passports`),
    people: (n) => (n === 1 ? "1 passenger" : `${n} passengers`),
    seats: (xs) => `${xs.length === 1 ? "seat" : "seats"} ${xs.join("·")}`,
    bags: (n) => (n === 1 ? "1 checked bag" : `${n} checked bags`),
    day: (m, d, w) => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w]} ${m}/${d}`,
    departs: (t) => `departs ${t}`,
    standardClass: "Standard",
    firstClass: "First class",
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
    hold: "탭하고 말씀하세요",
    soundTip: "KIBO 목소리가 안 들리면 휴대폰 무음 모드를 끄고 소리를 키워 주세요",
    listening: "듣고 있어요…",
    talk: "말하기",
    switched: "한국어로 바꿨어요",
    switchBack: "한국어로 되돌리기",
    kioskNow: "키오스크 지금",
    answers: { orderType: ["먹고 갈게요", "포장할게요"], mode: ["세트", "단품"], size: ["M 사이즈", "L 사이즈"], more: ["그게 다예요", "더 주문할게요"] },
    moreAsk: "네, 더 드실 메뉴를 말씀해 주세요.",
    sending: "보내는 중…",
    tooShort: "너무 짧았어요. 다시 탭하고 말해 주세요",
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
    tooLong: "55초가 넘어서 여기까지 보냈어요",
    reconnecting: "다시 연결 중…",
    waitLong: "말씀을 이해하는 중이에요 · 보통 5–10초",
    kioskReset: "키오스크가 처음으로 돌아갔어요. 다시 말씀해 주세요.",
    toggleOn: "듣고 있어요. 말이 끝나면 저절로 보내요",
    noSpeech: "말씀이 없어서 듣기를 멈췄어요. 다시 누르고 말해 주세요",
    tapStart: (n) => `KIBO가 ${n}번 누릅니다`,
    me: "나:",
    chat: "대화",
    language: "언어",
    noAnswer: "키오스크가 대답하지 않아요. 키오스크 화면이 켜져 있는지 보고 다시 말해 주세요.",
    offline: "휴대폰 인터넷이 끊겼어요. 연결되면 다시 말해 주세요.",

    items: (n) => `${n}개`,
    paidLabel: "결제 완료",
    camera: "키오스크 화면 사진 찍기",
    passports: (n) => `여권 ${n}개`,
    people: (n) => `${n}명`,
    seats: (xs) => `좌석 ${xs.join("·")}`,
    bags: (n) => `부치는 짐 ${n}개`,
    day: (m, d, w) => `${m}/${d}(${"일월화수목금토"[w]})`,
    departs: (t) => `${t} 출발`,
    standardClass: "일반실",
    firstClass: "특실",
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
    hold: "タップして話してください",
    soundTip: "KIBOの声が聞こえないときは、マナーモードを切って音量を上げてください",
    listening: "聞いています…",
    talk: "話す",
    switched: "日本語に切り替えました",
    switchBack: "日本語に戻す",
    kioskNow: "キオスクの今",
    answers: { orderType: ["店内で", "持ち帰りで"], mode: ["セット", "単品"], size: ["Mサイズ", "Lサイズ"], more: ["以上です", "もっと注文します"] },
    moreAsk: "はい、追加のご注文をおっしゃってください。",
    sending: "送信中…",
    tooShort: "短すぎました。もう一度タップして話してください",
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
    tooLong: "55秒を超えたので、ここまでを送りました",
    reconnecting: "再接続しています…",
    waitLong: "お話の内容を理解しています · 通常5〜10秒",
    kioskReset: "キオスクが最初の画面に戻りました。もう一度お話しください。",
    toggleOn: "聞いています。話し終わると自動で送ります",
    noSpeech: "声が聞こえなかったので止めました。もう一度押して話してください",
    tapStart: (n) => `KIBOが${n}回押します`,
    me: "わたし:",
    chat: "会話",
    language: "言語",
    noAnswer: "キオスクから返事がありません。画面がついているか確かめて、もう一度話してください。",
    offline: "スマートフォンがインターネットにつながっていません。つながったら、もう一度話してください。",

    items: (n) => `${n}点`,
    paidLabel: "お支払い完了",
    camera: "キオスクの画面を撮影",
    passports: (n) => `パスポート ${n}冊`,
    people: (n) => `${n}名`,
    seats: (xs) => `座席 ${xs.join("·")}`,
    bags: (n) => `預け荷物 ${n}個`,
    day: (m, d, w) => `${m}/${d}(${"日月火水木金土"[w]})`,
    departs: (t) => `${t}発`,
    standardClass: "普通車",
    firstClass: "特別車",
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
    hold: "Chạm rồi nói",
    soundTip: "Nếu không nghe thấy KIBO, hãy tắt chế độ im lặng và tăng âm lượng",
    listening: "Đang nghe…",
    talk: "Nói",
    switched: "Đã chuyển sang Tiếng Việt",
    switchBack: "Quay lại Tiếng Việt",
    kioskNow: "Kiosk hiện tại",
    answers: { orderType: ["Ăn tại chỗ", "Mang đi"], mode: ["Combo", "Món lẻ"], size: ["Cỡ M", "Cỡ L"], more: ["Vậy thôi", "Tôi muốn gọi thêm"] },
    moreAsk: "Vâng, bạn muốn gọi thêm món gì?",
    sending: "Đang gửi…",
    tooShort: "Quá ngắn. Hãy chạm và nói lại",
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
    tooLong: "Đã quá 55 giây nên tôi gửi phần bạn đã nói",
    reconnecting: "Đang kết nối lại…",
    waitLong: "Đang hiểu lời bạn nói · thường 5–10 giây",
    kioskReset: "Máy đã quay về màn hình đầu. Vui lòng nói lại.",
    toggleOn: "Đang nghe. Nói xong sẽ tự gửi",
    noSpeech: "Không nghe thấy gì nên đã dừng. Hãy chạm và nói lại",
    tapStart: (n) => `KIBO sẽ bấm ${n} lần`,
    me: "Tôi:",
    chat: "Cuộc trò chuyện",
    language: "Ngôn ngữ",
    noAnswer: "Kiosk chưa trả lời. Hãy xem màn hình kiosk còn bật không rồi nói lại.",
    offline: "Điện thoại đang mất mạng. Khi có kết nối, hãy nói lại.",

    items: (n) => `${n} món`,
    paidLabel: "Đã thanh toán",
    camera: "Chụp ảnh màn hình kiosk",
    passports: (n) => `${n} hộ chiếu`,
    people: (n) => `${n} hành khách`,
    seats: (xs) => `ghế ${xs.join("·")}`,
    bags: (n) => `${n} kiện hành lý ký gửi`,
    day: (m, d, w) => `${w === 0 ? "CN" : `T${w + 1}`}, ${d}/${m}`,
    departs: (t) => `khởi hành ${t}`,
    standardClass: "ghế thường",
    firstClass: "hạng nhất",
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
    hold: "点一下再说话",
    soundTip: "听不到 KIBO 的声音时，请关闭静音模式并调高音量",
    listening: "正在听…",
    talk: "说话",
    switched: "已切换为中文",
    switchBack: "改回中文",
    kioskNow: "自助机当前",
    answers: { orderType: ["堂食", "外带"], mode: ["套餐", "单点"], size: ["M号", "L号"], more: ["就这些", "我还要点"] },
    moreAsk: "好的，请说您还要点什么。",
    sending: "正在发送…",
    tooShort: "太短了。请再点一下说话",
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
    tooLong: "已超过55秒，已发送到这里为止的内容",
    reconnecting: "正在重新连接…",
    waitLong: "正在理解您说的话 · 通常需要5–10秒",
    kioskReset: "自助机已回到首页。请再说一遍。",
    toggleOn: "正在听。说完会自动发送",
    noSpeech: "没有听到声音，已停止。请再点一下说话",
    tapStart: (n) => `KIBO 将点击 ${n} 次`,
    me: "我：",
    chat: "对话",
    language: "语言",
    noAnswer: "自助机没有回应。请看看屏幕是否开着，然后再说一遍。",
    offline: "手机没有网络。连上网络后请再说一遍。",

    items: (n) => `${n} 件`,
    paidLabel: "支付完成",
    camera: "拍摄自助机屏幕",
    passports: (n) => `护照 ${n} 本`,
    people: (n) => `${n} 位乘客`,
    seats: (xs) => `座位 ${xs.join("·")}`,
    bags: (n) => `托运行李 ${n} 件`,
    day: (m, d, w) => `${m}月${d}日(周${"日一二三四五六"[w]})`,
    departs: (t) => `${t}出发`,
    standardClass: "普通座",
    firstClass: "一等座",
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
    hold: "Toca y habla",
    soundTip: "¿No oyes a KIBO? Quita el modo silencio y sube el volumen",
    listening: "Escuchando…",
    talk: "Hablar",
    switched: "Cambiado a Español",
    switchBack: "Volver a Español",
    kioskNow: "Quiosco ahora",
    answers: { orderType: ["Para comer aquí", "Para llevar"], mode: ["Menú", "Solo"], size: ["Tamaño M", "Tamaño L"], more: ["Eso es todo", "Quiero pedir más"] },
    moreAsk: "Claro. Dígame qué más quiere.",
    sending: "Enviando…",
    tooShort: "Fue muy corto. Toca y habla otra vez",
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
    tooLong: "Pasaron 55 segundos, así que envié lo que dijiste hasta ahora",
    reconnecting: "Reconectando…",
    waitLong: "Entendiendo lo que dijiste · suele tardar 5–10 s",
    kioskReset: "El quiosco volvió al inicio. Vuelve a decir tu pedido.",
    toggleOn: "Escuchando. Lo envío cuando termine de hablar",
    noSpeech: "No oí nada, así que dejé de escuchar. Toque para hablar otra vez",
    tapStart: (n) => `KIBO va a pulsar ${n} veces`,
    me: "Yo:",
    chat: "Conversación",
    language: "Idioma",
    noAnswer: "El quiosco no respondió. Mira si su pantalla está encendida y dilo otra vez.",
    offline: "Tu teléfono no tiene internet. Cuando se conecte, dilo otra vez.",

    items: (n) => (n === 1 ? "1 producto" : `${n} productos`),
    paidLabel: "Pago completado",
    camera: "Fotografiar la pantalla del quiosco",
    passports: (n) => (n === 1 ? "1 pasaporte" : `${n} pasaportes`),
    people: (n) => (n === 1 ? "1 pasajero" : `${n} pasajeros`),
    seats: (xs) => `${xs.length === 1 ? "asiento" : "asientos"} ${xs.join("·")}`,
    bags: (n) => (n === 1 ? "1 maleta facturada" : `${n} maletas facturadas`),
    day: (m, d, w) => `${["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][w]} ${d}/${m}`,
    departs: (t) => `sale a las ${t}`,
    standardClass: "estándar",
    firstClass: "primera clase",
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

// 실패했을 때 휴대폰이 보이고 읽어 줄 한 줄. 휴대폰 인터넷이 끊겼으면 다시 말해도 소용없으니 연결부터 알린다. 아니면 받은 문구(서버 say 등)
export const failLine = (tx: PhoneText, online: boolean, line: string) => (online ? line : tx.offline);
