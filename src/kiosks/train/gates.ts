// 기차 발매기에서 사람이 해야 하는 관문의 휴대폰 카드와 되묻기·좌석 알림. Spark가 만들지 않고 고정 번역문을 쓴다(6개 언어).
// 결제하기·결제 수단은 카드 없이 휴대폰의 결제 넘기기 안내(paymentHandoff)로 알린다.

import { langOf, type Lang } from "@/engine/turn";
import type { LinkGate } from "@/sync/link";
import type { Missing, Stop, TrainIntent } from "./planner";
import { trainByNo, type KioskState } from "./machine";
import { findStation, hhmm, legs, trainName, type SeatClass } from "./rail";
import { seatsText } from "./ui/labels";
import { t } from "./ui/strings";

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

// 어린이만 남았으면 어린이만 타는 표인지 묻는다
const childOnly: Record<Lang, string> = {
  en: "Should I book tickets for children only? If an adult is travelling with them, please tell me.",
  ko: "어린이만 타는 표로 예매할까요? 함께 타는 어른이 있으면 말씀해 주세요.",
  ja: "お子さまだけのきっぷで予約しますか？一緒に乗る大人がいる場合は教えてください。",
  vi: "Đặt vé chỉ cho trẻ em thôi phải không? Nếu có người lớn đi cùng, xin hãy cho biết.",
  zh: "只为儿童订票吗？如果有大人同行，请告诉我。",
  es: "¿Reservo billetes solo para niños? Si viaja un adulto con ellos, dígamelo.",
};

// 빠진 것만 묻는 질문(Spark 문장을 못 쓸 때의 대체). 날짜를 이미 알면 시각만 묻는다
const ask: Record<Lang, { to: string; when: string; time: string; who: string; whenWho: string }> = {
  en: { to: "Where are you going?", when: "What day and time would you like to leave?", time: "What time would you like to leave?", who: "How many people are travelling?", whenWho: "What day and time, and how many people?" },
  ko: { to: "어디로 가세요?", when: "언제 몇 시쯤 출발할까요?", time: "몇 시쯤 출발할까요?", who: "몇 분이 타세요?", whenWho: "언제 몇 시쯤, 몇 분이 타세요?" },
  ja: { to: "どちらまで行かれますか？", when: "何日の何時ごろに出発しますか？", time: "何時ごろに出発しますか？", who: "何名さまですか？", whenWho: "何日の何時ごろ、何名さまですか？" },
  vi: { to: "Bạn muốn đi đến ga nào?", when: "Bạn muốn đi ngày nào, khoảng mấy giờ?", time: "Bạn muốn đi khoảng mấy giờ?", who: "Có mấy người đi ạ?", whenWho: "Ngày nào, mấy giờ, và có mấy người đi ạ?" },
  zh: { to: "您要去哪一站？", when: "您想哪天几点左右出发？", time: "您想几点左右出发？", who: "一共几位乘车？", whenWho: "哪天几点左右，一共几位？" },
  es: { to: "¿A dónde va?", when: "¿Qué día y a qué hora quiere salir?", time: "¿A qué hora quiere salir?", who: "¿Cuántas personas viajan?", whenWho: "¿Qué día, a qué hora y cuántas personas?" },
};

export function clarifySay(missing: Missing[], language: string, known: TrainIntent = {}) {
  if (missing.includes("child_only")) return childOnly[langOf(language)];
  const a = ask[langOf(language)];
  const when = missing.includes("date") ? (known.day !== undefined ? a.time : a.when) : "";
  const both = missing.includes("date") && missing.includes("passengers") && known.day === undefined;
  return [missing.includes("to") ? a.to : "", both ? a.whenWho : when, !both && missing.includes("passengers") ? a.who : ""].filter(Boolean).join(" ");
}

