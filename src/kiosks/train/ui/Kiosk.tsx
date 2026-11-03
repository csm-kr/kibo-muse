"use client";

// Bridge Rail 승차권 발매기 화면(세로형). 화면 순서와 문구는 한국 차세대 세로형 발매기(명세 K01–K11)를 따르고,
// 명세에서 찾지 못한 화면(가는날·시간, 좌석표)은 【추론】으로 채웠다. 사람의 터치와 KIBO의 조작은 모두 같은 step()을 거친다.

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { allListed, listed, pickedLeg, trainByNo, type KioskState, type Target } from "../machine";
import { DAYS_AHEAD, FIRST_HOUR, LAST_HOUR, STATIONS_PER_PAGE, TRAINS_PER_PAGE, WINDOW, cars, findStation, freeSeats, hhmm, isSold, paxTotal, seatId, stations, trainName, type Lang } from "../rail";
import { krFont } from "../../fastfood/ui/tokens";
import { dateLabel, duration, payMethods, seatLabel, t, won } from "./strings";
import { railVars } from "./tokens";

export type Highlight = { target: Target; value?: string } | null;

// 화면 520×820 + 아래 기기 칸 120, 테두리 10
export const KIOSK_W = 540;
export const KIOSK_H = 960;

interface KioskCtx {
  s: KioskState;
  press: (target: Target, value?: string) => void;
  // 오늘 날짜(YYYY-MM-DD). 브라우저에서만 읽는다(서버 렌더·미리 렌더에서는 "" → 날짜 칸이 비어 있다)
  today: string;
}
const Ctx = createContext<KioskCtx | null>(null);
const noop = () => () => {};
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const useK = () => useContext(Ctx)!;
const tr = (key: keyof typeof t, lang: Lang) => t[key][lang];
const stationName = (id: string | null, lang: Lang) => (id ? findStation(id)?.name[lang] ?? id : "");

// 값이 없는 버튼은 data-value를 달지 않는다(KIBO 포인터가 찾는 규칙)
function Btn({ target, value, className = "", children, disabled = false }: { target: Target; value?: string; className?: string; children: ReactNode; disabled?: boolean }) {
  const { press } = useK();
  return (
    <button type="button" data-target={target} data-value={value} onClick={() => press(target, value)} aria-disabled={disabled || undefined} className={`relative min-h-11 ${className}`}>
      {children}
    </button>
  );
}

const primary = "rounded-lg bg-(--br-wine) font-bold text-white active:bg-(--br-press)";
const plain = "rounded-lg border border-(--br-line) bg-white";

// 발매기 시계(고정 시각). 오늘 지난 시각의 열차를 왜 고를 수 없는지 보이게 한다
function Clock() {
  const { s, today } = useK();
  return (
    <span className="text-sm tabular-nums text-white/80" data-clock>
      {dateLabel(0, s.lang, today)} {String(s.nowHour).padStart(2, "0")}:00
    </span>
  );
}

function TopBar() {
  const { s } = useK();
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 bg-(--br-graphite) px-3 text-white">
      <div className="text-lg font-black tracking-tight">◗ Bridge Rail</div>
      <div className="mr-auto">
        <Clock />
      </div>
      <Btn target="home" className="rounded-md border border-white/40 px-3 text-sm">
        ⌂ {tr("home", s.lang)}
      </Btn>
      <Btn target="operator" className="rounded-md bg-(--br-wine) px-3 text-sm font-bold text-white">
        {tr("operator", s.lang)}
      </Btn>
    </div>
  );
}

function BottomBar({ back = false }: { back?: boolean }) {
  const { s } = useK();
  return (
    <div className="mt-auto flex h-12 shrink-0 items-center gap-3 border-t border-(--br-line) bg-[#F7F5F6] px-3 text-sm">
      <span className="text-(--br-muted)">♿ {tr("access", s.lang)}</span>
      {back && (
        <Btn target="back" className="rounded-md border border-(--br-muted) bg-white px-4">
          {tr("back", s.lang)}
        </Btn>
      )}
      <span className="ml-auto text-(--br-muted)">🔈 3 ▲▼</span>
    </div>
  );
}

