// 휴대폰 상태 줄. 단계 이름은 키오스크가 보낸 화면 id로 휴대폰 언어로 만든다(세 키오스크 모두).
// 요약도 키오스크가 실어 보낸 데이터(패스트푸드 개수·합계, 공항 air, 기차 rail)로 직접 만든다
// (키오스크는 사람이 말하기 전까지 휴대폰 언어를 모르므로, 키오스크가 만든 글은 다른 언어일 수 있다)
import { langOf, type Lang } from "@/engine/turn";
import { airlines } from "@/kiosks/airport/booking";
import { screenLabel as airportLabel } from "@/kiosks/airport/ui/labels";
import type { CartLine } from "@/kiosks/fastfood/machine";
import { screenLabel as fastfoodLabel, lineName, orderLines } from "@/kiosks/fastfood/ui/labels";
import { t as fastfoodText } from "@/kiosks/fastfood/ui/strings";
import { findStation } from "@/kiosks/train/rail";
import { seatsText, screenLabel as trainLabel } from "@/kiosks/train/ui/labels";
import type { LinkMsg, TripAir, TripRail } from "@/sync/link";
import { phoneText } from "./text";

type Status = Extract<LinkMsg, { type: "status" }>;

const screenLabels: Record<string, Record<string, Record<Lang, string>>> = { fastfood: fastfoodLabel, airport: airportLabel, train: trainLabel };

const won = (n: number) => `₩${n.toLocaleString("en-US")}`;
// 항공사·역 이름은 한국어 휴대폰이면 한국어, 아니면 영어(패스트푸드 품목과 같은 규칙)
const nameIn = (name: { en: string; ko: string } | undefined, l: Lang) => (name ? (l === "ko" ? name.ko : name.en) : undefined);
const join = (parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" · ");

function airSummary(a: TripAir, language: string) {
  const l = langOf(language);
  const tx = phoneText(language);
  return join([nameIn(airlines.find((x) => x.id === a.airline)?.name, l), a.passports > 0 && tx.passports(a.passports), a.seats.length > 0 && tx.seats(a.seats), a.bags !== undefined && tx.bags(a.bags)]);
}

// "2026-11-04" → 휴대폰 언어의 월·일·요일. 날짜만 있는 값이라 그 날 0시(기기 시간대)로 읽어 요일을 구한다
function dayText(date: string, tx: ReturnType<typeof phoneText>) {
  const d = new Date(`${date}T00:00:00`);
  return tx.day(d.getMonth() + 1, d.getDate(), d.getDay());
}

// 도착역을 정하기 전에는 비운다
function railSummary(r: TripRail, language: string) {
  const l = langOf(language);
  const tx = phoneText(language);
  const to = r.to ? nameIn(findStation(r.to)?.name, l) : undefined;
  if (!to) return "";
  return join([`${nameIn(findStation(r.from)?.name, l) ?? r.from} → ${to}`, r.date && dayText(r.date, tx), r.dep && tx.departs(r.dep), r.cls && (r.cls === "first" ? tx.firstClass : tx.standardClass), r.people > 0 && tx.people(r.people), r.seats.length > 0 && seatsText(r.seats, l)]);
}
// 패스트푸드 품목 이름의 언어: 휴대폰이 ko면 ko, 그 밖은 en(키오스크 메뉴 데이터가 가진 두 언어. 키오스크 표시와 같은 규칙)
const menuLang = (language: string) => (langOf(language) === "ko" ? "ko" : "en");
type Line = NonNullable<Status["lines"]>[number];

// 주문 카드·영수증의 품목 줄. 원자료(cart)가 있으면 휴대폰 언어로 다시 만들고, 없으면(옛 키오스크) 키오스크가 보낸 줄 그대로.
// 키오스크가 줄을 보내지 않은 화면(lines 없음)에서는 만들지 않는다
export const orderLinesIn = (src: { lines?: Line[]; cart?: CartLine[] }, language: string) => (src.lines && src.cart ? orderLines(src.cart, menuLang(language)) : src.lines);

// 키오스크 요약(statusSummary 꼴: [품목 이름 · ]개수 · 합계)에서 품목 이름만 꺼낸다
const kioskName = (summary?: string) => summary?.split(" · ").slice(0, -2).join(" · ") || undefined;

export function statusLine(s: Status, language: string): { label: string; summary: string } {
  const tx = phoneText(language);
  // 단계 이름이 버튼을 부르면({b}) 키오스크 화면 글자 그대로 쓴다(번역한 버튼 이름은 키오스크에 없다)
  const label = s.paid ? tx.paidLabel : (screenLabels[s.kioskId ?? ""]?.[s.screen]?.[langOf(language)]?.replace("{b}", fastfoodText.pay[s.kioskLang ?? "en"]) ?? s.label ?? s.screen);
  if (s.kioskId === "airport" && s.air) return { label, summary: airSummary(s.air, language) };
  if (s.kioskId === "train" && s.rail) return { label, summary: railSummary(s.rail, language) };
  // 데이터가 없는 키오스크(옛 키오스크)는 키오스크가 만든 요약 글을 그대로 쓴다. 비었으면 비운다
  if (s.kioskId !== "fastfood") return { label, summary: s.summary ?? "" };
  // 원자료(cart·draft)가 있으면 담는 중이거나 마지막에 담은 품목을 휴대폰 언어로. 없으면 키오스크가 보낸 글
  const current = s.draft ?? s.cart?.at(-1);
  const name = s.cart ? current && lineName(current, menuLang(language)) : (s.lines?.at(-1)?.name ?? kioskName(s.summary));
  // 0개·₩0은 소음이라 뺀다(공항·기차와 같은 규칙)
  return { label, summary: join([name, s.items > 0 && tx.items(s.items), s.total > 0 && won(s.total)]) };
}

// 키오스크가 첫 화면이고 비어 있으면(조작 중 아님, 담긴 것·여권 0, 결제 전) 위 띠를 숨긴다. "첫 화면"만 남는 띠는 소음이다
export const bandHidden = (s: Status) => s.screen === "idle" && !s.busy && s.items === 0 && !s.paid;

// 머리줄 연결 칩. 한 번 연결된 뒤 원격 길이 끊기면 '다시 연결 중'(지난 키오스크 이름을 그대로 두지 않는다).
// live: 길이 지금 연결됐는가(모르면 null), wasLive: 이 화면에서 한 번이라도 연결됐는가
export const linkChip = (hasStatus: boolean, live: boolean | null, wasLive: boolean): "kiosk" | "reconnecting" | "none" =>
  wasLive && live === false ? "reconnecting" : hasStatus ? "kiosk" : "none";
