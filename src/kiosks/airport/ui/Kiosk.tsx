"use client";

// Bridge Air 셀프 체크인 키오스크 화면 (1024×768 가로형).
// 화면 순서·배치·문구는 인천공항 공식 영상의 실제 키오스크(명세 V1)를 따르고, 색과 이름은 가상 브랜드다.
// 화면 아래에 여권 리더기·프린터 같은 기기 패널을 그린다. 여권은 사람만 넣을 수 있다.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { BAG_ALLOWANCE, BLOCKS, EXCESS_FEE, FIRST_ROW, MAX_BAGS, MAX_OFFSET, ROWS, VISIBLE_ROWS, airlines, booking, findPassenger, isExit, isPaid, isTakenByOthers, type Lang } from "../booking";
import { seatHolder, type KioskState, type Target } from "../machine";
import { krFont } from "../../fastfood/ui/tokens";
import { circled, t, won } from "./strings";
import { airVars } from "./tokens";

export type Highlight = { target: Target; value?: string } | null;

interface Ctx {
  s: KioskState;
  press: (target: Target, value?: string) => void;
}
const K = createContext<Ctx | null>(null);
const useK = () => useContext(K)!;
const tr = (key: keyof typeof t, lang: Lang) => t[key][lang];

function Btn({ target, value, className = "", children, label }: { target: Target; value?: string; className?: string; children: ReactNode; label?: string }) {
  const { press } = useK();
  return (
    <button
      type="button"
      aria-label={label}
      data-target={target}
      data-value={value}
      onClick={() => press(target, value)}
      className={`relative ${className}`}
    >
      {children}
    </button>
  );
}

const Primary = ({ target, children }: { target: Target; children: ReactNode }) => (
  <Btn target={target} className="flex min-h-14 items-center gap-3 rounded-lg bg-(--ba-violet) py-3 pr-3 pl-6 text-xl font-bold text-white shadow active:bg-(--ba-press)">
    {children}
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg text-(--ba-violet)">❯</span>
  </Btn>
);

function Clock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const f = () => setNow(new Date().toTimeString().slice(0, 5));
    f();
    const id = setInterval(f, 10_000);
    return () => clearInterval(id);
  }, []);
  return <div className="text-lg text-(--ba-muted)">◷ {now}</div>;
}

function LangTabs() {
  const { s } = useK();
  return (
    <div className="flex gap-1">
      {(["ko", "en"] as const).map((l) => (
        <Btn key={l} target="language" value={l} className={`min-h-11 rounded-t-lg px-5 text-base ${s.lang === l ? "bg-white font-bold text-(--ba-plum)" : "bg-white/15 text-white"}`}>
          {s.lang === l && "✔ "}
          {l === "ko" ? "한국어" : "English"}
        </Btn>
      ))}
    </div>
  );
}