function Frame({ children, back = false }: { children: ReactNode; back?: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">{children}</div>
      <BottomBar back={back} />
    </div>
  );
}

function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-2xl font-bold">{children}</div>
      {sub && <div className="mt-1 text-sm text-(--br-muted)">{sub}</div>}
    </div>
  );
}

function Idle() {
  const { s } = useK();
  return (
    <div className="flex h-full flex-col bg-(--br-graphite) p-6 text-white">
      <div className="flex items-center justify-between">
        <div className="text-2xl font-black tracking-tight">◗ Bridge Rail</div>
        <Clock />
      </div>
      <div className="mt-24 text-center text-2xl font-bold">{tr("chooseMenu", s.lang)}</div>
      <Btn target="start_reserve" className={`${primary} mt-8 py-12 text-4xl`}>
        🎫 {tr("buyTickets", s.lang)}
      </Btn>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
        {(["refund", "receipt", "lookup"] as const).map((k) => (
          <div key={k} className="rounded-lg border border-white/25 py-6 text-white/75">
            {tr(k, s.lang)}
          </div>
        ))}
      </div>
      <div className="mt-auto flex gap-3">
        {(["ko", "en"] as const).map((l) => (
          <Btn key={l} target="language" value={l} className={`flex-1 rounded-lg border ${s.lang === l ? "border-white bg-white font-bold text-(--br-ink)" : "border-white/40"}`}>
            <span lang={l}>{l === "ko" ? "한국어" : "English"}</span>
          </Btn>
        ))}
      </div>
      <div className="mt-3 text-center text-sm text-white/75">{tr("needHelp", s.lang)}</div>
    </div>
  );
}

function Row({ target, label, value }: { target: Target; label: string; value: ReactNode }) {
  return (
    <Btn target={target} className={`${plain} flex items-center px-4 py-3 text-left`}>
      <span className="w-24 text-sm text-(--br-muted)">{label}</span>
      <span className="flex-1 text-lg font-bold">{value}</span>
      <span className="text-(--br-muted)" aria-hidden>▶</span>
    </Btn>
  );
}

function Journey() {
  const { s, today } = useK();
  return (
    <Frame back>
      <Title>{tr("journeyTitle", s.lang)}</Title>
      <div className="flex rounded-lg border border-(--br-line) text-center text-sm">
        <div className="flex-1 rounded-l-lg bg-(--br-graphite) py-2 font-bold text-white">{tr("oneWay", s.lang)}</div>
        <div className="flex-1 py-2 text-neutral-500">{tr("roundTrip", s.lang)}</div>
      </div>
      <div className="flex items-stretch gap-2">
        <Btn target="open_from" className={`${plain} flex flex-1 flex-col items-center py-4`}>
          <span className="text-sm text-(--br-muted)">{tr("from", s.lang)}</span>
          <span className="text-xl font-bold">{stationName(s.from, s.lang)}</span>
        </Btn>
        <Btn target="swap" className="self-center rounded-full border-2 border-(--br-wine) bg-white px-3 py-2 text-sm font-bold text-(--br-wine)">
          {tr("swap", s.lang)}
        </Btn>
        <Btn target="open_to" className={`${plain} flex flex-1 flex-col items-center py-4`}>
          <span className="text-sm text-(--br-muted)">{tr("to", s.lang)}</span>
          <span className={`text-xl font-bold ${s.to ? "" : "text-(--br-wine)"}`}>{s.to ? stationName(s.to, s.lang) : tr("choose", s.lang)}</span>
        </Btn>
      </div>
      <Row target="open_date" label={tr("date", s.lang)} value={`${dateLabel(s.day, s.lang, today)} ${String(s.hour).padStart(2, "0")}:00`} />
      <Row target="open_pax" label={tr("people", s.lang)} value={s.lang === "ko" ? `총 ${paxTotal(s.pax)}명` : `${paxTotal(s.pax)} total`} />
      <div className={`${plain} flex items-center px-4 py-3 text-(--br-muted)`}>
        <span className="w-24 text-sm">{tr("seat", s.lang)}</span>
        <span className="text-lg">{tr("generalSeat", s.lang)}</span>
      </div>
      <Btn target="search" className={`${primary} mt-auto py-4 text-2xl`}>
        {tr("search", s.lang)}
      </Btn>
    </Frame>
  );
}