// 결제 앞(예약 확인 화면)까지 온 뒤 무엇을 예약했는지 말한다. pay = 키오스크 화면의 결제 버튼 글자(키오스크 언어 그대로)
const dayWord: Record<Lang, (d: number) => string> = {
  en: (d) => (d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`),
  ko: (d) => (d === 0 ? "오늘" : d === 1 ? "내일" : d === 2 ? "모레" : `${d}일 뒤`),
  ja: (d) => (d === 0 ? "今日" : d === 1 ? "明日" : `${d}日後`),
  vi: (d) => (d === 0 ? "Hôm nay" : d === 1 ? "Ngày mai" : `${d} ngày nữa`),
  zh: (d) => (d === 0 ? "今天" : d === 1 ? "明天" : `${d}天后`),
  es: (d) => (d === 0 ? "Hoy" : d === 1 ? "Mañana" : `Dentro de ${d} días`),
};
const paxWords: Record<Lang, [(n: number) => string, (n: number) => string, (n: number) => string, string]> = {
  en: [(n) => `${n} adult${n > 1 ? "s" : ""}`, (n) => `${n} child${n > 1 ? "ren" : ""}`, (n) => `${n} senior${n > 1 ? "s" : ""}`, ", "],
  ko: [(n) => `어른 ${n}명`, (n) => `어린이 ${n}명`, (n) => `경로 ${n}명`, ", "],
  ja: [(n) => `大人${n}名`, (n) => `子ども${n}名`, (n) => `シニア${n}名`, "、"],
  vi: [(n) => `${n} người lớn`, (n) => `${n} trẻ em`, (n) => `${n} người cao tuổi`, ", "],
  zh: [(n) => `成人${n}位`, (n) => `儿童${n}位`, (n) => `老人${n}位`, "、"],
  es: [(n) => `${n} adulto${n > 1 ? "s" : ""}`, (n) => `${n} niño${n > 1 ? "s" : ""}`, (n) => `${n} mayor${n > 1 ? "es" : ""}`, ", "],
};
const clsWord: Record<Lang, Record<SeatClass, string>> = {
  en: { general: "standard class", first: "first class" },
  ko: { general: "일반실", first: "특실" },
  ja: { general: "普通席", first: "特別席" },
  vi: { general: "hạng thường", first: "hạng nhất" },
  zh: { general: "普通座", first: "一等座" },
  es: { general: "clase estándar", first: "primera clase" },
};
const booked: Record<Lang, (x: { day: string; dep: string; train: string; to: string; pax: string; cls: string; seats: string; total: string; pay: string }) => string> = {
  en: (x) => `${x.day}, ${x.dep}, ${x.train} to ${x.to}, ${x.pax}, ${x.cls}, ${x.seats}. Total ${x.total}. Please tap [${x.pay}] on the screen yourself to pay.`,
  ko: (x) => `${x.day} ${x.dep} 출발 ${x.to}행 ${x.train}, ${x.pax}, ${x.cls} ${x.seats}. 합계 ${x.total}으로 예약했어요. 결제는 화면의 [${x.pay}]를 직접 눌러 주세요.`,
  ja: (x) => `${x.day} ${x.dep}発 ${x.to}行き ${x.train}、${x.pax}、${x.cls} ${x.seats}。合計${x.total}で予約しました。お支払いは画面の［${x.pay}］をご自身で押してください。`,
  vi: (x) => `${x.day}, ${x.dep}, ${x.train} đi ${x.to}, ${x.pax}, ${x.cls}, ${x.seats}. Tổng ${x.total}. Để thanh toán, xin hãy tự bấm [${x.pay}] trên màn hình.`,
  zh: (x) => `${x.day}${x.dep}出发、开往${x.to}的${x.train}，${x.pax}，${x.cls} ${x.seats}。合计${x.total}，已预订。请您自己点屏幕上的［${x.pay}］付款。`,
  es: (x) => `${x.day}, ${x.dep}, ${x.train} a ${x.to}, ${x.pax}, ${x.cls}, ${x.seats}. Total ${x.total}. Para pagar, pulse usted [${x.pay}] en la pantalla.`,
};

// 누르기 전에 알아들은 것을 먼저 말한다(도착역·날·출발 시각·인원). 그 뒤에 'N번 눌러 드릴게요'
const lead: Record<Lang, (x: { day: string; dep: string; to: string; pax: string }) => string> = {
  en: (x) => `To ${x.to}, ${x.day.toLowerCase()} ${x.dep}, ${x.pax}.`,
  ko: (x) => `${x.to}행 ${x.day} ${x.dep}, ${x.pax}.`,
  ja: (x) => `${x.to}行き、${x.day} ${x.dep}、${x.pax}。`,
  vi: (x) => `Đi ${x.to}, ${x.day.toLowerCase()} ${x.dep}, ${x.pax}.`,
  zh: (x) => `去${x.to}，${x.day}${x.dep}，${x.pax}。`,
  es: (x) => `A ${x.to}, ${x.day.toLowerCase()} a las ${x.dep}, ${x.pax}.`,
};
export function planLead(s: KioskState, language: string) {
  const r = s.reservation;
  const leg = r && s.to ? legs(s.from, s.to).find((x) => x.train.no === r.trainNo) : undefined;
  if (!leg || !s.to) return "";
  const l = langOf(language);
  const [ad, ch, se, sep] = paxWords[l];
  const pax = [s.pax.adult ? ad(s.pax.adult) : "", s.pax.child ? ch(s.pax.child) : "", s.pax.senior ? se(s.pax.senior) : ""].filter(Boolean).join(sep);
  return lead[l]({ day: dayWord[l](s.day), dep: hhmm(leg.dep), to: findStation(s.to)!.name[l === "ko" ? "ko" : "en"], pax });
}

export function bookingSay(s: KioskState, language: string) {
  const r = s.reservation;
  const leg = r && s.to ? legs(s.from, s.to).find((x) => x.train.no === r.trainNo) : undefined;
  if (!r || !leg || !s.to) return "";
  const l = langOf(language);
  const ko = l === "ko";
  const [ad, ch, se, sep] = paxWords[l];
  const pax = [s.pax.adult ? ad(s.pax.adult) : "", s.pax.child ? ch(s.pax.child) : "", s.pax.senior ? se(s.pax.senior) : ""].filter(Boolean).join(sep);
  const total = ko ? `${r.total.toLocaleString("en-US")}원` : `₩${r.total.toLocaleString("en-US")}`;
  const seats = seatsText(r.seats, l);
  return booked[l]({ day: dayWord[l](s.day), dep: hhmm(leg.dep), train: trainName(leg.train)[ko ? "ko" : "en"], to: findStation(s.to)!.name[ko ? "ko" : "en"], pax, cls: clsWord[l][r.cls], seats: l === "en" ? seats.replace(/^Car/, "car") : seats, total, pay: t.pay[s.lang] ?? t.pay.en });
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
