// KIBO 한 턴: 들음 → 해석 중(thinking) → 화면 넘기는 중(replaying) → 사람 관문 기다림(waiting_gate) 또는 쉼(idle).
// 두 키오스크가 함께 쓴다. 키오스크마다 다른 것(해석 요청, 화면 재생, 관문 뒤 다시 계획)은 deps로 받는다.
// 지키는 것:
// - 말 한 번에 대답(reply)은 정확히 한 번. 바쁠 때 온 말은 하나만 기다렸다 처리하고, 같은 말이거나 더 오면 고정 문구로 답한다.
// - 사용자가 듣는 말은 검증된 것만: 계획 직후엔 고정 문구, 재생이 성공한 뒤에 완료(done)와 관문 카드.
// - 해석이 8초를 넘기면 '아직 생각 중' 고정 문구를 한 번 보내고, 실패하거나 20초를 넘기면 고정 문구로 사과하고 다음 말을 받는다.
// - 거절은 이유별 고정 문구로 답한다. 누를 것이 없는 계획은 성공처럼("알겠어요") 답하지 않는다.
// - 관문 카드에는 턴마다 새 id를 붙인다(세션마다 다른 접두어). 확인(ack)은 관문을 기다리는 중에, 지금 떠 있는 카드의 id로 온 것만 받는다.
//   해석·재생 중에 온 확인이나 옛 카드의 확인은 버리고 "처리 중" 고정 문구로 답한다(옛 카드의 확인이 바뀐 새 카드에 적용되지 않게).
// - 확인 관문에서 '예'가 아닌 말로 누를 것이 없는 계획이 나오면, 어떻게 확인하는지 고정 문구로 알려 준다.
// - 확인 관문을 기다릴 때 고정 "예" 목록과 맞는 말은 Spark를 거치지 않고 동의로 이어 간다(Spark는 동의를 만들 수 없다).

import type { LinkGate, LinkMsg } from "@/sync/link";
import { isYes } from "./yes";

export type TurnPhase = "idle" | "thinking" | "replaying" | "waiting_gate";

export interface Heard {
  id?: string;
  text: string;
  // 휴대폰의 언어 이름("Korean") 또는 언어 코드("ko")
  lang: string;
  // 말할 때 휴대폰에 떠 있던 관문 카드의 id. '예' 빠른 길은 이 id가 지금 카드와 같을 때만 동의로 받는다
  gateId?: string;
}

export interface Done {
  say: string;
  gate: LinkGate | null;
  paymentHandoff?: boolean;
  // 결제 넘기기 때 사람이 누를 키오스크 버튼 이름(화면 글자 그대로)
  payButton?: string;
}

// followSpoken: 서버가 말한 언어가 휴대폰 언어와 분명히 달라 말한 언어로 답했다. 대답에 실어 휴대폰이 그 언어로 바꾸게 한다
export type Understood<E> = (
  | { kind: "plan"; events: E[]; lang: string; done: Done }
  | { kind: "clarify"; say: string; lang: string }
  | { kind: "reject"; reason: string; lang: string; say?: string }
) & { followSpoken?: boolean };

export interface Resumed<E> {
  events: E[];
  lang: string;
  done: Done;
}

export interface TurnDeps<E> {
  understand(text: string, signal: AbortSignal): Promise<Understood<E>>;
  // 재생이 끝까지 성공하면 true
  play(events: E[]): Promise<boolean>;
  // 관문을 넘긴 뒤(확인 버튼, 여권 스캔) 같은 의도로 다시 계획한다. 이어 갈 것이 없으면 null
  resume(what: string): Resumed<E> | null;
  send(m: LinkMsg): void;
  onPhase(p: TurnPhase): void;
  // 해석이 SLOW_MS를 넘겼다(키오스크 위 띠에 '아직 생각 중'을 띄운다). 다음 phase 변화까지 유효
  onSlow?(): void;
}

// 평가 최대 15.8초, 공항 실행 2번 중 1번이 10초를 넘겼다. 8초에 '아직 생각 중'을 알리고 20초까지 기다린다
export const SLOW_MS = 8_000;
export const THINK_TIMEOUT_MS = 20_000;

