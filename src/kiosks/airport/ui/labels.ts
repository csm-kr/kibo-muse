// 결정적 장면에서 사람이 읽는 이름: Spark가 알아들은 것(의도 칩)과 휴대폰에 보일 단계 이름.

import { langOf, type Lang } from "@/engine/turn";
import { airlines } from "../booking";
import type { Screen } from "../machine";
import type { AirportIntent, Stop } from "../planner";

export interface Chip {
  text: string;
  tone: "normal" | "blocked";
}

const seatText = { together: "Seats together", window: "Window seats", aisle: "Aisle seats", keep: "Keep seats" };
const stopText = (s: Stop) => (s.kind === "device" ? "Passport → you scan" : s.what === "dangerous_goods" ? "Dangerous goods → you confirm" : "Check-in → you confirm");

export function intentChips(intent: AirportIntent, stop: Stop | null): Chip[] {
  const texts = [
    ...(intent.airline ? [airlines.find((a) => a.id === intent.airline)?.name.en ?? intent.airline] : []),
    ...(intent.travelers ? [`${intent.travelers} traveler${intent.travelers > 1 ? "s" : ""}`] : []),
    ...(intent.seats ? [seatText[intent.seats]] : []),
    ...(intent.bags !== undefined ? [intent.bags === 0 ? "No checked bags" : `${intent.bags} checked bag${intent.bags > 1 ? "s" : ""}`] : []),
  ];
  const chips: Chip[] = texts.map((text) => ({ text, tone: "normal" }));
  if (stop) chips.push({ text: stopText(stop), tone: "blocked" });
  return chips;
}

// 휴대폰 상태 줄의 단계 이름(휴대폰의 6개 언어)
export const screenLabel: Record<Screen, Record<Lang, string>> = {
  idle: { en: "Choose airline", ko: "항공사 고르기", ja: "航空会社を選ぶ", vi: "Chọn hãng bay", zh: "选择航空公司", es: "Elegir aerolínea" },
  dangerous_goods: { en: "Dangerous goods · you confirm", ko: "위험물 안내 · 직접 확인", ja: "危険物の案内 · ご自身で確認", vi: "Hàng nguy hiểm · bạn tự xác nhận", zh: "危险品须知 · 请您确认", es: "Mercancías peligrosas · confirma tú" },
  lookup: { en: "How to find your booking", ko: "조회 방법 고르기", ja: "予約の検索方法", vi: "Cách tìm đặt chỗ", zh: "选择查询方式", es: "Cómo buscar tu reserva" },
  passport: { en: "Passport scan", ko: "여권 스캔", ja: "パスポート読み取り", vi: "Quét hộ chiếu", zh: "扫描护照", es: "Escaneo del pasaporte" },
  passengers: { en: "Passengers", ko: "체크인할 승객", ja: "搭乗者", vi: "Hành khách", zh: "乘客", es: "Pasajeros" },
  add_passenger: { en: "Add companion", ko: "일행 추가", ja: "同行者を追加", vi: "Thêm người đi cùng", zh: "添加同行人", es: "Añadir acompañante" },
  flight_info: { en: "Flight & seats", ko: "항공편·좌석", ja: "便と座席", vi: "Chuyến bay & ghế", zh: "航班与座位", es: "Vuelo y asientos" },
  seat_map: { en: "Seat map", ko: "좌석 고르기", ja: "座席表", vi: "Sơ đồ ghế", zh: "座位图", es: "Mapa de asientos" },
  bags_question: { en: "Checked bags?", ko: "부칠 짐", ja: "預け荷物", vi: "Hành lý ký gửi?", zh: "托运行李？", es: "¿Equipaje facturado?" },
  bag_count: { en: "Number of bags", ko: "짐 개수", ja: "荷物の個数", vi: "Số kiện hành lý", zh: "行李件数", es: "Número de maletas" },
  printing: { en: "Printing boarding passes", ko: "탑승권 발급 중", ja: "搭乗券を発行中", vi: "Đang in thẻ lên máy bay", zh: "正在打印登机牌", es: "Imprimiendo tarjetas de embarque" },
  complete: { en: "Check-in complete", ko: "체크인 완료", ja: "チェックイン完了", vi: "Đã làm thủ tục xong", zh: "值机完成", es: "Check-in completado" },
};

// 휴대폰 상태 줄의 요약: 넣은 여권 수와 정한 좌석(휴대폰 언어)
const summaryText: Record<Lang, (n: number, seats: string) => string> = {
  en: (n, s) => `${n} passport(s)${s ? ` · seats ${s}` : ""}`,
  ko: (n, s) => `여권 ${n}개${s ? ` · 좌석 ${s}` : ""}`,
  ja: (n, s) => `パスポート ${n}冊${s ? ` · 座席 ${s}` : ""}`,
  vi: (n, s) => `${n} hộ chiếu${s ? ` · ghế ${s}` : ""}`,
  zh: (n, s) => `护照 ${n} 本${s ? ` · 座位 ${s}` : ""}`,
  es: (n, s) => `${n} pasaporte(s)${s ? ` · asientos ${s}` : ""}`,
};
export const statusSummary = (passports: number, seats: string, language: string) => summaryText[langOf(language)](passports, seats);
