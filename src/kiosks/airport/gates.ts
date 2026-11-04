// 사람이 해야 하는 관문의 안내문. 규정 내용이 섞여 있어 Spark가 만들지 않고 고정 번역문을 쓴다.
// 언어는 휴대폰이 지원하는 6개(영·한·일·베트남·중·스페인)이고, 그 밖의 언어는 영어로 보낸다.

import { langOf } from "@/engine/turn";
import { airlines, BAG_ALLOWANCE } from "./booking";
import type { AirportIntent, Missing, Stop } from "./planner";

export type GateLang = "en" | "ko" | "ja" | "vi" | "zh" | "es";
type Texts = Record<GateLang, string>;

// 언어 코드('zh-CN')와 언어 이름('Chinese')을 모두 turn.ts와 같이 읽는다
export const gateLang = (code: string | undefined): GateLang => langOf(code);

const dangerousGoods: Texts = {
  en: "Before check-in, you must confirm this yourself. No explosives, flammable, toxic or radioactive items in any bag. Power banks, spare batteries and lighters cannot go in checked bags. Knives, tools and bats cannot go in the cabin. Say “yes” or tap “I confirm”.",
  ko: "체크인 전에 본인이 직접 확인해야 해요. 폭발물·인화성·독성·방사성 물질은 어떤 짐에도 넣을 수 없어요. 보조배터리·여분 배터리·라이터는 부치는 짐에 넣을 수 없어요. 칼·공구·방망이는 기내에 들고 탈 수 없어요. 확인하셨으면 \"네\"라고 말하거나 [확인했어요]를 눌러 주세요.",
  ja: "チェックインの前に、ご本人の確認が必要です。爆発物・引火性・毒性・放射性の物品はどの荷物にも入れられません。モバイルバッテリー・予備電池・ライターは預け荷物に入れられません。刃物・工具・バットは機内に持ち込めません。確認したら「はい」と言うか、［確認しました］を押してください。",
  vi: "Trước khi làm thủ tục, bạn phải tự xác nhận. Không mang chất nổ, chất dễ cháy, chất độc hay phóng xạ trong bất kỳ hành lý nào. Sạc dự phòng, pin rời và bật lửa không được để trong hành lý ký gửi. Dao, dụng cụ và gậy không được mang lên khoang máy bay. Hãy nói “có” hoặc bấm “Tôi xác nhận”.",
  zh: "办理值机前，需要您本人确认。任何行李中都不能有爆炸物、易燃、有毒或放射性物品。充电宝、备用电池和打火机不能放进托运行李。刀具、工具和球棒不能带进客舱。确认后请说“是”或点击“我已确认”。",
  es: "Antes de facturar, debe confirmarlo usted mismo. No lleve explosivos ni artículos inflamables, tóxicos o radiactivos en ningún equipaje. Las baterías externas, baterías de repuesto y encendedores no pueden ir en el equipaje facturado. Cuchillos, herramientas y bates no pueden ir en cabina. Diga «sí» o pulse «Lo confirmo».",
};

// 위험물 카드 끝에 붙이는 보조배터리 요약. 숫자는 키오스크 보조배터리 카드(Check 1)와 같다.
// 현행 규정: 국토교통부 2026-04-08 발표, 2026-04-20 시행 — 1인당 최대 2개(160Wh / 약 4만 3000mAh 이하), 보조배터리로 다른 기기 충전 전면 금지
// 출처 https://www.korea.kr/news/policyNewsView.do?newsId=148962298
const powerBank: Texts = {
  en: "Power banks go in the cabin only, up to 2 per person (160Wh or less). Over 160Wh is not allowed, and you can't charge other devices from a power bank on board.",
  ko: "보조배터리는 기내에만, 1인당 최대 2개(160Wh 이하)까지 가져갈 수 있어요. 160Wh를 넘으면 실을 수 없고, 기내에서 보조배터리로 다른 기기를 충전할 수 없어요.",
  ja: "モバイルバッテリーは機内持ち込みのみ、1人2個まで（160Wh以下）です。160Whを超えるものは持ち込めず、機内でモバイルバッテリーから他の機器を充電することはできません。",
  vi: "Sạc dự phòng chỉ mang lên khoang, tối đa 2 cái mỗi người (từ 160Wh trở xuống). Trên 160Wh không được mang, và trên máy bay không được dùng sạc dự phòng để sạc thiết bị khác.",
  zh: "充电宝只能随身带进客舱，每人最多2个（160Wh以下）。超过160Wh不能携带，机上禁止用充电宝给其他设备充电。",
  es: "Las baterías externas solo van en cabina, máximo 2 por persona (160Wh o menos). No se permiten de más de 160Wh, y a bordo no se pueden cargar otros dispositivos con una batería externa.",
};