export type Lang = "en" | "ko" | "ja" | "vi" | "zh" | "es";
const LANGS: Lang[] = ["en", "ko", "ja", "vi", "zh", "es"];
const NAMES: Record<string, Lang> = { english: "en", korean: "ko", japanese: "ja", vietnamese: "vi", chinese: "zh", spanish: "es" };
export const langOf = (s: string | undefined): Lang => NAMES[(s ?? "").toLowerCase()] ?? LANGS.find((l) => l === (s ?? "").toLowerCase().slice(0, 2)) ?? "en";

// 고정 문구. Spark가 만든 말은 되묻기(clarify)에만 쓴다
const phrases: Record<"ok" | "none" | "taps" | "same" | "full" | "slow" | "error" | "reject" | "failed" | "stale" | "askDangerous" | "askConfirm" | "askLater", Record<Lang, string>> = {
  ok: { en: "Got it.", ko: "알겠어요.", ja: "わかりました。", vi: "Được rồi.", zh: "好的。", es: "Entendido." },
  // 누를 것이 없는 계획. 무언가 했다고 말하지 않는다
  none: {
    en: "There's nothing for me to tap right now.",
    ko: "지금은 제가 누를 버튼이 없어요.",
    ja: "いま私が押すボタンはありません。",
    vi: "Hiện tại không có nút nào để tôi bấm.",
    zh: "现在没有需要我点的按钮。",
    es: "Ahora mismo no hay nada que yo deba tocar.",
  },
  taps: {
    en: "Got it. I'll make the {n} taps for you.",
    ko: "알겠어요. 제가 {n}번 눌러 드릴게요.",
    ja: "わかりました。代わりに{n}回タップします。",
    vi: "Được rồi. Tôi sẽ bấm {n} lần giúp bạn.",
    zh: "好的，我替您点{n}下。",
    es: "Entendido. Haré los {n} toques por usted.",
  },
  same: { en: "Yes, I'm on it.", ko: "네, 말씀하신 대로 하고 있어요.", ja: "はい、そのとおりに進めています。", vi: "Vâng, tôi đang làm đúng như vậy.", zh: "好的，正在按您说的办。", es: "Sí, ya lo estoy haciendo." },
  full: {
    en: "I'm still working on the screen. Please say it again when I'm done.",
    ko: "지금 화면을 넘기는 중이에요. 끝나면 다시 말씀해 주세요.",
    ja: "いま画面を操作中です。終わったらもう一度おっしゃってください。",
    vi: "Tôi đang thao tác màn hình. Khi xong, xin hãy nói lại.",
    zh: "我正在操作屏幕，完成后请再说一遍。",
    es: "Estoy usando la pantalla. Dígalo otra vez cuando termine.",
  },
  // 해석이 오래 걸릴 때(SLOW_MS) 한 번
  slow: {
    en: "Still thinking. One moment, please.",
    ko: "아직 생각 중이에요. 잠시만 기다려 주세요.",
    ja: "まだ考えています。少々お待ちください。",
    vi: "Tôi vẫn đang suy nghĩ. Xin chờ một chút.",
    zh: "还在思考中，请稍等。",
    es: "Sigo pensando. Un momento, por favor.",
  },
  // 서버·연결 문제. 사용자 탓처럼 들리지 않게 한다
  error: {
    en: "Sorry, something went wrong for a moment. Please say it again.",
    ko: "죄송해요, 잠시 문제가 생겼어요. 다시 말씀해 주세요.",
    ja: "すみません、一時的に問題が起きました。もう一度おっしゃってください。",
    vi: "Xin lỗi, vừa có sự cố. Xin hãy nói lại.",
    zh: "抱歉，刚才出了点问题。请再说一遍。",
    es: "Perdón, hubo un problema momentáneo. Dígalo otra vez, por favor.",
  },
  // 해석·재생 중이거나 이미 바뀐 카드에 대한 확인을 버렸을 때
  stale: {
    en: "I'm working on it right now. Please confirm when the new card appears.",
    ko: "지금 처리 중이에요. 새 안내가 나오면 그때 확인해 주세요.",
    ja: "ただいま処理中です。新しい案内が出たら確認してください。",
    vi: "Tôi đang xử lý. Khi thông báo mới hiện ra, xin hãy xác nhận lại.",
    zh: "正在处理中。新的提示出现后请再确认。",
    es: "Lo estoy procesando. Confirme cuando aparezca el nuevo aviso.",
  },
  // 확인 관문에서 '예'가 아닌 말에 누를 것이 없을 때. {b} = 휴대폰 카드의 버튼 이름
  askDangerous: {
    en: 'To confirm, say "yes" or tap [{b}]. If you have any prohibited items, please ask a staff member.',
    ko: '확인하시려면 "네"라고 말씀하시거나 [{b}] 버튼을 눌러 주세요. 금지 물품이 있으면 직원에게 문의해 주세요.',
    ja: "確認する場合は「はい」と言うか、［{b}］ボタンを押してください。禁止品をお持ちの場合は係員にお尋ねください。",
    vi: 'Để xác nhận, hãy nói "có" hoặc bấm [{b}]. Nếu bạn có vật phẩm bị cấm, hãy hỏi nhân viên.',
    zh: "如需确认，请说“是”或点击［{b}］。如果携带违禁物品，请询问工作人员。",
    es: "Para confirmar, diga «sí» o pulse [{b}]. Si lleva artículos prohibidos, consulte al personal.",
  },
  askConfirm: {
    en: 'To confirm check-in, say "yes" or tap [{b}].',
    ko: '확정하시려면 "네"라고 말씀하시거나 [{b}] 버튼을 눌러 주세요.',
    ja: "確定する場合は「はい」と言うか、［{b}］ボタンを押してください。",
    vi: 'Để xác nhận làm thủ tục, hãy nói "có" hoặc bấm [{b}].',
    zh: "如需确认值机，请说“是”或点击［{b}］。",
    es: "Para confirmar la facturación, diga «sí» o pulse [{b}].",
  },
  // 기차: 1시간 넘게 늦은 열차 확인. {b} = 휴대폰 카드의 버튼 이름
  askLater: {
    en: 'To take this train, say "yes" or tap [{b}].',
    ko: '이 열차로 하시려면 "네"라고 말씀하시거나 [{b}] 버튼을 눌러 주세요.',
    ja: "この列車にする場合は「はい」と言うか、［{b}］ボタンを押してください。",
    vi: 'Nếu muốn đi chuyến này, hãy nói "có" hoặc bấm [{b}].',
    zh: "要坐这趟车，请说“是”或点击［{b}］。",
    es: "Para tomar este tren, diga «sí» o pulse [{b}].",
  },
  reject: {
    en: "Sorry, I can't do that on this kiosk. Try saying it another way, or ask a staff member.",
    ko: "죄송해요, 그건 이 키오스크에서 해 드릴 수 없어요. 다르게 말씀해 주시거나 직원을 불러 주세요.",
    ja: "すみません、それはこの端末ではできません。言い方を変えるか、係員をお呼びください。",
    vi: "Xin lỗi, tôi không làm được việc đó trên máy này. Hãy nói cách khác hoặc gọi nhân viên.",
    zh: "抱歉，这台机器上做不到。请换个说法，或请工作人员帮忙。",
    es: "Perdón, eso no se puede hacer en este quiosco. Dígalo de otra forma o pida ayuda al personal.",
  },
  failed: {
    en: "The screen changed, so I stopped. Please tell me again from here.",
    ko: "화면이 바뀌어서 멈췄어요. 지금 화면에서 다시 말씀해 주세요.",
    ja: "画面が変わったので止めました。この画面からもう一度おっしゃってください。",
    vi: "Màn hình đã thay đổi nên tôi dừng lại. Xin hãy nói lại từ đây.",
    zh: "屏幕变了，我先停下了。请从这里再说一遍。",
    es: "La pantalla cambió y me detuve. Dígamelo otra vez desde aquí.",
  },
};

