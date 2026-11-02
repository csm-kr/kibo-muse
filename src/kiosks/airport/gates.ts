// 사람이 해야 하는 관문의 안내문. 규정 내용이 섞여 있어 Spark가 만들지 않고 고정 번역문을 쓴다.
// 언어는 휴대폰이 지원하는 6개(영·한·일·베트남·중·스페인)이고, 그 밖의 언어는 영어로 보낸다.

import { BAG_ALLOWANCE } from "./booking";
import type { Stop } from "./planner";

export type GateLang = "en" | "ko" | "ja" | "vi" | "zh" | "es";
type Texts = Record<GateLang, string>;

export const gateLang = (code: string | undefined): GateLang => {
  const k = (code ?? "").toLowerCase().slice(0, 2);
  return (["en", "ko", "ja", "vi", "zh", "es"] as const).find((l) => l === k) ?? "en";
};

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
