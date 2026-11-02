// 기차 발매기 화면 문구(한국어·영어). 화면 구조와 문구는 한국 차세대 세로형 발매기(명세 K01–K11)를 따르고, 상표는 가상(Bridge Rail)이다.

import type { Lang } from "../rail";

export const t = {
  chooseMenu: { ko: "원하시는 메뉴를 선택해주세요", en: "Please choose a menu" },
  buyTickets: { ko: "승차권 예매", en: "Buy tickets" },
  refund: { ko: "승차권 환불", en: "Refund" },
  receipt: { ko: "영수증 출력", en: "Receipt" },
  lookup: { ko: "조회·기타", en: "Lookup · other" },
  needHelp: { ko: "기기 사용에 어려움이 있다면? 화면 위 [원격상담]", en: "Need help? Tap [Live help] at the top" },
  home: { ko: "처음으로", en: "Home" },
  operator: { ko: "원격상담", en: "Live help" },
  back: { ko: "‹ 이전", en: "‹ Back" },
  access: { ko: "접근성", en: "Accessibility" },
  journeyTitle: { ko: "여정 정보를 입력해주세요", en: "Enter your trip" },
  oneWay: { ko: "편도", en: "One way" },
  roundTrip: { ko: "왕복", en: "Round trip" },
  from: { ko: "출발", en: "From" },
  to: { ko: "도착", en: "To" },
  choose: { ko: "선택", en: "Choose" },
  swap: { ko: "⇅ 변경", en: "⇅ Swap" },
  date: { ko: "가는날", en: "Date" },
  people: { ko: "인원", en: "Passengers" },
  seat: { ko: "좌석", en: "Seat" },
  generalSeat: { ko: "일반 좌석", en: "Standard" },
  search: { ko: "열차조회", en: "Search trains" },
  stationTitle: { ko: "출/도착역 선택", en: "Choose station" },
  mainStations: { ko: "주요역", en: "Main stations" },
  cancel: { ko: "취소", en: "Cancel" },
  done: { ko: "선택 완료", en: "Done" },
  ok: { ko: "확인", en: "OK" },
  dateTitle: { ko: "가는 날과 시각을 골라 주세요", en: "Choose date and time" },
  today: { ko: "오늘", en: "Today" },
  paxTitle: { ko: "인원을 선택해 주세요 (최대 9명)", en: "Passengers (up to 9)" },
  adult: { ko: "어른", en: "Adult" },
  child: { ko: "어린이 (6–12세)", en: "Child (6–12)" },
  senior: { ko: "경로 (65세 이상)", en: "Senior (65+)" },
  prevDay: { ko: "‹ 이전날", en: "‹ Prev day" },
  nextDay: { ko: "다음날 ›", en: "Next day ›" },
  after: { ko: "시 이후", en: ":00 or later" },
  express: { ko: "고속", en: "Express" },
  local: { ko: "완행", en: "Local" },
  general: { ko: "일반실", en: "Standard" },
  first: { ko: "특실", en: "First" },
  soldOut: { ko: "매진", en: "Sold out" },
  infoTitle: { ko: "열차 정보", en: "Train details" },
  pickSeats: { ko: "좌석 선택", en: "Choose seats" },
  reserve: { ko: "예매하기", en: "Reserve" },
  chosen: { ko: "선택한 좌석", en: "Your seats" },
  autoSeats: { ko: "좌석을 고르지 않으면 자동으로 배정돼요", en: "Seats are assigned if you don't choose" },
  seatTitle: { ko: "좌석 선택", en: "Choose seats" },
  car: { ko: "호차", en: "Car" },
  free: { ko: "빈자리", en: "Free" },
  picked: { ko: "선택", en: "Selected" },
  sold: { ko: "판매됨", en: "Taken" },
  windowAD: { ko: "창가 A·D", en: "Window A·D" },
  resTitle: { ko: "예약 확인", en: "Reservation" },
  total: { ko: "총 결제금액", en: "Total" },
  holdNote: { ko: "10:00 이내 결제하지 않으면 예약이 취소돼요.", en: "Pay within 10:00 or the reservation is cancelled." },
  cancelRes: { ko: "예약 취소", en: "Cancel" },
  pay: { ko: "결제하기", en: "Pay" },
  payTitle: { ko: "결제 수단을 선택해 주세요", en: "Choose how to pay" },
  fare: { ko: "운임", en: "Fare" },
  discount: { ko: "할인 금액", en: "Discount" },
  finalPay: { ko: "최종 결제금액 (1건)", en: "Amount due (1 item)" },
  insertTitle: { ko: "결제단말기에 카드를 넣어주세요", en: "Insert your card into the reader" },
  insertSub: { ko: "휴대폰 결제는 단말기에 대 주세요", en: "For phone payment, hold your phone to the reader" },
  timeout30: { ko: "30초 후 종료됩니다", en: "Ends in 30 seconds" },
  printing: { ko: "승차권을 발권하고 있어요", en: "Printing your tickets" },
  complete: { ko: "승차권을 가져가세요", en: "Please take your tickets" },
  operatorBody: { ko: "원격상담 연결 중… 상담원이 곧 연결됩니다.", en: "Connecting to live help… an agent will join shortly." },
  close: { ko: "닫기", en: "Close" },
  notEnough: { ko: "남은 좌석이 인원보다 적어요. 다른 열차를 골라 주세요.", en: "Not enough seats left for your group. Please choose another train." },
  cardSlot: { ko: "카드 넣는 곳", en: "Card" },
  insertCard: { ko: "💳 카드 넣기", en: "💳 Insert card" },
  ticketOut: { ko: "승차권 나오는 곳", en: "Tickets" },
} satisfies Record<string, Record<Lang, string>>;

export const payMethods: { id: string; name: Record<Lang, string> }[] = [
  { id: "domestic_card", name: { ko: "국내 신용·체크카드", en: "Domestic card" } },
  { id: "overseas_card", name: { ko: "해외 신용카드", en: "Overseas card" } },
  { id: "zero_pay", name: { ko: "QR 간편결제", en: "QR pay" } },
  { id: "union_pay", name: { ko: "해외 은행카드", en: "Overseas bank card" } },
];

const WD: Record<Lang, string[]> = { ko: ["일", "월", "화", "수", "목", "금", "토"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };
// 오늘(today, YYYY-MM-DD)부터 day일 뒤의 날짜. today가 비었으면(서버 렌더) 빈 문자열.
// 지금 시각(new Date())은 렌더 중에 읽지 않는다(미리 렌더에서 막힌다)
export function dateLabel(day: number, lang: Lang, today: string) {
  if (!today) return "";
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() + day);
  const md = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  return lang === "ko" ? `${md}(${WD.ko[d.getDay()]})` : `${WD.en[d.getDay()]} ${md}`;
}
export const won = (n: number, lang: Lang) => (lang === "ko" ? `${n.toLocaleString("ko-KR")}원` : `₩${n.toLocaleString("en-US")}`);
export const duration = (m: number, lang: Lang) => (lang === "ko" ? `${Math.floor(m / 60)}시간 ${m % 60}분 소요` : `${Math.floor(m / 60)}h ${m % 60}m`);
// "5-8A" → "5호차 8A" / "Car 5 8A"
export function seatLabel(id: string, lang: Lang) {
  const [car, rest] = id.split("-");
  return lang === "ko" ? `${car}호차 ${rest}` : `Car ${car} ${rest}`;
}