// 이유가 정해진 거절의 고정 문구. 없는 이유는 phrases.reject
const rejectPhrases: Record<string, Record<Lang, string>> = {
  // 결제 화면(결제 완료·주문번호 포함)에서 새 주문. {b} = 키오스크의 [처음으로]
  payment_in_progress: {
    en: "The kiosk is at payment, so I can't take a new order yet. To order again, tap [{b}] on the kiosk, then tell me.",
    ko: "키오스크가 결제 단계라 아직 새 주문을 받을 수 없어요. 새로 주문하시려면 키오스크의 [{b}] 버튼을 누른 뒤 다시 말씀해 주세요.",
    ja: "キオスクは支払いの段階なので、まだ新しい注文はできません。注文し直す場合はキオスクの［{b}］を押してから、もう一度おっしゃってください。",
    vi: "Máy đang ở bước thanh toán nên chưa nhận món mới được. Muốn gọi lại, hãy bấm [{b}] trên máy rồi nói lại với tôi.",
    zh: "自助机正在付款，暂时不能下新订单。要重新点餐，请先点击机器上的［{b}］，再告诉我。",
    es: "El quiosco está en el pago, así que aún no puedo tomar un pedido nuevo. Para pedir otra vez, pulse [{b}] en el quiosco y dígamelo.",
  },
  bad_qty: {
    en: "You can order up to 10 at a time.",
    ko: "한 번에 10개까지 주문할 수 있어요.",
    ja: "一度に注文できるのは10個までです。",
    vi: "Mỗi lần bạn có thể gọi tối đa 10 phần.",
    zh: "一次最多可以点10份。",
    es: "Puede pedir hasta 10 a la vez.",
  },
  // 담긴 줄 바꾸기·빼기·주문 취소는 KIBO가 하지 않는다
  unsupported: {
    en: "To change or remove items already in your order, please tap them yourself on the order review screen.",
    ko: "담긴 상품을 바꾸거나 빼는 건 주문 확인 화면에서 직접 눌러 주세요.",
    ja: "カートの商品の変更・削除は、注文確認画面でご自身で押してください。",
    vi: "Để đổi hoặc bỏ món đã có trong giỏ, xin hãy tự bấm ở màn hình xác nhận đơn.",
    zh: "要更改或删除已加入的商品，请在订单确认页面自己点按。",
    es: "Para cambiar o quitar productos ya añadidos, tóquelos usted en la pantalla de revisión del pedido.",
  },
  // 주문 전체 취소는 KIBO가 하지 않는다. 사람이 화면의 처음으로(start_over) 버튼을 누른다([취소]는 고르던 메뉴만 버린다)
  // {b} = 키오스크 화면의 그 버튼 글자(키오스크 언어). 휴대폰 언어로 옮기면 화면에서 찾을 수 없다
  cancel_order: {
    en: "To cancel the whole order, please tap [{b}] on the screen yourself.",
    ko: "주문 전체 취소는 화면의 [{b}]를 직접 눌러 주세요.",
    ja: "注文をすべて取り消すには、画面の［{b}］をご自身で押してください。",
    vi: "Để hủy toàn bộ đơn, xin hãy tự bấm [{b}] trên màn hình.",
    zh: "要取消整个订单，请自己点屏幕上的［{b}］。",
    es: "Para cancelar todo el pedido, pulse usted [{b}] en la pantalla.",
  },
  // 기차: 편도 예매만 한다. 왕복·환불·변경은 사람이 화면에서 한다
  train_unsupported: {
    en: "I can only help book one-way tickets. For round trips, refunds or changes, please use the screen yourself.",
    ko: "편도 승차권 예매만 도와드릴 수 있어요. 왕복·환불·변경은 화면에서 직접 해 주세요.",
    ja: "お手伝いできるのは片道乗車券の予約だけです。往復・払い戻し・変更は画面でご自身で操作してください。",
    vi: "Tôi chỉ giúp đặt vé một chiều. Vé khứ hồi, hoàn hoặc đổi vé, xin hãy tự thao tác trên màn hình.",
    zh: "我只能帮您预订单程票。往返、退票或改签请您自己在屏幕上操作。",
    es: "Solo puedo ayudar a reservar billetes de ida. Para ida y vuelta, devoluciones o cambios, use usted la pantalla.",
  },
  // 기차: 화면에 없는 할인(장애인·동반자 등). 어른 요금으로 바꿔 예약하지 않는다
  train_discount: {
    en: "This machine only sells adult, child and senior fares. For disability or other discounts, please ask at the ticket counter.",
    ko: "이 발매기는 어른·어린이·경로 요금만 팔아요. 장애인 등 다른 할인은 매표 창구에 문의해 주세요.",
    ja: "この券売機で買えるのは大人・子ども・シニアの運賃だけです。障害者割引などほかの割引は、きっぷ売り場でお尋ねください。",
    vi: "Máy này chỉ bán vé người lớn, trẻ em và người cao tuổi. Với giảm giá cho người khuyết tật hoặc ưu đãi khác, xin hãy hỏi tại quầy vé.",
    zh: "这台售票机只卖成人、儿童和老人票。残疾人等其他优惠请到售票窗口咨询。",
    es: "Esta máquina solo vende tarifas de adulto, niño y mayor. Para descuentos por discapacidad u otros, pregunte en la taquilla.",
  },
  // 기차: 출발역 = 도착역
  same_station: {
    en: "The departure and arrival stations are the same. Please name a different station.",
    ko: "출발역과 도착역이 같아요. 다른 역으로 말해 주세요.",
    ja: "出発駅と到着駅が同じです。別の駅をおっしゃってください。",
    vi: "Ga đi và ga đến giống nhau. Xin hãy nói một ga khác.",
    zh: "出发站和到达站相同。请说另一个站。",
    es: "La estación de salida y la de llegada son la misma. Diga otra estación.",
  },
  // 기차: 예매할 수 있는 날은 오늘부터 6일 뒤까지(rail.ts DAYS_AHEAD = 7)
  bad_day: {
    en: "Tickets can be booked from today up to 6 days ahead. Please say a date in that range.",
    ko: "오늘부터 6일 뒤까지만 예매할 수 있어요. 그 안의 날짜로 말해 주세요.",
    ja: "予約できるのは今日から6日後までです。その範囲の日付でおっしゃってください。",
    vi: "Chỉ đặt được vé từ hôm nay đến 6 ngày tới. Xin hãy nói một ngày trong khoảng đó.",
    zh: "只能预订今天起6天内的车票。请说这个范围内的日期。",
    es: "Se puede reservar desde hoy hasta dentro de 6 días. Diga una fecha dentro de ese plazo.",
  },
  // 기차: 고를 수 있는 시각은 05–23시(rail.ts FIRST_HOUR·LAST_HOUR)
  bad_hour: {
    en: "You can choose a time between 05:00 and 23:00. Please say a time in that range.",
    ko: "시각은 05:00부터 23:00 사이로 고를 수 있어요. 그 사이 시각으로 말해 주세요.",
    ja: "選べる時刻は05:00から23:00までです。その間の時刻でおっしゃってください。",
    vi: "Bạn có thể chọn giờ từ 05:00 đến 23:00. Xin hãy nói một giờ trong khoảng đó.",
    zh: "可以选择05:00到23:00之间的时间。请说这个范围内的时间。",
    es: "Puede elegir una hora entre las 05:00 y las 23:00. Diga una hora dentro de ese horario.",
  },
  // 기차: 그 시각 이후 종류·등급·빈자리가 맞는 열차가 없다
  no_trains_available: {
    en: "There's no train with free seats that matches after that time. Please try another time, day or class.",
    ko: "그 시각 이후로 조건에 맞는 빈자리 열차가 없어요. 다른 시각이나 날, 등급으로 말해 주세요.",
    ja: "その時刻以降、条件に合う空席のある列車がありません。別の時刻、日、または等級でおっしゃってください。",
    vi: "Sau giờ đó không có chuyến nào còn chỗ phù hợp. Xin hãy thử giờ, ngày hoặc hạng ghế khác.",
    zh: "那个时间以后没有符合条件且有空座的列车。请换个时间、日期或座位等级。",
    es: "No hay ningún tren con plazas libres que encaje después de esa hora. Pruebe otra hora, otro día u otra clase.",
  },
  // 기차 나가기. 결제는 사람만 하므로 결제된 것이 없다는 사실만 알린다. {b} = 화면 위 처음으로(home) 버튼 글자(키오스크 언어)
  train_exit: {
    en: "To go back to the start, tap [{b}] at the top of the screen. Nothing has been paid.",
    ko: "처음으로 가려면 화면 위 [{b}]를 눌러 주세요. 결제된 것은 없어요.",
    ja: "最初に戻るには、画面上の［{b}］を押してください。お支払いはまだされていません。",
    vi: "Để quay lại từ đầu, hãy bấm [{b}] ở phía trên màn hình. Chưa có khoản nào được thanh toán.",
    zh: "要回到开头，请点屏幕上方的［{b}］。还没有付任何钱。",
    es: "Para volver al inicio, pulse [{b}] arriba en la pantalla. No se ha pagado nada.",
  },
  // 기차 노선에 없는 역
  unknown_station: {
    en: "That station isn't on this machine's lines. Please name one of the stations on the screen.",
    ko: "그 역은 이 발매기 노선에 없어요. 화면에 있는 역 이름으로 말해 주세요.",
    ja: "その駅はこの券売機の路線にありません。画面にある駅名でおっしゃってください。",
    vi: "Ga đó không có trên các tuyến của máy này. Xin hãy nói tên một ga có trên màn hình.",
    zh: "这台售票机的线路上没有那个站。请说屏幕上有的站名。",
    es: "Esa estación no está en las líneas de esta máquina. Diga una de las estaciones de la pantalla.",
  },
  // 기차: 발매기 시각보다 이른 오늘 열차. {now} = 발매기 시각(화면 위 시계)
  past_time: {
    en: "It's {now} now, so earlier trains can't be booked. Please say a time after {now} or another day.",
    ko: "지금은 {now}이라 그보다 이른 열차는 예매할 수 없어요. {now} 이후나 다른 날로 말해 주세요.",
    ja: "いまは{now}なので、それより前の列車は予約できません。{now}以降か別の日でおっしゃってください。",
    vi: "Bây giờ là {now} nên không thể đặt chuyến sớm hơn. Xin hãy nói giờ sau {now} hoặc ngày khác.",
    zh: "现在是{now}，不能预订更早的列车。请说{now}以后的时间或别的日期。",
    es: "Ahora son las {now}, así que no se pueden reservar trenes anteriores. Diga una hora después de las {now} u otro día.",
  },
  // 기차 인원: 1–9명
  bad_passengers: {
    en: "You can book for up to 9 people at a time.",
    ko: "한 번에 9명까지 예매할 수 있어요.",
    ja: "一度に予約できるのは9人までです。",
    vi: "Mỗi lần bạn có thể đặt tối đa 9 người.",
    zh: "一次最多可以订9人。",
    es: "Puede reservar para un máximo de 9 personas a la vez.",
  },
  // 공항 나가기. 확정 카드를 다시 띄우지 않고, 확정되지 않았다는 사실만 알린다. {b} = 화면 아래 나가기(exit) 버튼 글자(키오스크 언어)
  exit: {
    en: "To go back to the start, tap [{b}] at the bottom of the screen. Your check-in has not been confirmed.",
    ko: "처음으로 가려면 화면 아래 [{b}]를 눌러 주세요. 체크인은 확정되지 않았어요.",
    ja: "最初に戻るには、画面下の［{b}］を押してください。チェックインは確定していません。",
    vi: "Để quay lại từ đầu, hãy bấm [{b}] ở phía dưới màn hình. Thủ tục chưa được xác nhận.",
    zh: "要回到开头，请点屏幕下方的［{b}］。值机尚未确认。",
    es: "Para volver al inicio, pulse [{b}] abajo en la pantalla. Su facturación no se ha confirmado.",
  },
};