function Footer2({ cancel, ok, okLabel }: { cancel: Target; ok: Target; okLabel: string }) {
  const { s } = useK();
  return (
    <div className="mt-auto flex gap-3">
      <Btn target={cancel} className={`${plain} flex-1 py-3 text-lg`}>
        {tr("cancel", s.lang)}
      </Btn>
      <Btn target={ok} className={`${primary} flex-[2] py-3 text-lg`}>
        {okLabel}
      </Btn>
    </div>
  );
}

// K03 출/도착역 선택(팝업): 주요역 3열 격자, 쪽 넘김
function StationPopup() {
  const { s } = useK();
  const pages = Math.ceil(stations.length / STATIONS_PER_PAGE);
  const shown = stations.slice(s.stationPage * STATIONS_PER_PAGE, (s.stationPage + 1) * STATIONS_PER_PAGE);
  const other = s.stationField === "from" ? s.to : s.from;
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-neutral-900/50 p-4 pt-16">
      <div className="flex flex-1 flex-col gap-3 rounded-xl bg-white p-4" role="dialog" aria-modal="true" aria-label={tr("stationTitle", s.lang)}>
        <Title sub={`${s.stationField === "from" ? tr("from", s.lang) : tr("to", s.lang)} · ${tr("mainStations", s.lang)}`}>{tr("stationTitle", s.lang)}</Title>
        <div className="grid grid-cols-3 gap-2">
          {shown.map((st) => (
            <Btn key={st.id} target="station" value={st.id} className={`rounded-lg border py-4 text-base font-bold ${s.draftStation === st.id ? "border-(--br-wine) bg-(--br-wine) text-white" : st.id === other ? "border-neutral-200 text-neutral-300" : "border-neutral-300"}`}>
              {st.name[s.lang]}
            </Btn>
          ))}
        </div>
        <div className="flex items-center justify-center gap-4">
          <Btn target="page_prev" className={`${plain} px-5`}>
            ‹
          </Btn>
          <span className="text-sm">
            {s.stationPage + 1}/{pages}
          </span>
          <Btn target="page_next" className={`${plain} px-5`}>
            ›
          </Btn>
        </div>
        <Footer2 cancel="station_cancel" ok="station_done" okLabel={tr("done", s.lang)} />
      </div>
    </div>
  );
}

// K04 가는날·시간 【추론】: 오늘부터 7일 버튼 + 5–23시 버튼
function DateTime() {
  const { s, today } = useK();
  return (
    <Frame>
      <Title>{tr("dateTitle", s.lang)}</Title>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: DAYS_AHEAD }, (_, d) => (
          <Btn key={d} target="day" value={String(d)} className={`rounded-lg border py-2 text-sm ${s.draftDay === d ? "border-(--br-wine) bg-(--br-wine) font-bold text-white" : "border-neutral-300"}`}>
            {d === 0 ? `${tr("today", s.lang)} ` : ""}
            {dateLabel(d, s.lang, today)}
          </Btn>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i).map((h) => {
          const past = s.draftDay === 0 && h < s.nowHour;
          return (
            <Btn key={h} target="hour" value={String(h)} disabled={past} className={`rounded-lg border py-2 ${s.draftHour === h ? "border-(--br-wine) bg-(--br-wine) font-bold text-white" : past ? "border-neutral-200 text-neutral-300" : "border-neutral-300"}`}>
              {String(h).padStart(2, "0")}
              {s.lang === "ko" ? "시" : ":00"}
            </Btn>
          );
        })}
      </div>
      <Footer2 cancel="datetime_cancel" ok="datetime_done" okLabel={tr("ok", s.lang)} />
    </Frame>
  );
}