// dangerousGoods 각 문구의 마지막 문장(확인 방법)이 시작하는 말
const askStart: Texts = { en: "Say “yes”", ko: "확인하셨으면", ja: "確認したら", vi: "Hãy nói", zh: "确认后", es: "Diga «sí»" };

const passportSelf: Texts = {
  en: "Now put your passport in the reader below the screen, photo page facing down. Take the cover off first.",
  ko: "이제 화면 아래 여권 리더기에 여권을 넣어 주세요. 커버를 벗기고 사진면이 아래를 향하게요.",
  ja: "画面の下のリーダーにパスポートを入れてください。カバーを外し、顔写真のページを下に向けてください。",
  vi: "Bây giờ hãy đặt hộ chiếu vào máy đọc bên dưới màn hình, trang ảnh úp xuống. Hãy tháo bìa bọc trước.",
  zh: "请把护照放进屏幕下方的读取器，照片页朝下。请先取下护照套。",
  es: "Ahora coloque su pasaporte en el lector bajo la pantalla, con la página de la foto hacia abajo. Quite primero la funda.",
};

const passportCompanion: Texts = {
  en: "Now the passport of the person traveling with you, the same way.",
  ko: "이제 함께 가시는 분의 여권도 같은 방법으로 넣어 주세요.",
  ja: "次に、同行の方のパスポートも同じように入れてください。",
  vi: "Tiếp theo, đặt hộ chiếu của người đi cùng theo cách tương tự.",
  zh: "接下来，请用同样的方法放入同行人的护照。",
  es: "Ahora el pasaporte de su acompañante, de la misma forma.",
};

const confirmCheckin: Texts = {
  en: "Seats {seats}, {bags} checked bag(s). Shall I confirm check-in? Say “yes” or tap “Confirm”.",
  ko: "좌석 {seats}, 부치는 짐 {bags}개예요. 체크인을 확정할까요? \"네\"라고 말하거나 [확정]을 눌러 주세요.",
  ja: "座席は{seats}、預け荷物は{bags}個です。チェックインを確定しますか？「はい」と言うか［確定］を押してください。",
  vi: "Ghế {seats}, {bags} kiện hành lý ký gửi. Xác nhận làm thủ tục nhé? Hãy nói “có” hoặc bấm “Xác nhận”.",
  zh: "座位 {seats}，托运行李 {bags} 件。要确认值机吗？请说“是”或点击“确认”。",
  es: "Asientos {seats}, {bags} maleta(s) facturada(s). ¿Confirmo la facturación? Diga «sí» o pulse «Confirmar».",
};

// 확정 카드 뒤에 붙인다: 1인 허용량을 넘는 짐이 있을 때
const excessFee: Texts = {
  en: "Fees for bags over the allowance will be explained at the counter.",
  ko: "허용량을 넘는 짐의 추가 요금은 카운터에서 안내해 드려요.",
  ja: "許容量を超える荷物の追加料金は、カウンターでご案内します。",
  vi: "Phí cho hành lý vượt mức cho phép sẽ được hướng dẫn tại quầy.",
  zh: "超出免费额度的行李费用将在柜台为您说明。",
  es: "Los cargos por equipaje que supere la franquicia se le indicarán en el mostrador.",
};

const doneWithBag: Texts = {
  en: "Check-in is done. Take your boarding passes and bag tag from the kiosk, and attach the tag to your bag.",
  ko: "체크인이 끝났어요. 키오스크에서 탑승권과 수하물 태그를 가져가시고, 태그는 가방에 붙여 주세요.",
  ja: "チェックインが完了しました。キオスクから搭乗券と手荷物タグを受け取り、タグを荷物に付けてください。",
  vi: "Đã làm thủ tục xong. Hãy lấy thẻ lên máy bay và thẻ hành lý từ máy, rồi gắn thẻ vào hành lý.",
  zh: "值机完成。请从自助机取走登机牌和行李牌，并把行李牌贴在行李上。",
  es: "Facturación completada. Recoja sus tarjetas de embarque y la etiqueta del equipaje, y péguela en su maleta.",
};

const doneNoBag: Texts = {
  en: "Check-in is done. Take your boarding passes from the kiosk.",
  ko: "체크인이 끝났어요. 키오스크에서 탑승권을 가져가세요.",
  ja: "チェックインが完了しました。キオスクから搭乗券を受け取ってください。",
  vi: "Đã làm thủ tục xong. Hãy lấy thẻ lên máy bay từ máy.",
  zh: "值机完成。请从自助机取走登机牌。",
  es: "Facturación completada. Recoja sus tarjetas de embarque.",
};

