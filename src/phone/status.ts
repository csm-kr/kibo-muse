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

// 휴대폰 실시간 키오스크 카드: 지금 화면 이름·요약(휴대폰 언어)과 담은 줄(이름·수량·값). 메뉴 이름은 ko 휴대폰이면 한국어, 그 밖은 영어(메뉴 이름이 en·ko뿐)
export function kioskCard(s: Status, language: string) {
  const { label, summary } = statusLine(s, language);
  const lines = (s.cart ?? []).map((l) => ({ name: lineName(l, menuLang(language)), qty: l.qty, price: l.qty * l.unitPrice }));
  return { label, summary, lines, total: s.total };
}

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

// 마이크 아래 안내 줄. 녹음 중(두 번 탭으로 시작했으면 '다시 두 번 탭하면 보내요') → 기다리는 중 → 오류 안내 → 조작 중 → 되묻기 → 결제 끝·결제 중 → 기본.
// 되묻기는 결제가 끝난 뒤의 '번호가 불리면 받으세요'보다 앞선다(다음 턴에 KIBO가 물어도 옛 안내가 남지 않게)
export function phoneHint(
  tx: ReturnType<typeof phoneText>,
  s: { recording: boolean; toggled: boolean; waiting: boolean; longWait: boolean; notice: string | null; operating: boolean; asking: boolean; orderCard: string | null | undefined; kiboTalking?: boolean },
) {
  // 듣는 중 KIBO가 말하고 있으면 탭으로 끊을 수 있다고 알린다(목소리 끼어들기를 놓쳐도 탭은 확실히 멈춘다)
  if (s.recording) return s.kiboTalking ? tx.bargeTip : s.toggled ? tx.toggleOn : tx.listening;
  // 보낸 뒤 3초가 지나도 대답이 없으면(longWait) 얼마나 걸리는지 알린다
  if (s.waiting) return s.longWait ? tx.waitLong : tx.thinking;
  return s.notice ?? (s.operating ? tx.operating : s.asking ? tx.answer : s.orderCard === "paid" ? tx.pickup : s.orderCard === "paying" ? tx.paying : tx.hold);
}

// 한 번 누르면 이어 듣기(11/4 사용자: "한 번 누르고 다시 안 눌러도 되게"). 대답을 다 읽고 키오스크가 다 누른 뒤 저절로 다시 듣는다.
// 결제 안내·영수증(주문 끝)·관문 카드(사람이 눌러 확인)가 떴거나, 못 알아들음이 2번 이어졌으면 멈추고 다시 누르기를 기다린다
// KIBO가 다 읽었는지는 휴대폰이 마이크를 열기 직전에 따로 본다(speechBusy)
export const autoListen = (s: { convo: boolean; idle: boolean; waiting: boolean; operating: boolean; handoff: boolean; receipt: boolean; gate: boolean; fails: number }) =>
  s.convo && s.idle && !s.waiting && !s.operating && !s.handoff && !s.receipt && !s.gate && s.fails < 2;

// 대답이 'KIBO가 n번 누른다'면, 키오스크의 조작 중 상태(status busy)가 오기 전 잠깐도 조작 중으로 본다.
// 대답 → 조작 상태 사이에 안내 줄이 '누른 채로 말하고…'로 갔다가 0.1초 안에 '누르고 있어요'로 바뀌어 대답 알림과 겹쳤다
export const tapBridge = (on: boolean, m: LinkMsg) =>
  m.type === "reply" ? m.result === "plan" && (m.taps ?? 0) > 0 : m.type === "done" || (m.type === "status" && m.busy) ? false : on;

// 다리의 시간 상한. 대답 뒤 4초 안에 키오스크의 조작 중 상태가 오지 않으면(누르기를 시작하지 못함) 다리를 끊고 평소 안내로 돌아간다
export function bridgeTimeout(on: boolean, off: () => void, ms = 4000) {
  if (!on) return;
  const t = setTimeout(off, ms);
  return () => clearTimeout(t);
}

// 되물은 뒤(마지막 말이 물음) 키오스크가 첫 화면으로 돌아가면(시간 초과 등) 그 물음은 낡았다.
// 물음 표시(질문 카드·'눌러서 대답하세요')를 지우고 '처음으로 돌아갔어요'를 한 번 붙인다. 아니면 그대로 돌려준다
// 답 칩이 붙은 완료 턴(더 주문?)도 물음으로 본다. 안내 줄이 마지막이 되어 칩도 사라진다
export function expireAsk<T extends { who: string; text: string; kind?: string; answers?: string }>(turns: T[], prevScreen: string | null, screen: string, text: string): T[] {
  const last = turns.at(-1);
  if (screen !== "idle" || prevScreen === null || prevScreen === "idle" || last?.who !== "kibo" || (last.kind !== "ask" && !last.answers)) return turns;
  return [...turns.slice(0, -1), { ...last, kind: undefined }, { who: "kibo", text } as T];
}
