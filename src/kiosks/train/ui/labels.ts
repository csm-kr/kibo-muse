// 결정적 장면에서 사람이 읽는 이름: Spark가 알아들은 것(의도 칩)과 휴대폰에 보일 단계 이름·요약(기차).

import { langOf, type Lang } from "@/engine/turn";
import type { Screen } from "../machine";
import type { Stop, TrainIntent } from "../planner";
import { findStation, type Lang as KioskLang } from "../rail";
import { t } from "./strings";

export interface Chip {
  text: string;
  tone: "normal" | "blocked";
}

const seatText = { together: "Seats together", window: "Window seats", aisle: "Aisle seats", auto: "Any seats" };
const typeText = { express: "Express", local: "Local", any: "Any train" };
const dayText = (d: number) => (d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`);
const pl = (n: number, one: string) => `${n} ${one}${n > 1 ? "s" : ""}`;
// pay: 키오스크 결제 버튼의 화면 글자(키오스크 언어 그대로)
const stopText = (s: Stop, pay: string) => (s.kind === "ack" ? `Later train ${s.dep} → you confirm` : s.kind === "device" ? "Card → you insert" : `${pay} → you tap`);

// lang: 키오스크 화면 언어. 칩은 영어지만 버튼 이름만 키오스크 화면 글자 그대로 쓴다
export function intentChips(intent: TrainIntent, stop: Stop | null, lang: KioskLang): Chip[] {
  const people = [intent.adults ? pl(intent.adults, "adult") : "", intent.children ? pl(intent.children, "child").replace("childs", "children") : "", intent.seniors ? pl(intent.seniors, "senior") : ""].filter(Boolean).join(" · ");
  const texts = [
    ...(intent.from ? [`${findStation(intent.from)?.name.en} →`] : []),
    ...(intent.to ? [`→ ${findStation(intent.to)?.name.en}`] : []),
    ...(intent.day !== undefined || intent.hour !== undefined ? [[intent.day !== undefined ? dayText(intent.day) : "", intent.hour !== undefined ? `${String(intent.hour).padStart(2, "0")}:${String(intent.minute ?? 0).padStart(2, "0")}` : ""].filter(Boolean).join(" ")] : []),
    ...(people ? [people] : []),
    ...(intent.trainType ? [typeText[intent.trainType]] : []),
    ...(intent.seatClass === "first" ? ["First class"] : []),
    ...(intent.seats ? [seatText[intent.seats]] : []),
  ];
  const chips: Chip[] = texts.map((text) => ({ text, tone: "normal" }));
  if (stop) chips.push({ text: stopText(stop, t.pay[lang]), tone: "blocked" });
  return chips;
}

// 휴대폰 상태 줄의 단계 이름(휴대폰의 6개 언어)
export const screenLabel: Record<Screen, Record<Lang, string>> = {
  idle: { en: "Start", ko: "첫 화면", ja: "スタート", vi: "Bắt đầu", zh: "开始", es: "Inicio" },
  journey: { en: "Trip details", ko: "여정 입력", ja: "乗車内容の入力", vi: "Thông tin chuyến đi", zh: "填写行程", es: "Datos del viaje" },
  station: { en: "Choose station", ko: "역 고르기", ja: "駅を選ぶ", vi: "Chọn ga", zh: "选择车站", es: "Elegir estación" },
  datetime: { en: "Date & time", ko: "가는 날·시각", ja: "日付と時刻", vi: "Ngày & giờ", zh: "日期和时间", es: "Fecha y hora" },
  passengers: { en: "Passengers", ko: "인원", ja: "人数", vi: "Số hành khách", zh: "人数", es: "Pasajeros" },
  train_list: { en: "Train list", ko: "열차 목록", ja: "列車一覧", vi: "Danh sách chuyến tàu", zh: "列车列表", es: "Lista de trenes" },
  train_info: { en: "Train details", ko: "열차 정보", ja: "列車の詳細", vi: "Thông tin chuyến tàu", zh: "列车信息", es: "Detalles del tren" },
  seat_select: { en: "Seat map", ko: "좌석 고르기", ja: "座席表", vi: "Sơ đồ ghế", zh: "选座", es: "Mapa de asientos" },
  reservation: { en: "Reserved · you pay", ko: "예약 확인 · 직접 결제", ja: "予約確認 · お支払いはご自身で", vi: "Đã giữ chỗ · bạn tự thanh toán", zh: "已预订 · 请您付款", es: "Reservado · usted paga" },
  pay_method: { en: "Payment method", ko: "결제 수단", ja: "支払い方法", vi: "Phương thức thanh toán", zh: "支付方式", es: "Forma de pago" },
  card_insert: { en: "Insert card", ko: "카드 넣기", ja: "カードを挿入", vi: "Đưa thẻ vào", zh: "插入卡", es: "Inserte la tarjeta" },
  printing: { en: "Printing tickets", ko: "승차권 발권 중", ja: "乗車券を発券中", vi: "Đang in vé", zh: "正在出票", es: "Imprimiendo billetes" },
  complete: { en: "Tickets ready", ko: "발권 완료", ja: "発券完了", vi: "Đã in vé xong", zh: "出票完成", es: "Billetes listos" },
};

// 휴대폰 상태 줄의 요약: 도착역과 정한 좌석(휴대폰 언어)
const carWord: Record<Lang, (car: string) => string> = { en: (c) => `Car ${c}`, ko: (c) => `${c}호차`, ja: (c) => `${c}号車`, vi: (c) => `Toa ${c}`, zh: (c) => `${c}号车厢`, es: (c) => `Coche ${c}` };
// ["7-1A", "7-1B"] → "7호차 1A·1B" (호차마다 묶는다)
export function seatsText(seats: string[], l: Lang) {
  const byCar = new Map<string, string[]>();
  for (const id of seats) {
    const [car, rest] = id.split("-");
    byCar.set(car, [...(byCar.get(car) ?? []), rest]);
  }
  return [...byCar].map(([car, xs]) => `${carWord[l](car)} ${xs.join("·")}`).join(", ");
}
export function statusSummary(to: string | null, seats: string[], language: string) {
  const l = langOf(language);
  const st = to ? findStation(to) : undefined;
  if (!st) return "";
  const name = l === "ko" ? st.name.ko : st.name.en;
  return seats.length ? `${name} · ${seatsText(seats, l)}` : name;
}
