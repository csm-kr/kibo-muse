// 가상 공항 체크인 데이터. 화면 구조는 인천공항 공식 영상의 실제 키오스크(명세 V1)를 따르고, 항공사·편명·승객은 가상이다.

export type Lang = "en" | "ko";
export type L10n = Record<Lang, string>;

export interface Airline {
  id: string;
  name: L10n;
  mark: string;
}

// 공용 키오스크 첫 화면의 항공사 타일(2×2). 모두 가상 이름이다
export const airlines: Airline[] = [
  { id: "bridge_air", name: { en: "Bridge Air", ko: "브리지항공" }, mark: "◗" },
  { id: "haneul_sky", name: { en: "Haneul Sky", ko: "하늘스카이" }, mark: "☁" },
  { id: "nova_wings", name: { en: "Nova Wings", ko: "노바윙스" }, mark: "✦" },
  { id: "seabird_air", name: { en: "Seabird Air", ko: "시버드항공" }, mark: "◠" },
];

export interface Passenger {
  id: string;
  title: "MR" | "MS";
  family: string;
  given: string;
  nationality: L10n;
  passportNo: string;
}

export const booking = {
  pnr: "QX7K2B",
  airline: "bridge_air",
  flight: {
    no: "BRG 701",
    from: { code: "ICN", city: { en: "Seoul", ko: "서울" } },
    to: { code: "NRT", city: { en: "Tokyo", ko: "도쿄" } },
    date: "2026.11.05",
    dep: "09:40",
    arr: "12:05",
    boarding: "09:00",
    gate: "23",
    aircraft: "W300",
  },
  passengers: [
    { id: "p1", title: "MS", family: "KIM", given: "MINJI", nationality: { en: "Korea", ko: "한국" }, passportNo: "M48213307" },
    { id: "p2", title: "MS", family: "PARK", given: "YOUNGSOOK", nationality: { en: "Korea", ko: "한국" }, passportNo: "M51920844" },
  ] as Passenger[],
  // 예약할 때 자동 배정된 좌석. 서로 떨어져 있어서 "나란히"는 좌석 변경이 필요하다
  seats: { p1: "34A", p2: "41G" } as Record<string, string>,
};

export const findPassenger = (id: string) => booking.passengers.find((p) => p.id === id);

// 좌석맵: 가상 중형 광동체(W300) 일반석 2-4-2 (명세 3-1 관찰)
export const FIRST_ROW = 31;
export const LAST_ROW = 48;
export const ROWS = Array.from({ length: LAST_ROW - FIRST_ROW + 1 }, (_, i) => FIRST_ROW + i);
export const BLOCKS = [
  ["A", "C"],
  ["D", "E", "F", "G"],
  ["H", "K"],
];
export const LETTERS = BLOCKS.flat();
export const WINDOW = ["A", "K"];
export const AISLE = ["C", "D", "G", "H"];
export const EXIT_ROWS = [31];
export const PAID_ROWS = [32, 33];
// 한 화면에 보이는 열 수와 ▲/▼ 한 번에 움직이는 열 수 (명세 3-2 【추론】)
export const VISIBLE_ROWS = 8;
export const SCROLL_ROWS = 6;
export const MAX_OFFSET = ROWS.length - VISIBLE_ROWS;

// 다른 승객이 이미 앉은 좌석 (고정 패턴)
const taken: Record<number, string> = {
  31: "CDEFH",
  32: "DE",
  33: "ACHK",
  34: "CDFH",
  35: "ADFK",
  36: "ACDEG",
  37: "ACEFHK",
  38: "CDEFGK",
  39: "ACDGHK",
  40: "ACDEFGHK",
  41: "ACDEFH",
  42: "CDEFG",
  43: "ADEGHK",
  44: "ACDFGK",
  45: "CDEFGHK",
  46: "ACDEFGH",
  47: "ACEGHK",
  48: "ACDEFGHK",
};

export const parseSeat = (seat: string) => ({ row: Number(seat.slice(0, -1)), letter: seat.slice(-1) });
export const isRealSeat = (seat: string) => {
  const { row, letter } = parseSeat(seat);
  return ROWS.includes(row) && LETTERS.includes(letter);
};
export const isTakenByOthers = (seat: string) => {
  const { row, letter } = parseSeat(seat);
  return (taken[row] ?? "").includes(letter);
};
export const isPaid = (seat: string) => PAID_ROWS.includes(parseSeat(seat).row);
export const isExit = (seat: string) => EXIT_ROWS.includes(parseSeat(seat).row);

// 수하물: 1인 1개 무료 (가상 운임 규정)
export const BAG_ALLOWANCE = 1;
export const MAX_BAGS = 3;
export const EXCESS_FEE = 100000;
export const MAX_TRAVELERS = 6;
