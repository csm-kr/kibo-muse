// 기차 발매기에서 사람이 해야 하는 관문의 휴대폰 카드와 되묻기·좌석 알림. Spark가 만들지 않고 고정 번역문을 쓴다(6개 언어).
// 결제하기·결제 수단은 카드 없이 휴대폰의 결제 넘기기 안내(paymentHandoff)로 알린다.

import { langOf, type Lang } from "@/engine/turn";
import type { LinkGate } from "@/sync/link";
import type { Missing, Stop } from "./planner";
import { trainByNo } from "./machine";
import { trainName } from "./rail";

const later: Record<Lang, { text: string; button: string }> = {
  en: { text: "The nearest train with free seats is {train}, leaving at {dep}, more than an hour after the time you asked. To take it, say “yes” or tap “Take this train”.", button: "Take this train" },
  ko: { text: "원하신 시각보다 1시간 넘게 늦은 {dep} 출발 {train}이 가장 가까운 빈자리 열차예요. 이 열차로 하시려면 \"네\"라고 말하거나 [이 열차로 할게요]를 눌러 주세요.", button: "이 열차로 할게요" },
  ja: { text: "ご希望の時刻より1時間以上遅い{dep}発の{train}が、空席のある最も早い列車です。この列車にする場合は「はい」と言うか、［この列車にします］を押してください。", button: "この列車にします" },
  vi: { text: "Chuyến gần nhất còn chỗ là {train}, khởi hành lúc {dep}, muộn hơn giờ bạn muốn hơn một tiếng. Nếu muốn đi chuyến này, hãy nói “có” hoặc bấm “Đi chuyến này”.", button: "Đi chuyến này" },
  zh: { text: "有空座的最近一趟是{dep}出发的{train}，比您要的时间晚一个多小时。要坐这趟，请说“是”或点击“就坐这趟”。", button: "就坐这趟" },
  es: { text: "El tren más cercano con plazas libres es el {train}, que sale a las {dep}, más de una hora después de la hora que pidió. Para tomarlo, diga «sí» o pulse «Tomar este tren».", button: "Tomar este tren" },
};

const card: Record<Lang, string> = {
  en: "Insert your card into the card reader below the screen. KIBO never pays for you.",
  ko: "화면 아래 카드 단말기에 카드를 직접 넣어 주세요. KIBO는 결제하지 않아요.",
  ja: "画面下のカード端末にカードをご自身で挿入してください。KIBOは支払いをしません。",
  vi: "Hãy tự đưa thẻ vào máy đọc thẻ bên dưới màn hình. KIBO không bao giờ thanh toán thay bạn.",
  zh: "请您自己把卡插入屏幕下方的读卡器。KIBO 不会替您付款。",
  es: "Inserte usted la tarjeta en el lector bajo la pantalla. KIBO nunca paga por usted.",
};

export function trainGate(stop: Stop | null, language: string): LinkGate | null {
  const l = langOf(language);
  if (stop?.kind === "ack") {
    const name = trainName(trainByNo(stop.trainNo))[l === "ko" ? "ko" : "en"];
    return { kind: "ack", what: stop.what, button: later[l].button, text: later[l].text.replace("{train}", name).replace("{dep}", stop.dep) };
  }
  if (stop?.kind === "device") return { kind: "device", what: stop.what, text: card[l] };
  return null;
}

// 되묻기: 빠진 항목만 나열한다(Spark 문장은 역 이름을 틀리게 쓸 수 있다). 어린이만 남았으면 어린이만 타는 표인지 묻는다
const childOnly: Record<Lang, string> = {
  en: "Should I book tickets for children only? If an adult is travelling with them, please tell me.",
  ko: "어린이만 타는 표로 예매할까요? 함께 타는 어른이 있으면 말씀해 주세요.",
  ja: "お子さまだけのきっぷで予約しますか？一緒に乗る大人がいる場合は教えてください。",
  vi: "Đặt vé chỉ cho trẻ em thôi phải không? Nếu có người lớn đi cùng, xin hãy cho biết.",
  zh: "只为儿童订票吗？如果有大人同行，请告诉我。",
  es: "¿Reservo billetes solo para niños? Si viaja un adulto con ellos, dígamelo.",
};

const ask: Record<Lang, { head: string; sep: string; end: string; item: Record<Exclude<Missing, "child_only">, string> }> = {
  en: { head: "Please tell me: ", sep: ", ", end: ".", item: { to: "destination", date: "date and time", passengers: "number of people" } },
  ko: { head: "알려 주세요: ", sep: ", ", end: ".", item: { to: "도착역", date: "날짜와 시각", passengers: "인원" } },
  ja: { head: "教えてください：", sep: "、", end: "。", item: { to: "行き先", date: "日付と時刻", passengers: "人数" } },
  vi: { head: "Xin cho biết: ", sep: ", ", end: ".", item: { to: "ga đến", date: "ngày và giờ", passengers: "số người" } },
  zh: { head: "请告诉我：", sep: "、", end: "。", item: { to: "目的地", date: "日期和时间", passengers: "人数" } },
  es: { head: "Dígame, por favor: ", sep: ", ", end: ".", item: { to: "destino", date: "fecha y hora", passengers: "número de personas" } },
};

export function clarifySay(missing: Missing[], language: string) {
  if (missing.includes("child_only")) return childOnly[langOf(language)];
  const a = ask[langOf(language)];
  return a.head + missing.map((m) => a.item[m as Exclude<Missing, "child_only">]).join(a.sep) + a.end;
}

// 원하는 좌석 배치(나란히·창가·통로)를 찾지 못해 발매기 자동 배정으로 예약했을 때의 알림
const seatsApart: Record<Lang, string> = {
  en: "The seat arrangement you wanted wasn't available, so the machine assigned seats. Please check them on the screen.",
  ko: "원하신 좌석 배치가 없어 발매기가 자리를 정했어요. 화면에서 좌석을 확인해 주세요.",
  ja: "ご希望の座席の並びが空いていなかったため、券売機が席を決めました。画面で座席を確認してください。",
  vi: "Không còn ghế theo cách bạn muốn nên máy đã tự xếp ghế. Xin hãy kiểm tra ghế trên màn hình.",
  zh: "没有您想要的座位排法，所以由售票机分配了座位。请在屏幕上确认座位。",
  es: "No había asientos como los quería, así que la máquina los asignó. Revíselos en la pantalla.",
};

export const seatNote = (notes: string[], language: string) => (notes.includes("no_matching_seats") ? seatsApart[langOf(language)] : "");