const noSeats: Texts = {
  en: "I couldn't find seats that match, so your seats stay as they are. Counter staff can help.",
  ko: "원하시는 빈자리를 찾지 못해 좌석은 그대로 두었어요. 카운터 직원이 도와드릴 수 있어요.",
  ja: "ご希望の空席が見つからなかったので、座席はそのままです。カウンターの係員がお手伝いできます。",
  vi: "Không tìm được ghế phù hợp nên ghế vẫn giữ nguyên. Nhân viên quầy có thể giúp bạn.",
  zh: "没有找到合适的空座位，所以座位保持不变。柜台工作人员可以帮您。",
  es: "No encontré asientos que encajen, así que sus asientos no cambian. El personal del mostrador puede ayudarle.",
};

const ackButton: Texts = { en: "I confirm", ko: "확인했어요", ja: "確認しました", vi: "Tôi xác nhận", zh: "我已确认", es: "Lo confirmo" };
const confirmButton: Texts = { en: "Confirm", ko: "확정", ja: "確定", vi: "Xác nhận", zh: "确认", es: "Confirmar" };

export interface Gate {
  kind: "ack" | "device" | "done";
  what: "dangerous_goods" | "passport" | "confirm_checkin" | "printing";
  text: string;
  // 휴대폰에 보일 큰 버튼 (ack 관문만)
  button?: string;
}

// 계획이 멈춘 곳을 사람에게 알릴 문구. stop이 null이면 발급까지 간 것이다
export function gateFor(stop: Stop | null, code: string, bagsTotal: number): Gate {
  const l = gateLang(code);
  if (!stop) return { kind: "done", what: "printing", text: (bagsTotal > 0 ? doneWithBag : doneNoBag)[l] };
  if (stop.kind === "device") return { kind: "device", what: "passport", text: (stop.who === "self" ? passportSelf : passportCompanion)[l] };
  if (stop.what === "dangerous_goods") {
    // 보조배터리 요약은 마지막 문장("네"라고 말하거나 …) 앞에 넣어, 할 일이 맨 끝에 오게 한다
    const dg = dangerousGoods[l];
    const at = dg.indexOf(askStart[l]);
    return { kind: "ack", what: "dangerous_goods", text: `${dg.slice(0, at)}${powerBank[l]} ${dg.slice(at)}`, button: ackButton[l] };
  }
  const seats = Object.values(stop.seats).join("·");
  const bags = Object.values(stop.bags).reduce((a, b) => a + b, 0);
  const excess = Object.values(stop.bags).some((n) => n > BAG_ALLOWANCE);
  const text = confirmCheckin[l].replace("{seats}", seats).replace("{bags}", String(bags)) + (excess ? ` ${excessFee[l]}` : "");
  return { kind: "ack", what: "confirm_checkin", text, button: confirmButton[l] };
}

export const noSeatsText = (code: string) => noSeats[gateLang(code)];
// Spark 프롬프트의 사실(보조배터리 질문에 답한다). 위험물 카드와 같은 문장
export const powerBankText = (code: string) => powerBank[gateLang(code)];

// 되묻기 고정 문구: Spark 되묻기 문장이 다른 언어 문자를 섞었을 때 대신 쓴다. 알아들은 항공사 이름을 넣어 다른 항공사로 바꿔 알아들은 일이 보이게 한다
const airlineHead: Texts = {
  en: "Checking in with {a}.",
  ko: "{a} 체크인을 도와드릴게요.",
  ja: "{a}のチェックインをお手伝いします。",
  vi: "Tôi sẽ giúp làm thủ tục {a}.",
  zh: "为您办理 {a} 的值机。",
  es: "Le ayudo a facturar con {a}.",
};
const ask: Record<GateLang, { head: string; sep: string; end: string; item: Record<Missing, string> }> = {
  en: { head: "Please tell me: ", sep: ", ", end: ".", item: { airline: "airline", travelers: "number of travelers", bags: "number of checked bags" } },
  ko: { head: "알려 주세요: ", sep: ", ", end: ".", item: { airline: "항공사", travelers: "체크인할 인원", bags: "부치는 짐 개수" } },
  ja: { head: "教えてください：", sep: "、", end: "。", item: { airline: "航空会社", travelers: "チェックインする人数", bags: "預ける荷物の数" } },
  vi: { head: "Xin cho biết: ", sep: ", ", end: ".", item: { airline: "hãng hàng không", travelers: "số người làm thủ tục", bags: "số kiện hành lý ký gửi" } },
  zh: { head: "请告诉我：", sep: "、", end: "。", item: { airline: "航空公司", travelers: "办理值机的人数", bags: "托运行李件数" } },
  es: { head: "Dígame, por favor: ", sep: ", ", end: ".", item: { airline: "aerolínea", travelers: "número de pasajeros", bags: "número de maletas facturadas" } },
};