// 거절 이유의 고정 문구. 서버 route도 이것으로 Spark 문장을 덮는다(하지 않은 일을 말하지 않게)
// vars: 문구 안 {이름} 자리에 넣을 값(예: past_time의 {now}, 버튼 이름 {b}는 키오스크 화면 글자)
export const rejectSay = (reason: string, lang: string, vars: Record<string, string> = {}) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), (rejectPhrases[reason] ?? phrases.reject)[langOf(lang)]);

// 계획의 고정 문구: 누를 수(n)가 있으면 "n번 누를게요", 없고 사람 관문 앞이면 그 관문을 묻고, 아니면 "누를 버튼이 없어요".
// 휴대폰(turn)과 서버 route가 같이 쓴다. Spark 문장은 하지 않은 일을 말할 수 있어 쓰지 않는다
export function planSay(n: number, lang: string, gate?: { what: string; button?: string } | null) {
  const l = langOf(lang);
  if (n > 0) return phrases.taps[l].replace("{n}", String(n));
  if (gate) return (gate.what === "dangerous_goods" ? phrases.askDangerous : gate.what === "later_train" ? phrases.askLater : phrases.askConfirm)[l].replace("{b}", gate.button ?? "");
  return phrases.none[l];
}

// 같은 말인지 볼 때 띄어쓰기·문장부호·기호는 무시한다
const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");

