// 가상 철도 데이터. 화면 구조는 한국 차세대 세로형 발매기(명세 K01–K11)를 따르고, 노선·역 이름·열차 이름·번호·요금·좌석 상황은 모두 가상이다.
// 실제 철도 회사 이름·로고·노선색·역 이름은 쓰지 않는다.

export type Lang = "en" | "ko";
export type L10n = Record<Lang, string>;

export interface Station {
  id: string;
  name: L10n;
}

// 출/도착역 팝업의 「주요역」 격자 순서 (3열 × 3행 = 한 쪽 9개)
export const stations: Station[] = [
  { id: "central", name: { en: "Bridge Central", ko: "브리지중앙" } },
  { id: "willow", name: { en: "Willow Bank", ko: "버들둑" } },
  { id: "maple", name: { en: "Maple Hill", ko: "단풍언덕" } },
  { id: "lantern", name: { en: "Lantern Lake", ko: "등불호수" } },
  { id: "midvale", name: { en: "Midvale", ko: "미드베일" } },
  { id: "stonegate", name: { en: "Stone Gate", ko: "돌문" } },
  { id: "coralbay", name: { en: "Coral Bay", ko: "산호만" } },
  { id: "harbor", name: { en: "Harborlight", ko: "등대항" } },
  { id: "sunfield", name: { en: "Sunfield", ko: "햇들" } },
  { id: "westwind", name: { en: "Westwind", ko: "서풍" } },
  { id: "snowpeak", name: { en: "Snow Peak", ko: "눈봉" } },
  { id: "pinecoast", name: { en: "Pine Coast", ko: "솔바닷가" } },
];
export const STATIONS_PER_PAGE = 9;
export const stationPage = (id: string) => Math.floor(stations.findIndex((s) => s.id === id) / STATIONS_PER_PAGE);
export const findStation = (id: string) => stations.find((s) => s.id === id);

// 발매기가 놓인 역. 여정 입력 화면의 출발역 기본값이다 (명세 K02)
export const HOME_STATION = "central";

export type TrainType = "express" | "local";
export type SeatClass = "general" | "first";

// 가상 노선(남선·서선·동선): 역과 시발역에서의 분 (고속 기준). 완행은 두 배 걸린다
const lines: Record<string, [string, number][]> = {
  south: [["central", 0], ["willow", 15], ["maple", 35], ["lantern", 60], ["midvale", 110], ["stonegate", 130], ["coralbay", 140], ["harbor", 160]],
  west: [["central", 0], ["willow", 15], ["maple", 35], ["sunfield", 110], ["westwind", 140]],
  east: [["central", 0], ["snowpeak", 85], ["pinecoast", 115]],
};

export interface Train {
  no: number;
  type: TrainType;
  line: string;
  down: boolean; // 브리지중앙에서 멀어지는 방향
  start: number; // 시발역 출발 (자정부터 분)
}

const base: Record<string, number> = { south: 100, west: 500, east: 800 };
export const trains: Train[] = [];
for (const line of Object.keys(lines)) {
  for (const down of [true, false]) {
    for (let i = 0; i < 32; i++) trains.push({ no: base[line] + i * 2 + (down ? 1 : 0), type: "express", line, down, start: 360 + i * 30 });
  }
}
for (const [i, start] of [430, 610, 790, 970, 1150].entries()) {
  trains.push({ no: 1201 + i * 2, type: "local", line: "south", down: true, start });
  trains.push({ no: 1202 + i * 2, type: "local", line: "south", down: false, start });
}

export const trainName = (t: Train): L10n => (t.type === "express" ? { en: `Bridge Express ${t.no}`, ko: `브리지 고속 ${t.no}` } : { en: `Bridge Local ${t.no}`, ko: `브리지 완행 ${t.no}` });

function offsetAt(t: Train, station: string): number | null {
  const stops = lines[t.line];
  const end = stops[stops.length - 1][1];
  const hit = stops.find(([s]) => s === station);
  if (!hit) return null;
  const m = t.down ? hit[1] : end - hit[1];
  return t.type === "local" ? m * 2 : m;
}

export interface Leg {
  train: Train;
  dep: number; // 출발역 출발 (분)
  arr: number;
  fare: Record<SeatClass, number | null>;
}