function Frame({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  const { s } = useK();
  const airline = airlines.find((a) => a.id === s.airline);
  const banner = s.banner && { no_booking: tr("noBooking", s.lang), already_added: tr("alreadyAdded", s.lang), seat_changed: tr("seatChanged", s.lang), passport_only: tr("passportOnly", s.lang) }[s.banner];
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-end justify-between bg-(--ba-plum) px-4">
        <LangTabs />
        {airline && (
          <div className="mb-2 font-black tracking-wide text-white">
            {airline.mark} {airline.name.en.toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex items-end justify-between border-b-4 border-(--ba-plum) px-4 pt-3">
        <div className="rounded-t-lg bg-(--ba-plum) px-6 py-2 text-xl font-bold text-white">{title}</div>
        <Clock />
      </div>
      {banner && <div className={`px-6 py-2 text-lg font-bold ${s.banner === "seat_changed" ? "bg-emerald-50 text-emerald-700" : s.banner === "passport_only" ? "bg-(--ba-tint) text-(--ba-plum)" : "bg-red-50 text-red-700"}`}>{banner}</div>}
      <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">{children}</div>
      <div className="flex h-20 items-center gap-3 border-t border-(--ba-line) bg-[#FAF8FC] px-4">
        <Btn target="exit" className="flex min-h-11 items-center gap-2 rounded-lg border border-(--ba-line) bg-white px-4 text-lg">
          ⓧ {tr("exit", s.lang)}
        </Btn>
        <Btn target="help" className="flex min-h-11 items-center gap-2 rounded-lg border border-(--ba-line) bg-white px-4 text-lg">
          ? {tr("help", s.lang)}
        </Btn>
        <div className="ml-auto flex items-center gap-3">{right}</div>
      </div>
    </div>
  );
}

const name = (id: string) => {
  const p = findPassenger(id)!;
  return `${p.title === "MR" ? "Mr" : "Ms"} ${p.given[0]}${p.given.slice(1).toLowerCase()} ${p.family[0]}${p.family.slice(1).toLowerCase()}`;
};

function Idle() {
  const { s } = useK();
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-(--ba-tint) to-white">
      <div className="flex h-12 items-end bg-(--ba-plum) px-4">
        <LangTabs />
      </div>
      <div className="mt-12 text-center">
        <div className="text-4xl font-black text-(--ba-plum)">{tr("selfCheckin", s.lang)}</div>
        <div className="mt-3 text-2xl text-(--ba-ink)">{tr("selectAirline", s.lang)}</div>
        <div className="text-lg text-(--ba-muted)">{s.lang === "ko" ? "Please select your airline." : "항공사를 선택해 주세요."}</div>
      </div>
      <div className="mx-auto mt-10 grid w-[720px] grid-cols-2 gap-6">
        {airlines.map((a) => (
          <Btn key={a.id} target="airline" value={a.id} className="flex h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-(--ba-line) bg-white shadow-md active:border-(--ba-violet)">
            <span className="text-5xl text-(--ba-violet)">{a.mark}</span>
            <span className="text-2xl font-bold">{a.name[s.lang]}</span>
          </Btn>
        ))}
      </div>
    </div>
  );
}

function DangerousGoods() {
  const { s } = useK();
  const L = (k: keyof typeof t) => tr(k, s.lang);
  const left: [string, keyof typeof t][] = [
    ["💥", "dgExplosive"],
    ["🔥", "dgFlammable"],
    ["☣️", "dgToxic"],
    ["🔋", "dgOther"],
  ];
  const right: [string, keyof typeof t][] = [
    ["🔪", "dgBlades"],
    ["🏏", "dgSports"],
    ["🔫", "dgGuns"],
    ["🥋", "dgMartial"],
    ["🔧", "dgTools"],
  ];
  const col = (head: string, rows: [string, keyof typeof t][]) => (
    <div className="flex-1 rounded-lg border border-(--ba-line)">
      <div className="rounded-t-lg bg-(--ba-tint) px-3 py-2 text-sm font-bold text-(--ba-plum)">{head}</div>
      {rows.map(([icon, k]) => (
        <div key={k} className="flex items-center gap-3 border-t border-neutral-100 px-3 py-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-2xl">{icon}</span>
          <span className="text-sm leading-tight">{L(k)}</span>
        </div>
      ))}
    </div>
  );
  return (
    <Frame
      title={L("dgTitle")}
      right={
        <Btn target="accept_dangerous_goods" className="flex min-h-14 items-center gap-3 rounded-lg bg-(--ba-violet) py-3 pr-3 pl-6 text-lg font-bold text-white shadow active:bg-(--ba-press)">
          {L("dgAgree")}
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-(--ba-violet)">❯</span>
        </Btn>
      }
    >
      <div className="flex gap-4">
        {col(L("dgLeftHead"), left)}
        {col(L("dgRightHead"), right)}
      </div>
      <PowerBanks />
    </Frame>
  );
}

// 보조배터리 카드 Check 1–4 (인천공항 키오스크 영상 프레임). 위험물 관문 화면에 붙는다
function PowerBanks() {
  const { s } = useK();
  const L = (k: keyof typeof t) => tr(k, s.lang);
  const card = (n: number, title: keyof typeof t, body: ReactNode) => (
    <div className="flex-1 rounded-lg border border-(--ba-line) bg-[#FAF8FC] p-2">
      <div className="mb-1 flex items-start justify-between gap-1">
        <span className="text-[13px] leading-tight font-bold text-(--ba-plum)">{L(title)}</span>
        <span className="shrink-0 rounded-full bg-(--ba-violet) px-1.5 text-[11px] font-bold text-white">Check {n}</span>
      </div>
      <div className="space-y-0.5 text-xs leading-snug">{body}</div>
    </div>
  );
  return (
    <div className="mt-3 flex gap-2" data-powerbank>
      {card(
        1,
        "pb1Title",
        <>
          <div>🔋 ✔ {L("pb1a")}</div>
          <div className="text-red-700">🔋 ✕ {L("pb1b")}</div>
          <div className="text-red-700">🔌 ✕ {L("pb1c")}</div>
        </>,
      )}
      {card(
        2,
        "pb2Title",
        <>
          <div className="font-mono font-bold">(mAh × V) ÷ 1,000 = Wh</div>
          <div>{L("pb2b")}</div>
        </>,
      )}
      {card(
        3,
        "pb3Title",
        <>
          <div>✔ {L("pb3a")}</div>
          <div>✔ {L("pb3b")}</div>
          <div>✔ {L("pb3c")}</div>
        </>,
      )}
      {card(
        4,
        "pb4Title",
        <>
          <div>✔ {L("pb4a")}</div>
          <div className="text-red-700">✕ {L("pb4b")}</div>
          <div className="text-red-700">✕ {L("pb4c")}</div>
        </>,
      )}
    </div>
  );
}

// S02b 조회 방법 선택: 여권 / 예약번호 / QR코드·바코드 / 전자항공권 번호
function Lookup() {
  const { s } = useK();
  const L = (k: keyof typeof t) => tr(k, s.lang);
  const opts: [string, keyof typeof t, string][] = [
    ["passport", "lookupPassport", "🛂"],
    ["booking_ref", "lookupBooking", "🔤"],
    ["qr", "lookupQr", "▦"],
    ["eticket", "lookupEticket", "🎫"],
  ];
  return (
    <Frame title={L("lookupTitle")}>
      <div className="mx-auto mt-4 grid w-[760px] grid-cols-2 gap-6">
        {opts.map(([value, label, icon]) => (
          <Btn key={value} target="lookup" value={value} className="flex h-44 flex-col overflow-hidden rounded-xl border-2 border-(--ba-line) bg-white shadow active:border-(--ba-violet)">
            <span className="w-full bg-(--ba-plum) py-2.5 text-lg font-bold text-white">{L(label)}</span>
            <span className="flex flex-1 items-center justify-center text-6xl">{icon}</span>
          </Btn>
        ))}
      </div>
    </Frame>
  );
}

function ScanArt() {
  return (
    <div className="flex flex-col items-center">
      <div className="text-6xl text-(--ba-violet) motion-safe:animate-bounce">⬆</div>
      <div className="flex h-28 w-64 flex-col items-center justify-center rounded-xl border-4 border-neutral-500 bg-neutral-800 text-white">
        <div className="text-sm">여권 PASSPORT</div>
        <div className="mt-2 h-2 w-48 rounded bg-neutral-500" />
      </div>
    </div>
  );
}

function Passport({ add }: { add?: boolean }) {
  const { s } = useK();
  return (
    <Frame title={tr(add ? "addTitle" : "passportTitle", s.lang)} right={add && <Btn target="cancel_add" className="min-h-14 rounded-lg border border-(--ba-muted) bg-white px-5 text-lg">ⓧ {tr("cancelAdd", s.lang)}</Btn>}>
      <div className="flex h-full items-center gap-10 px-6">
        <ScanArt />
        <div className="space-y-6 text-2xl leading-snug">
          <p>{tr("scanStep1", s.lang)}</p>
          <p>{tr("scanStep2", s.lang)}</p>
        </div>
      </div>
    </Frame>
  );
}

function Passengers() {
  const { s } = useK();
  return (
    <Frame title={tr("passportTitle", s.lang)} right={<Primary target="proceed">{tr("proceedN", s.lang).replace("{n}", String(s.scanned.length))}</Primary>}>
      <div className="flex h-full gap-6">
        <div className="flex w-56 flex-col items-center justify-center gap-4 rounded-xl bg-(--ba-tint) text-7xl">
          <span>📘</span>
          <span>📖</span>
        </div>
        <div className="flex-1">
          <div className="mb-2 text-xl font-bold">{tr("toCheckIn", s.lang)}</div>
          <table className="w-full text-lg">
            <tbody>
              {s.scanned.map((id) => {
                const p = findPassenger(id)!;
                return (
                  <tr key={id} className="border-b border-neutral-200">
                    <td className="py-3 font-bold">{name(id)}</td>
                    <td className="text-emerald-700">✔</td>
                    <td>
                      {tr("passportNo", s.lang)} ****{p.passportNo.slice(-4)}
                    </td>
                    <td>
                      {tr("nationality", s.lang)} {p.nationality[s.lang]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-6 flex justify-end">
            <Btn target="add_companion" className="min-h-12 rounded-lg border-2 border-(--ba-violet) bg-white px-5 text-lg font-bold text-(--ba-violet)">
              {tr("addCompanion", s.lang)} ⊕
            </Btn>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function FlightInfo() {
  const { s } = useK();
  const f = booking.flight;
  const L = (k: keyof typeof t) => tr(k, s.lang);
  return (
    <Frame title={L("flightInfoTitle")} right={<Primary target="confirm_checkin">{L("confirmCheckin")}</Primary>}>
      <table className="w-full text-lg">
        <thead>
          <tr className="bg-neutral-100 text-left text-base">
            <th className="px-3 py-2">{L("paxName")}</th>
            <th className="px-3 py-2">{L("mileageCard")}</th>
          </tr>
        </thead>
        <tbody>
          {s.scanned.map((id, i) => (
            <tr key={id} className="border-b border-neutral-200">
              <td className="px-3 py-2 font-bold">
                {circled(i)} {name(id)}
              </td>
              <td className="px-3 py-2 text-neutral-500">{L("noMileage")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex justify-end gap-3">
        <Btn target="mileage" className="min-h-11 rounded-lg border border-(--ba-muted) bg-white px-4 text-base font-bold">
          {L("mileage")}
        </Btn>
        <Btn target="add_companion" className="min-h-11 rounded-lg border-2 border-(--ba-violet) bg-white px-4 text-base font-bold text-(--ba-violet)">
          {L("addCompanion")} ⊕
        </Btn>
      </div>
      <table className="mt-6 w-full text-lg">
        <thead>
          <tr className="bg-neutral-100 text-left text-base">
            <th className="px-3 py-2">{L("flightNo")}</th>
            <th className="px-3 py-2">
              {L("from")} → {L("to")}
            </th>
            <th className="px-3 py-2">{L("departure")}</th>
            <th className="px-3 py-2">{L("seatInfo")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-3 font-bold">{f.no}</td>
            <td className="px-3 py-3">
              {f.from.city[s.lang]} ({f.from.code}) {f.dep} ✈ {f.to.city[s.lang]} ({f.to.code}) {f.arr}
            </td>
            <td className="px-3 py-3">{f.date}</td>
            <td className="px-3 py-3">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold">{s.scanned.map((p) => s.seats[p]).join(", ")}</span>
                <Btn target="open_seat_map" className="min-h-11 rounded-lg bg-(--ba-violet) px-4 text-base font-bold text-white active:bg-(--ba-press)">
                  {L("seatMap")}
                </Btn>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </Frame>
  );
}

function Seat({ seat }: { seat: string }) {
  const { s } = useK();
  const holder = seatHolder(s, seat);
  const ours = holder && s.scanned.includes(holder) ? s.scanned.indexOf(holder) : -1;
  const taken = (holder && ours < 0) || (!holder && isTakenByOthers(seat));
  const paid = !taken && isPaid(seat);
  const exit = !taken && isExit(seat);
  // 범례 4종: 선택불가(회색 ✕) / 선택가능(연보라) / 일행선택(베리) / 현재선택(보라 ✓). 유료(S, 점선 테두리)·비상구(진한 테두리)는 덧붙인 표시
  const current = ours >= 0 && holder === s.seatSel;
  const cls =
    ours >= 0
      ? current
        ? "bg-(--ba-violet) text-white ring-2 ring-(--ba-plum) ring-offset-1"
        : "bg-(--ba-berry) text-white"
      : taken
        ? "bg-neutral-200 text-neutral-600"
        : paid
          ? "border-2 border-dashed border-(--ba-violet) bg-white text-(--ba-violet)"
          : exit
            ? "border-2 border-(--ba-plum) bg-(--ba-lilac) text-(--ba-ink)"
            : "bg-(--ba-lilac) text-(--ba-ink)";
  return (
    <Btn target="seat" value={seat} label={seat} className={`flex h-9 w-11 items-center justify-center rounded-t-lg rounded-b text-sm font-bold ${cls}`}>
      {ours >= 0 ? `${current ? "✓" : ""}${circled(ours)}` : taken ? "✕" : paid ? "S" : ""}
    </Btn>
  );
}

function SeatMap() {
  const { s } = useK();
  const L = (k: keyof typeof t) => tr(k, s.lang);
  const rows = ROWS.slice(s.seatOffset, s.seatOffset + VISIBLE_ROWS);
  const f = booking.flight;
  return (
    <Frame
      title={L("seatTitle")}
      right={
        <>
          <Btn target="seat_back" className="min-h-14 rounded-lg border border-(--ba-muted) bg-white px-6 text-xl">
            {L("back")}
          </Btn>
          <Primary target="seat_continue">{L("continue")}</Primary>
        </>
      }
    >
      <div className="flex h-full gap-4">
        <div className="w-56 space-y-2">
          {s.scanned.map((id, i) => (
            <Btn key={id} target="select_passenger" value={id} className={`w-full rounded-lg border-2 px-3 py-2 text-left ${s.seatSel === id ? "border-(--ba-violet) bg-(--ba-tint)" : "border-(--ba-line) bg-white"}`}>
              <div className="font-bold">
                {circled(i)} {name(id)}
              </div>
              <div className="font-mono text-lg">{s.seatDraft?.[id]}</div>
            </Btn>
          ))}
        </div>
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-3 text-sm">
            <b>{f.no}</b> {f.from.city.en} ({f.from.code}) ········ {f.to.city.en} ({f.to.code}) <span className="ml-auto text-(--ba-muted)">Widebody {f.aircraft}</span>
          </div>
          <div className="space-y-1">
            {rows.map((row) => (
              <div key={row} className="flex items-center gap-1">
                <span className="w-9 text-center text-[11px] font-bold text-(--ba-plum)">{row === FIRST_ROW ? "EXIT" : <span className="text-base font-normal text-neutral-300">(</span>}</span>
                {BLOCKS.map((block, bi) => (
                  <div key={bi} className="flex items-center gap-1">
                    {bi > 0 && <span className="w-8 text-center text-xs text-(--ba-muted)">{row}</span>}
                    {block.map((l) => (
                      <Seat key={l} seat={`${row}${l}`} />
                    ))}
                  </div>
                ))}
                <span className="w-9 text-center text-[11px] font-bold text-(--ba-plum)">{row === FIRST_ROW ? "EXIT" : <span className="text-base font-normal text-neutral-300">)</span>}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-legend>
            <span>
              <span className="inline-block h-3 w-3 bg-neutral-200" />✕ {L("legendTaken")}
            </span>
            <span>
              <span className="inline-block h-3 w-3 bg-(--ba-lilac)" /> {L("legendAvail")}
            </span>
            <span>
              <span className="inline-block h-3 w-3 bg-(--ba-berry)" /> {L("legendCompanion")}
            </span>
            <span>
              <span className="inline-block h-3 w-3 bg-(--ba-violet)" />✓ {L("legendCurrent")}
            </span>
            <span className="text-neutral-300">|</span>
            <span>
              <span className="inline-block h-3 w-3 border-2 border-dashed border-(--ba-violet) bg-white" />S {L("legendPaid")}
            </span>
            <span>
              <span className="inline-block h-3 w-3 border-2 border-(--ba-plum) bg-(--ba-lilac)" /> {L("legendExit")}
            </span>
          </div>
        </div>
        <div className="flex w-20 flex-col items-center gap-2">
          <Btn target="scroll_up" label="scroll up" className="h-12 w-14 rounded-lg bg-(--ba-violet) text-2xl text-white active:bg-(--ba-press)">
            ▲
          </Btn>
          <div className="text-xs">{L("front")}</div>
          <div className="relative h-48 w-8 rounded-full border-2 border-(--ba-line)">
            <div className="absolute inset-x-0 rounded-full bg-(--ba-lilac)" style={{ top: `${(s.seatOffset / ROWS.length) * 100}%`, height: `${(VISIBLE_ROWS / ROWS.length) * 100}%` }} />
          </div>
          <div className="text-xs">{L("rear")}</div>
          <Btn target="scroll_down" label="scroll down" className="h-12 w-14 rounded-lg bg-(--ba-violet) text-2xl text-white active:bg-(--ba-press)">
            ▼
          </Btn>
          <div className="text-xs text-(--ba-muted)">{s.seatOffset >= MAX_OFFSET ? "" : `${FIRST_ROW + s.seatOffset + VISIBLE_ROWS}+`}</div>
        </div>
      </div>
    </Frame>
  );
}

function BagsQuestion() {
  const { s } = useK();
  return (
    <Frame title={tr("bagsTitle", s.lang)}>
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="mb-4 text-3xl font-bold">{tr("bagsQuestion", s.lang).replace("{city}", `${booking.flight.to.city[s.lang]} (${booking.flight.to.code})`)}</div>
        <Btn target="bags_none" className="w-96 rounded-full border-2 border-(--ba-violet) bg-white py-5 text-2xl font-bold text-(--ba-violet)">
          {tr("noBags", s.lang)}
        </Btn>
        <div className="text-(--ba-muted)">{tr("or", s.lang)}</div>
        <Btn target="bags_yes" className="w-96 rounded-full bg-(--ba-violet) py-5 text-2xl font-bold text-white active:bg-(--ba-press)">
          🧳 {tr("haveBags", s.lang)}
        </Btn>
      </div>
    </Frame>
  );
}

function BagCount() {
  const { s } = useK();
  const L = (k: keyof typeof t) => tr(k, s.lang);
  const total = Object.values(s.bags).reduce((a, b) => a + b, 0);
  const over = (n: number) => Math.max(0, n - BAG_ALLOWANCE);
  const fee = Object.values(s.bags).reduce((a, n) => a + over(n) * EXCESS_FEE, 0);
  return (
    <Frame
      title={L("bagCountTitle")}
      right={<Primary target="bags_continue">{L("continue")}</Primary>}
    >
      <div className="mb-3 text-2xl">{L("chooseBags")}</div>
      <table className="w-full text-lg">
        <thead>
          <tr className="bg-neutral-100 text-left text-base">
            <th className="px-3 py-2">{L("paxName")}</th>
            <th className="px-3 py-2">{L("bagsToCheck")}</th>
            <th className="px-3 py-2">{L("excess")}</th>
          </tr>
        </thead>
        <tbody>
          {s.scanned.map((id) => (
            <tr key={id} className="border-b border-neutral-200">
              <td className="px-3 py-3 font-bold">{name(id)}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-1">
                  <span className="text-(--ba-muted)" aria-hidden>◀</span>
                  {Array.from({ length: MAX_BAGS + 1 }, (_, n) => (
                    <Btn key={n} target="set_bags" value={`${id}:${n}`} className={`h-12 w-14 rounded border-2 text-xl font-bold ${s.bags[id] === n ? "border-(--ba-plum) bg-(--ba-violet) text-white" : "border-(--ba-line) bg-white"}`}>
                      {s.bags[id] === n && "✔"}
                      {n}
                    </Btn>
                  ))}
                  <span className="text-(--ba-muted)" aria-hidden>▶</span>
                </div>
              </td>
              <td className="px-3 py-3">
                {over(s.bags[id] ?? 0)} 🧳 {won(over(s.bags[id] ?? 0) * EXCESS_FEE)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-between text-lg">
        <Btn target="show_allowance" className="min-h-11 rounded-lg border border-(--ba-muted) bg-white px-4">
          {L("allowanceBtn")}
        </Btn>
        <div>
          {L("sum")} <b>{total} bag(s)</b> · {L("sum")} <b>{won(fee)}</b>
        </div>
      </div>
    </Frame>
  );
}

// 문서별로 몇 장 나왔는지 센다(Qantas 키오스크 「Bag tag 2/3 · Boarding pass 0/3」). 수하물 태그부터 나온다
// 발급 화면은 Station의 PRINT_MS(2.5초) 동안 떠 있으니, 문서가 많아도 2.2초 안에 다 세어지게 한다
const PRINT_ALL_MS = 2200;
function Printing() {
  const { s } = useK();
  const passes = s.scanned.length;
  const tags = Object.values(s.bags).reduce((a, b) => a + b, 0);
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((v) => Math.min(v + 1, passes + tags)), Math.min(450, PRINT_ALL_MS / (passes + tags)));
    return () => clearInterval(id);
  }, [passes, tags]);
  const row = (label: string, done: number, total: number, what: string) => (
    <div className="flex w-[420px] items-center justify-between border-b border-neutral-200 py-3 text-2xl">
      <span>{label}</span>
      <span className="rounded border-2 border-(--ba-violet) px-4 py-1 font-mono font-bold text-(--ba-plum) tabular-nums" data-print={what}>
        {done}/{total}
      </span>
    </div>
  );
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 bg-[#FAF8FC]">
      <div className="text-3xl font-bold">{tr("printing", s.lang)}</div>
      <div>
        {row(tr("printBoarding", s.lang), Math.max(0, n - tags), passes, "boarding_pass")}
        {tags > 0 && row(tr("printBagTag", s.lang), Math.min(n, tags), tags, "bag_tag")}
      </div>
      <div className="flex gap-2 rounded-full bg-(--ba-tint) px-6 py-3">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="h-3 w-3 rounded-full bg-(--ba-violet) motion-safe:animate-pulse" style={{ animationDelay: `${i * 90}ms` }} />
        ))}
      </div>
    </div>
  );
}

function Complete() {
  const { s } = useK();
  const f = booking.flight;
  const L = (k: keyof typeof t) => tr(k, s.lang);
  return (
    <Frame
      title={L("finish")}
      right={
        <>
          <div className="rounded-lg border border-(--ba-line) bg-white px-4 py-3 text-base text-(--ba-muted)">{L("itinerary")}</div>
          <Primary target="finish">{L("finish")}</Primary>
        </>
      }
    >
      <div className="mb-6 text-3xl font-bold text-(--ba-plum)">{L("completeTitle")}</div>
      <div className="flex gap-10">
        <div className="w-64 space-y-4 text-2xl">
          <div>
            🕘 {L("boardingTime")} <b>{f.boarding}</b>
          </div>
          <div>
            🚪 {L("gate")} <b>{f.gate}</b>
          </div>
          <div>
            ✈ {L("departure")} <b>{f.dep}</b>
          </div>
        </div>
        <div className="flex-1 space-y-4 text-lg">
          <p>🧳 {L("bagNotice")}</p>
          <p>🛂 {L("docsNotice")}</p>
        </div>
      </div>
    </Frame>
  );
}

function PopupLayer() {
  const { s } = useK();
  if (!s.popup) return null;
  const L = (k: keyof typeof t) => tr(k, s.lang);
  const close = (
    <Btn target="close_popup" className="min-h-14 rounded-lg bg-(--ba-violet) px-10 text-xl font-bold text-white active:bg-(--ba-press)">
      {L("close")}
    </Btn>
  );
  // 화면 낭독기가 읽는 팝업 이름
  const popupName: Record<NonNullable<KioskState["popup"]>, string> = {
    exit_confirm: L("exit"),
    help: L("help"),
    allowance: L("allowanceTitle"),
    paid_seat: L("legendPaid"),
    exit_row: L("legendExit"),
    excess: L("excess"),
    mileage: L("mileage"),
    end_adding: L("endAddQ"),
  };
  const body: Record<NonNullable<KioskState["popup"]>, ReactNode> = {
    exit_confirm: (
      <>
        <p className="text-2xl">{L("exitConfirm")}</p>
        <div className="flex gap-4">
          <Btn target="exit_yes" className="min-h-14 rounded-lg bg-(--ba-violet) px-10 text-xl font-bold text-white active:bg-(--ba-press)">
            {L("yes")}
          </Btn>
          <Btn target="close_popup" className="min-h-14 rounded-lg border border-(--ba-muted) px-10 text-xl">
            {L("no")}
          </Btn>
        </div>
      </>
    ),
    help: (
      <>
        <p className="text-2xl">{L("helpText")}</p>
        {close}
      </>
    ),
    allowance: (
      <>
        <div className="text-2xl font-bold">{L("allowanceTitle")}</div>
        <p>{L("allowanceText")}</p>
        <table className="w-full text-left">
          <tbody>
            {s.scanned.map((id) => (
              <tr key={id} className="border-b">
                <td className="py-2">{name(id)}</td>
                <td>{BAG_ALLOWANCE} bag(s) · 23kg</td>
                <td>BAGS REGISTERED {s.bags[id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {close}
      </>
    ),
    paid_seat: (
      <>
        <p className="text-2xl">{L("paidSeat")}</p>
        {close}
      </>
    ),
    exit_row: (
      <>
        <p className="text-2xl">{L("exitRow")}</p>
        {close}
      </>
    ),
    excess: (
      <>
        <p className="text-2xl">{L("excessText")}</p>
        <Btn target="excess_ok" className="min-h-14 rounded-lg bg-(--ba-violet) px-10 text-xl font-bold text-white active:bg-(--ba-press)">
          {L("ok")}
        </Btn>
      </>
    ),
    mileage: (
      <>
        <p className="text-2xl">{L("mileageText")}</p>
        {close}
      </>
    ),
    end_adding: (
      <>
        <div className="text-5xl">🗒️</div>
        <p className="text-2xl">{L("endAddQ")}</p>
        <div className="flex w-full gap-4">
          <Btn target="end_add_no" className="min-h-14 flex-1 rounded-lg border border-(--ba-muted) bg-white px-4 text-xl">
            {L("endAddNo")} ✕
          </Btn>
          <Btn target="end_add_yes" className="min-h-14 flex-1 rounded-lg bg-(--ba-violet) px-4 text-xl font-bold text-white active:bg-(--ba-press)">
            {L("endAddYes")} →
          </Btn>
        </div>
      </>
    ),
  };
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-900/50" role="dialog" aria-modal="true" aria-label={popupName[s.popup]} data-popup={s.popup}>
      <div className="flex w-[560px] flex-col items-center gap-6 rounded-2xl border-t-8 border-(--ba-plum) bg-white p-8 text-center shadow-xl">{body[s.popup]}</div>
    </div>
  );
}

// 화면 아래 기기: 여권 리더기, 바코드·카드, 탑승권·수하물 태그 출구
function Devices({ onDevice, waitPassport }: { onDevice: (id: string) => void; waitPassport: boolean }) {
  const { s } = useK();
  const printed = s.screen === "complete" ? s.scanned.length : 0;
  const tags = s.screen === "complete" ? Object.values(s.bags).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="flex h-[210px] gap-4 bg-neutral-800 p-4 text-white">
      <div className={`flex w-[420px] flex-col rounded-xl border-2 p-3 ${waitPassport ? "border-orange-400 bg-orange-500/20 motion-safe:animate-pulse" : "border-neutral-600"}`}>
        <div className="text-sm font-bold">여권인식 Passport Scan</div>
        <div className="my-2 h-3 rounded bg-neutral-950" />
        <div className="flex gap-3">
          {booking.passengers.map((p) => (
            <button key={p.id} type="button" data-device="passport" data-value={p.id} onClick={() => onDevice(p.id)} className="flex flex-1 flex-col items-start rounded-lg bg-[#7a1f2b] px-3 py-2 text-left shadow hover:brightness-110">
              <span className="text-xs opacity-80">PASSPORT 🛂</span>
              <span className="font-bold">
                {p.family} {p.given}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 text-xs text-neutral-400">↑ tap a passport to put it in the reader</div>
      </div>
      <div className="flex w-36 flex-col gap-3 text-xs">
        <div className="rounded border border-neutral-600 p-2">▦ 바코드 Barcode</div>
        <div className="rounded border border-neutral-600 p-2">▭ 카드 Card</div>
      </div>
      <div className="flex flex-1 gap-3">
        <div className="flex-1 rounded-xl border-2 border-neutral-600 p-3">
          <div className="text-sm font-bold">탑승권을 가져가세요 Boarding Pass</div>
          <div className="mt-2 flex gap-2" data-device="boarding_passes">
            {Array.from({ length: printed }, (_, i) => (
              <div key={i} className="rounded bg-white px-2 py-1 text-xs text-neutral-900 shadow">
                ✈ {booking.flight.no} · {s.seats[s.scanned[i]]}
              </div>
            ))}
          </div>
        </div>
        <div className="w-40 rounded-xl border-2 border-neutral-600 p-3">
          <div className="text-sm font-bold">수하물 태그 Bag Tag</div>
          <div className="mt-2 flex flex-col gap-1">
            {Array.from({ length: tags }, (_, i) => (
              <div key={i} className="rounded bg-amber-200 px-2 py-1 text-xs font-bold text-neutral-900">
                {booking.flight.to.code} · {booking.flight.no}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AirportKiosk({
  state,
  press,
  banner,
  onDevice,
  waitPassport,
}: {
  state: KioskState;
  press: (target: Target, value?: string) => void;
  banner?: ReactNode;
  onDevice: (passengerId: string) => void;
  waitPassport: boolean;
}) {
  const screens: Record<KioskState["screen"], ReactNode> = {
    idle: <Idle />,
    dangerous_goods: <DangerousGoods />,
    lookup: <Lookup />,
    passport: <Passport />,
    passengers: <Passengers />,
    add_passenger: <Passport add />,
    flight_info: <FlightInfo />,
    seat_map: <SeatMap />,
    bags_question: <BagsQuestion />,
    bag_count: <BagCount />,
    printing: <Printing />,
    complete: <Complete />,
  };
  return (
    <K.Provider value={{ s: state, press }}>
      <div lang={state.lang} style={{ ...airVars, fontFamily: krFont }} className="w-[1024px] overflow-hidden rounded-2xl border-8 border-neutral-700 bg-neutral-700 shadow-2xl">
        <div className="relative h-[768px] overflow-hidden bg-white text-(--ba-ink)" data-screen={state.screen}>
          {screens[state.screen]}
          <PopupLayer />
          {banner}
        </div>
        <Devices onDevice={onDevice} waitPassport={waitPassport} />
      </div>
    </K.Provider>
  );
}

export const KIOSK_W = 1024 + 16;
export const KIOSK_H = 768 + 210 + 16;