export function clarifySay(missing: Missing[], intent: AirportIntent, code: string) {
  const l = gateLang(code);
  const airline = airlines.find((a) => a.id === intent.airline)?.name[l === "ko" ? "ko" : "en"];
  const a = ask[l];
  // 일본어·중국어는 문장 사이에 공백을 두지 않는다
  return [...(airline ? [airlineHead[l].replace("{a}", airline)] : []), a.head + missing.map((m) => a.item[m]).join(a.sep) + a.end].join(l === "ja" || l === "zh" ? "" : " ");
}

// 계획 앞에 말할 알아들은 내용(항공사·인원·좌석 바람·부칠 짐). 아는 것만 말하고, 하나도 없으면 빈 문자열.
// 11/4 판정: 관문에서 "아 아니 두 명이요"에 확인 방법만 되풀이해 고친 값을 받았는지 알 수 없었다
// solo: 혼자일 때 좌석 바람(나란히는 말하지 않는다)
const leadText: Record<GateLang, { people: (n: number) => string; seats: Record<NonNullable<AirportIntent["seats"]>, string>; solo: { window: string; aisle: string }; bags: (n: number) => string; sep: string; end: string }> = {
  en: { people: (n) => `${n} ${n > 1 ? "travelers" : "traveler"}`, seats: { together: "seats together", window: "together with a window seat", aisle: "together with an aisle seat", keep: "seats unchanged" }, solo: { window: "window seat", aisle: "aisle seat" }, bags: (n) => (n ? `${n} checked ${n > 1 ? "bags" : "bag"}` : "no checked bags"), sep: ", ", end: "." },
  ko: { people: (n) => `${n}명`, seats: { together: "나란히", window: "창가 쪽 나란히", aisle: "통로 쪽 나란히", keep: "좌석 그대로" }, solo: { window: "창가 자리", aisle: "통로 자리" }, bags: (n) => (n ? `부치는 짐 ${n}개` : "부치는 짐 없음"), sep: ", ", end: "." },
  ja: { people: (n) => `${n}名`, seats: { together: "隣同士", window: "窓側で隣同士", aisle: "通路側で隣同士", keep: "座席はそのまま" }, solo: { window: "窓側の席", aisle: "通路側の席" }, bags: (n) => (n ? `預け荷物${n}個` : "預け荷物なし"), sep: "、", end: "。" },
  vi: { people: (n) => `${n} người`, seats: { together: "ngồi cạnh nhau", window: "ngồi cạnh nhau, có ghế cửa sổ", aisle: "ngồi cạnh nhau, có ghế lối đi", keep: "giữ nguyên ghế" }, solo: { window: "ghế cửa sổ", aisle: "ghế lối đi" }, bags: (n) => (n ? `${n} kiện ký gửi` : "không ký gửi hành lý"), sep: ", ", end: "." },
  zh: { people: (n) => `${n}人`, seats: { together: "坐在一起", window: "靠窗坐在一起", aisle: "靠过道坐在一起", keep: "座位不变" }, solo: { window: "靠窗座位", aisle: "靠过道座位" }, bags: (n) => (n ? `托运行李${n}件` : "无托运行李"), sep: "、", end: "。" },
  es: { people: (n) => `${n} ${n > 1 ? "pasajeros" : "pasajero"}`, seats: { together: "juntos", window: "juntos, con ventanilla", aisle: "juntos, con pasillo", keep: "mismos asientos" }, solo: { window: "ventanilla", aisle: "pasillo" }, bags: (n) => (n ? `${n} ${n > 1 ? "maletas facturadas" : "maleta facturada"}` : "sin maletas facturadas"), sep: ", ", end: "." },
};

export function checkinLead(intent: AirportIntent, code: string) {
  const l = gateLang(code);
  const t = leadText[l];
  const airline = airlines.find((a) => a.id === intent.airline)?.name[l === "ko" ? "ko" : "en"];
  const seat = !intent.seats ? "" : intent.travelers !== 1 || intent.seats === "keep" ? t.seats[intent.seats] : intent.seats === "together" ? "" : t.solo[intent.seats];
  const parts = [airline, intent.travelers ? t.people(intent.travelers) : "", seat, intent.bags !== undefined ? t.bags(intent.bags) : ""].filter(Boolean);
  if (!parts.length) return "";
  const s = parts.join(t.sep) + t.end;
  return s[0].toUpperCase() + s.slice(1);
}