// K05 인원 −/+ (어른·어린이·경로만)
function Passengers() {
  const { s } = useK();
  return (
    <Frame>
      <Title>{tr("paxTitle", s.lang)}</Title>
      {(["adult", "child", "senior"] as const).map((k) => (
        <div key={k} className={`${plain} flex items-center px-4 py-3`}>
          <span className="flex-1 text-lg">{tr(k, s.lang)}</span>
          <Btn target="pax_minus" value={k} className="w-12 rounded-full border border-neutral-400 text-2xl">
            −
          </Btn>
          <span className="w-12 text-center text-2xl font-bold">{s.draftPax[k]}</span>
          <Btn target="pax_plus" value={k} className="w-12 rounded-full border border-neutral-400 text-2xl">
            +
          </Btn>
        </div>
      ))}
      <Footer2 cancel="pax_cancel" ok="pax_done" okLabel={tr("ok", s.lang)} />
    </Frame>
  );
}

// K06 열차 목록: 줄마다 열차 꼬리표·시각·소요·일반실/특실 칸
function TrainList() {
  const { s, today } = useK();
  const rows = listed(s);
  const pages = Math.max(1, Math.ceil(allListed(s).length / TRAINS_PER_PAGE));
  return (
    <Frame back>
      <div className="flex items-center gap-2">
        <Btn target="prev_day" className={`${plain} px-3 text-sm`}>
          {tr("prevDay", s.lang)}
        </Btn>
        <div className="flex-1 text-center font-bold">
          {dateLabel(s.day, s.lang, today)} {s.lang === "ko" ? `${String(s.hour).padStart(2, "0")}${tr("after", s.lang)}` : `${String(s.hour).padStart(2, "0")}${tr("after", s.lang)}`}
        </div>
        <Btn target="next_day" className={`${plain} px-3 text-sm`}>
          {tr("nextDay", s.lang)}
        </Btn>
      </div>
      <div className="text-center text-sm text-(--br-muted)">
        {stationName(s.from, s.lang)} → {stationName(s.to, s.lang)}
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((l) => (
          <div key={l.train.no} className="flex items-center gap-2 rounded-lg border border-(--br-line) p-2" data-train={l.train.no}>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-xs font-bold text-white ${l.train.type === "express" ? "bg-(--br-wine)" : "bg-neutral-600"}`}>{tr(l.train.type, s.lang)}</span>
                <span className="text-sm font-bold">{trainName(l.train)[s.lang]}</span>
              </div>
              <div className="text-lg font-bold">
                {hhmm(l.dep)} → {hhmm(l.arr)}
              </div>
              <div className="text-xs text-(--br-muted)">{duration(l.arr - l.dep, s.lang)}</div>
            </div>
            {(["general", "first"] as const).map((cls) => {
              const fare = l.fare[cls];
              if (fare === null) return <div key={cls} className="w-24 text-center text-neutral-300">—</div>;
              if (freeSeats(l.train, s.day, cls).length === 0)
                return (
                  <div key={cls} className="flex w-24 flex-col items-center rounded-lg bg-neutral-100 py-2 text-neutral-400">
                    <span className="text-xs">{tr(cls, s.lang)}</span>
                    <span className="font-bold">{tr("soldOut", s.lang)}</span>
                  </div>
                );
              return (
                <Btn key={cls} target="fare" value={`${l.train.no}:${cls}`} className={`flex w-24 flex-col items-center rounded-lg border py-2 ${s.pick?.trainNo === l.train.no && s.pick.cls === cls ? "border-2 border-(--br-wine) bg-(--br-rose)" : "border-(--br-line)"}`}>
                  <span className="text-xs text-(--br-muted)">{tr(cls, s.lang)}</span>
                  <span className="font-bold">{won(fare, s.lang)}</span>
                </Btn>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-center gap-4">
        <Btn target="page_prev" className={`${plain} px-5`}>
          ‹
        </Btn>
        <span className="text-sm">
          {s.listPage + 1}/{pages}
        </span>
        <Btn target="page_next" className={`${plain} px-5`}>
          ›
        </Btn>
      </div>
    </Frame>
  );
}

// K07 열차 정보(팝업)
function TrainInfo() {
  const { s } = useK();
  const leg = pickedLeg(s);
  if (!leg || !s.pick) return null;
  return (
    <div className="absolute inset-0 z-20 flex items-center bg-neutral-900/50 p-4">
      <div className="flex w-full flex-col gap-3 rounded-xl bg-white p-5" role="dialog" aria-modal="true" aria-label={tr("infoTitle", s.lang)}>
        <Title>{tr("infoTitle", s.lang)}</Title>
        <div className="text-lg font-bold">
          {trainName(leg.train)[s.lang]} · {tr(s.pick.cls, s.lang)}
        </div>
        <div>
          {hhmm(leg.dep)} {stationName(s.from, s.lang)} → {hhmm(leg.arr)} {stationName(s.to, s.lang)} · {duration(leg.arr - leg.dep, s.lang)}
        </div>
        <div className="rounded-lg bg-neutral-100 p-3 text-sm">{s.chosenSeats ? `${tr("chosen", s.lang)}: ${s.chosenSeats.map((x) => seatLabel(x, s.lang)).join(", ")}` : tr("autoSeats", s.lang)}</div>
        <Btn target="open_seats" className={`${plain} py-3 text-lg`}>
          💺 {tr("pickSeats", s.lang)}
        </Btn>
        <Footer2 cancel="info_cancel" ok="reserve" okLabel={tr("reserve", s.lang)} />
      </div>
    </div>
  );
}

// K08 좌석 선택 【추론】: 호차 탭 + 좌석표(창가 A·D)
function SeatSelect() {
  const { s } = useK();
  if (!s.pick || s.seatCar === null) return null;
  const train = trainByNo(s.pick.trainNo);
  const carList = cars(train).filter((c) => c.cls === s.pick!.cls);
  const car = carList.find((c) => c.car === s.seatCar)!;
  const n = paxTotal(s.pax);
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <Title sub={`${s.seatPicks.length}/${n} · ${tr("windowAD", s.lang)}`}>{tr("seatTitle", s.lang)}</Title>
        <div className="flex flex-wrap gap-1.5">
          {carList.map((c) => (
            <Btn key={c.car} target="car" value={String(c.car)} className={`rounded-md border px-3 text-sm ${c.car === s.seatCar ? "border-(--br-wine) bg-(--br-wine) font-bold text-white" : "border-neutral-300"}`}>
              {s.lang === "ko" ? `${c.car}${tr("car", s.lang)}` : `${tr("car", s.lang)} ${c.car}`}
            </Btn>
          ))}
        </div>
        <div className="flex gap-3 text-xs text-(--br-muted)">
          <span>□ {tr("free", s.lang)}</span>
          <span className="text-(--br-wine)">■ {tr("picked", s.lang)}</span>
          <span>▨ {tr("sold", s.lang)}</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-hidden">
          {Array.from({ length: car.rows }, (_, r) => r + 1).map((row) => (
            <div key={row} className="flex items-center gap-1">
              <span className="w-6 text-right text-xs text-(--br-muted)">{row}</span>
              {car.blocks.map((block, bi) => (
                <div key={bi} className={`flex gap-1 ${bi > 0 ? "ml-6" : ""}`}>
                  {block.map((letter) => {
                    const id = seatId(car.car, row, letter);
                    const win = WINDOW.includes(letter);
                    if (isSold(train, s.day, id)) return <div key={id} className="flex h-8 w-14 items-center justify-center rounded bg-neutral-200 text-xs text-neutral-400">▨</div>;
                    const on = s.seatPicks.includes(id);
                    return (
                      <Btn key={id} target="seat" value={id} className={`!min-h-8 h-8 w-14 rounded border text-xs ${on ? "border-(--br-wine) bg-(--br-wine) font-bold text-white" : win ? "border-[#C9A7B5] bg-(--br-rose)" : "border-(--br-line)"}`}>
                        {row}
                        {letter}
                      </Btn>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
        <Footer2 cancel="seats_cancel" ok="seats_done" okLabel={tr("done", s.lang)} />
      </div>
    </div>
  );
}

// K09 예약 확인: 10분 안에 결제. 결제하기는 사람만 누른다
function Reservation() {
  const { s, today } = useK();
  const r = s.reservation!;
  const leg = pickedLeg(s)!;
  const pax = [s.pax.adult && `${tr("adult", s.lang)} ${s.pax.adult}`, s.pax.child && `${tr("child", s.lang).split(" ")[0]} ${s.pax.child}`, s.pax.senior && `${tr("senior", s.lang).split(" ")[0]} ${s.pax.senior}`].filter(Boolean).join(" · ");
  return (
    <Frame>
      <Title>{tr("resTitle", s.lang)}</Title>
      <div className="flex flex-col gap-2 rounded-xl border border-(--br-line) p-4">
        <div className="text-xl font-bold">
          {stationName(s.from, s.lang)} {hhmm(leg.dep)} → {stationName(s.to, s.lang)} {hhmm(leg.arr)}
        </div>
        <div>
          {dateLabel(s.day, s.lang, today)} · {trainName(trainByNo(r.trainNo))[s.lang]} · {tr(r.cls, s.lang)}
        </div>
        <div data-seats>{r.seats.map((x) => seatLabel(x, s.lang)).join(", ")}</div>
        <div className="text-(--br-muted)">{pax}</div>
        <div className="mt-2 flex items-baseline justify-between border-t pt-3">
          <span>{tr("total", s.lang)}</span>
          <span className="text-2xl font-bold">{won(r.total, s.lang)}</span>
        </div>
      </div>
      <div className="rounded-lg bg-red-50 p-3 text-center font-bold text-red-700">{tr("holdNote", s.lang)}</div>
      <div className="mt-auto flex gap-3">
        <Btn target="cancel_reservation" className={`${plain} flex-1 py-4 text-lg`}>
          {tr("cancelRes", s.lang)}
        </Btn>
        <Btn target="pay" className={`${primary} flex-[2] py-4 text-2xl`}>
          {tr("pay", s.lang)}
        </Btn>
      </div>
    </Frame>
  );
}

// K10 결제 수단
function PayMethod() {
  const { s } = useK();
  const total = s.reservation!.total;
  return (
    <Frame back>
      <Title>{tr("payTitle", s.lang)}</Title>
      <div className="flex flex-col gap-1 rounded-xl border border-(--br-line) p-4">
        <div className="flex justify-between">
          <span>{tr("fare", s.lang)}</span>
          <span>{won(total, s.lang)}</span>
        </div>
        <div className="flex justify-between">
          <span>{tr("discount", s.lang)}</span>
          <span>{won(0, s.lang)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t pt-2 text-xl font-bold">
          <span>{tr("finalPay", s.lang)}</span>
          <span>{won(total, s.lang)}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {payMethods.map((m) => (
          <Btn key={m.id} target="pay_method" value={m.id} className={`${plain} py-6 text-lg font-bold`}>
            {m.name[s.lang]}
          </Btn>
        ))}
      </div>
    </Frame>
  );
}

// K11 카드 투입(30초). 카드는 아래 기기 칸에서 사람이 넣는다
function CardInsert() {
  const { s } = useK();
  return (
    <Frame back>
      <div className="mt-16 text-center text-2xl font-bold">{tr("insertTitle", s.lang)}</div>
      <div className="text-center text-(--br-muted)">{tr("insertSub", s.lang)}</div>
      <div className="mx-auto my-6 flex h-40 w-56 items-end justify-center rounded-xl bg-neutral-800 pb-4">
        <div className="h-3 w-32 rounded bg-neutral-950" />
      </div>
      <div className="text-center text-4xl motion-safe:animate-bounce">💳 ↓</div>
      <div className="mt-auto text-center font-bold text-red-700">{tr("timeout30", s.lang)}</div>
    </Frame>
  );
}

function Printing() {
  const { s } = useK();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-(--br-graphite) text-white">
      <div className="text-6xl">🖨️</div>
      <div className="text-2xl font-bold">{tr("printing", s.lang)}</div>
    </div>
  );
}

function Complete() {
  const { s } = useK();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-(--br-graphite) p-6 text-white">
      <div className="text-6xl">🎫</div>
      <div className="text-2xl font-bold">{tr("complete", s.lang)}</div>
      <Btn target="finish" className={`${primary} w-full py-4 text-xl`}>
        {tr("ok", s.lang)}
      </Btn>
    </div>
  );
}

function PopupLayer() {
  const { s } = useK();
  if (!s.popup) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-900/50 p-6" role="dialog" aria-modal="true" aria-label={s.popup === "operator" ? tr("operator", s.lang) : tr("notEnough", s.lang)} data-popup={s.popup}>
      <div className="flex w-full flex-col items-center gap-5 rounded-xl bg-white p-6 text-center">
        <div className="text-5xl">{s.popup === "operator" ? "🎧" : "⚠️"}</div>
        <div className="text-lg font-bold">{s.popup === "operator" ? tr("operatorBody", s.lang) : tr("notEnough", s.lang)}</div>
        <Btn target="close_popup" className={`${primary} w-full py-3 text-lg`}>
          {s.popup === "operator" ? tr("close", s.lang) : tr("ok", s.lang)}
        </Btn>
      </div>
    </div>
  );
}

// 화면 아래 기기: 카드 넣는 곳(사람이 넣는다), 승차권 나오는 곳
function Devices({ onCard, waitCard }: { onCard: () => void; waitCard: boolean }) {
  const { s } = useK();
  const tickets = s.screen === "complete" && s.reservation ? s.reservation.seats : [];
  return (
    <div className="flex h-[120px] gap-3 bg-neutral-800 p-3 text-white">
      <div className={`flex w-48 flex-col gap-2 rounded-xl border-2 p-2 ${waitCard ? "border-orange-400 bg-orange-500/20 motion-safe:animate-pulse" : "border-neutral-600"}`}>
        <div className="text-xs font-bold">{tr("cardSlot", s.lang)}</div>
        <button type="button" data-device="card" onClick={onCard} className="min-h-11 rounded-lg bg-neutral-200 text-sm font-bold text-neutral-900 hover:brightness-110">
          {tr("insertCard", s.lang)}
        </button>
      </div>
      <div className="flex-1 rounded-xl border-2 border-neutral-600 p-2">
        <div className="text-xs font-bold">{tr("ticketOut", s.lang)}</div>
        <div className="mt-1 flex flex-wrap gap-1" data-device="tickets">
          {tickets.map((x) => (
            <div key={x} className="rounded bg-white px-2 py-0.5 text-xs text-neutral-900 shadow">
              🎫 {seatLabel(x, s.lang)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const screens: Record<KioskState["screen"], () => ReactNode> = {
  idle: Idle,
  journey: Journey,
  station: () => (
    <>
      <Journey />
      <StationPopup />
    </>
  ),
  datetime: DateTime,
  passengers: Passengers,
  train_list: TrainList,
  train_info: () => (
    <>
      <TrainList />
      <TrainInfo />
    </>
  ),
  seat_select: SeatSelect,
  reservation: Reservation,
  pay_method: PayMethod,
  card_insert: CardInsert,
  printing: Printing,
  complete: Complete,
};

// KIBO가 누르는 자리는 banner 층의 KiboPointer가 보인다
export function TrainKiosk({ state, press, banner, onCard, waitCard }: { state: KioskState; press: KioskCtx["press"]; banner?: ReactNode; onCard: () => void; waitCard: boolean }) {
  const Screen = screens[state.screen];
  const today = useSyncExternalStore(noop, localToday, () => "");
  return (
    <Ctx.Provider value={{ s: state, press, today }}>
      <div lang={state.lang} style={{ ...railVars, fontFamily: krFont }} className="w-[540px] overflow-hidden rounded-[28px] border-[10px] border-neutral-800 bg-neutral-800 shadow-2xl">
        <div className="relative h-[820px] overflow-hidden bg-white text-(--br-ink)" data-screen={state.screen}>
          <Screen />
          <PopupLayer />
          {banner}
        </div>
        <Devices onCard={onCard} waitCard={waitCard} />
      </div>
    </Ctx.Provider>
  );
}