// from → to 로 가는 열차를 출발 시각 순으로
export function legs(from: string, to: string): Leg[] {
  const out: Leg[] = [];
  for (const t of trains) {
    const a = offsetAt(t, from);
    const b = offsetAt(t, to);
    if (a === null || b === null || b <= a) continue;
    const minutes = b - a;
    const general = Math.round(((t.type === "express" ? 330 : 180) * (t.type === "express" ? minutes : minutes / 2)) / 100) * 100;
    out.push({ train: t, dep: t.start + a, arr: t.start + b, fare: { general, first: t.type === "express" ? Math.round((general * 1.5) / 100) * 100 : null } });
  }
  return out.sort((x, y) => x.dep - y.dep);
}

export const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// 편성: 고속은 1–2호차 특실(2+1), 3–8호차 일반실(2+2). 완행은 1–4호차 일반실
export interface CarSpec {
  car: number;
  cls: SeatClass;
  rows: number;
  blocks: string[][];
}
export function cars(t: Train): CarSpec[] {
  if (t.type === "local") return [1, 2, 3, 4].map((car) => ({ car, cls: "general", rows: 16, blocks: [["A", "B"], ["C", "D"]] }));
  return [1, 2, 3, 4, 5, 6, 7, 8].map((car) => (car <= 2 ? { car, cls: "first", rows: 10, blocks: [["A"], ["C", "D"]] } : { car, cls: "general", rows: 15, blocks: [["A", "B"], ["C", "D"]] }));
}
export const WINDOW = ["A", "D"];
export const AISLE = ["B", "C"];

// 좌석 표기: "5-8A" = 5호차 8A
export const seatId = (car: number, row: number, letter: string) => `${car}-${row}${letter}`;
export const parseSeatId = (id: string) => {
  const [car, rest] = id.split("-");
  return { car: Number(car), row: Number(rest.slice(0, -1)), letter: rest.slice(-1) };
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// 이미 팔린 좌석 (가상). 출근 시간대(07–10시 출발) 브리지중앙발 남선 고속 특실은 매진이다
export function isSold(t: Train, day: number, seat: string) {
  const { car } = parseSeatId(seat);
  const spec = cars(t).find((c) => c.car === car)!;
  if (spec.cls === "first" && t.line === "south" && t.down && t.start >= 420 && t.start < 600) return true;
  return hash(`${t.no}/${day}/${seat}`) % 100 < 62;
}

export function seatsOf(t: Train, cls: SeatClass): string[] {
  return cars(t)
    .filter((c) => c.cls === cls)
    .flatMap((c) => Array.from({ length: c.rows }, (_, r) => c.blocks.flat().map((l) => seatId(c.car, r + 1, l))).flat());
}
export const freeSeats = (t: Train, day: number, cls: SeatClass) => seatsOf(t, cls).filter((s) => !isSold(t, day, s));

// 좌석 선택 화면에 처음 보이는 호차: 그 등급에서 빈자리가 가장 많은 호차 (JR 「◎最も空きあり」)
export function defaultCar(t: Train, day: number, cls: SeatClass): number {
  const free = freeSeats(t, day, cls);
  const counts = cars(t)
    .filter((c) => c.cls === cls)
    .map((c) => ({ car: c.car, n: free.filter((s) => parseSeatId(s).car === c.car).length }));
  return counts.reduce((a, b) => (b.n > a.n ? b : a)).car;
}

export const MAX_PASSENGERS = 9;
export const TRAINS_PER_PAGE = 5;
export const DAYS_AHEAD = 7;
// 가는날 기본 시각: 발매기의 현재 시각을 정시로 내림 (명세 K02 "가는날 … 13:00")
export const FIRST_HOUR = 5;
export const LAST_HOUR = 23;
// 요금 할인 (가상): 어린이 50%, 경로 30%
export const fareFor = (base: number, pax: Pax) => Math.round((base * pax.adult + base * 0.5 * pax.child + base * 0.7 * pax.senior) / 100) * 100;

export interface Pax {
  adult: number;
  child: number;
  senior: number;
}
export const paxTotal = (p: Pax) => p.adult + p.child + p.senior;