const aborted = (signal: AbortSignal) => new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true }));

export function createTurn<E>(initial: TurnDeps<E>) {
  // 화면이 다시 그려질 때마다 최신 함수로 바꿔 끼울 수 있게 한다(rebind)
  let deps = initial;
  let phase: TurnPhase = "idle";
  let current: string | null = null;
  let queued: (Heard & { id: string }) | null = null;
  let waitingFor: string | null = null;
  let waitingKind: LinkGate["kind"] | null = null;
  // 지금 휴대폰에 떠 있는 관문 카드의 id와 버튼 이름
  let waitingGateId: string | null = null;
  let waitingButton = "";
  // 휴대폰이 다시 연결하면(hello) 다시 보낼 지금 카드
  let waitingCard: LinkGate | null = null;
  let lastLang: Lang = "en";
  const seen = new Set<string>();
  let seq = 0;
  let gateSeq = 0;
  // 화면을 다시 열면 번호가 1부터 다시 시작하므로, 세션마다 다른 접두어로 옛 카드 id와 겹치지 않게 한다.
  // 첫 카드를 낼 때 만든다(렌더 중에 무작위 값을 만들지 않게)
  let gatePrefix = "";

  const set = (p: TurnPhase) => {
    if (p === phase) return;
    phase = p;
    deps.onPhase(p);
  };
  const busy = () => phase === "thinking" || phase === "replaying";
  const reply = (re: string, lang: Lang, result: "plan" | "clarify" | "reject" | "error" | "busy", say: string, taps?: number, followSpoken?: boolean) => {
    lastLang = lang;
    deps.send({ type: "reply", re, say, replyLanguage: lang, result, ...(taps !== undefined && { taps }), ...(followSpoken && { followSpoken }) });
  };
  const clearGate = () => {
    waitingFor = null;
    waitingKind = null;
    waitingGateId = null;
    waitingCard = null;
  };

  async function replay(re: string, lang: Lang, events: E[], done: Done) {
    set("replaying");
    let ok = false;
    try {
      ok = await deps.play(events);
    } catch (e) {
      console.error("KIBO replay threw", e);
    }
    lastLang = lang;
    if (ok) {
      // 카드마다 새 id. 휴대폰은 확인할 때 이 id를 돌려보낸다
      gatePrefix ||= Math.random().toString(36).slice(2, 8);
      const gate = done.gate ? { ...done.gate, id: `${gatePrefix}-g${++gateSeq}` } : null;
      deps.send({ type: "done", re, ok: true, say: done.say, replyLanguage: lang, gate, ...(done.paymentHandoff !== undefined && { paymentHandoff: done.paymentHandoff }), ...(done.payButton && { payButton: done.payButton }) });
      clearGate();
      if (gate && gate.kind !== "done") {
        waitingFor = gate.what;
        waitingKind = gate.kind;
        waitingGateId = gate.id;
        waitingButton = gate.button ?? "";
        waitingCard = gate;
      }
    } else {
      deps.send({ type: "done", re, ok: false, say: phrases.failed[lang], replyLanguage: lang, gate: null });
      clearGate();
    }
  }

  // 한 턴을 끝내고 기다리던 말을 처리한다
  function end() {
    current = null;
    set(waitingFor ? "waiting_gate" : "idle");
    const q = queued;
    queued = null;
    if (q) void run(q);
  }

  async function run(h: Heard & { id: string }) {
    current = h.text;
    // 확인 관문을 기다리다 들은 말인가(누를 것이 없으면 확인 방법을 알려 준다)
    const atGate = waitingFor && waitingKind === "ack" ? { what: waitingFor, button: waitingButton } : null;
    clearGate();
    set("thinking");
    let lang = langOf(h.lang);
    let u: Understood<E> | null = null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), THINK_TIMEOUT_MS);
    const slow = setTimeout(() => {
      deps.send({ type: "slow", re: h.id, say: phrases.slow[lang], replyLanguage: lang });
      deps.onSlow?.();
    }, SLOW_MS);
    try {
      u = await Promise.race([deps.understand(h.text, ctrl.signal), aborted(ctrl.signal)]);
    } catch (e) {
      console.error("KIBO understand failed", e);
    } finally {
      clearTimeout(timer);
      clearTimeout(slow);
    }
    if (!u) reply(h.id, lang, "error", phrases.error[lang]);
    else {
      lang = langOf(u.lang);
      if (u.kind === "clarify") reply(h.id, lang, "clarify", u.say, undefined, u.followSpoken);
      // 서버가 이유에 값(예: 발매기 시각)을 넣은 고정 문구를 보냈으면 그것을 쓴다
      else if (u.kind === "reject") reply(h.id, lang, "reject", u.say ?? rejectSay(u.reason, lang), undefined, u.followSpoken);
      else {
        const n = u.events.length;
        reply(h.id, lang, "plan", planSay(n, lang, atGate), n, u.followSpoken);
        await replay(h.id, lang, u.events, u.done);
      }
    }
    end();
  }

  async function proceed(what: string, re = `gate:${what}`) {
    let r: Resumed<E> | null = null;
    try {
      r = deps.resume(what);
    } catch (e) {
      console.error("KIBO resume threw", e);
    }
    clearGate();
    if (r) await replay(re, langOf(r.lang), r.events, r.done);
    end();
  }

  return {
    rebind(next: Omit<TurnDeps<E>, "onPhase" | "onSlow">) {
      deps = { ...next, onPhase: deps.onPhase, onSlow: deps.onSlow };
    },
    phase: () => phase,
    busy,
    hear(h: Heard) {
      const id = h.id ?? `local-${++seq}`;
      if (seen.has(id)) return;
      seen.add(id);
      const lang = langOf(h.lang);
      // 엿들은 제3자나 끊긴 동안 쌓인 옛 '네'가 다른 카드를 열지 않게, 지금 카드 id를 가진 '예'만 동의로 받는다
      if (phase === "waiting_gate" && waitingKind === "ack" && waitingFor && h.gateId !== undefined && h.gateId === waitingGateId && isYes(h.text)) {
        reply(id, lang, "plan", phrases.ok[lang], 0);
        void proceed(waitingFor, id);
        return;
      }
      if (busy()) {
        if (current !== null && norm(current) === norm(h.text)) reply(id, lang, "busy", phrases.same[lang]);
        else if (!queued) queued = { ...h, id };
        else reply(id, lang, "busy", phrases.full[lang]);
        return;
      }
      void run({ ...h, id });
    },
    waitingFor: () => waitingFor,
    gateId: () => waitingGateId,
    card: () => waitingCard,
    // 사람이 관문을 넘겼다. 휴대폰 확인은 지금 떠 있는 카드의 id(gateId)가 맞아야 받는다.
    // 여권 스캔(device)은 키오스크 기기가 직접 알리는 사건이라 id 없이 받는다
    ack(what: string, gateId?: string) {
      const fresh = phase === "waiting_gate" && waitingFor === what && (waitingKind === "device" || (gateId !== undefined && gateId === waitingGateId));
      if (fresh) {
        void proceed(what);
        return;
      }
      // 휴대폰에서 온 확인을 버렸으면 그 사실을 알린다. 확인마다 대답은 한 번(re가 겹치지 않게 번호를 붙인다)
      if (what !== "passport") reply(`ack:${gateId ?? "none"}:${++seq}`, lastLang, "busy", phrases.stale[lastLang]);
    },
    // 사람이 화면을 직접 만졌다. 기다리던 관문은 더 이상 믿을 수 없다
    touched() {
      if (phase === "waiting_gate") {
        clearGate();
        set("idle");
      }
    },
  };
}

export type Turn = ReturnType<typeof createTurn>;
