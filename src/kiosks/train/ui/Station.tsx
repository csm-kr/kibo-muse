"use client";

// 기차 승차권 발매기 한 대와 KIBO 개발용 콘솔. 사람 터치, KIBO 재생, 기기(카드 단말기·발권기) 사건이 같은 step()을 거친다.
// KIBO는 결제하기 바로 앞(예약 확인)에서 멈추고 결제는 사람에게 넘긴다. 원하는 시각보다 1시간 넘게 늦은 열차는 휴대폰에서 사람이 확인해야 이어 간다.

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { idlePhase, type IdlePhase } from "@/engine/idle";
import { newRun, trackRun, type RunBy, type RunStats } from "@/engine/run";
import { langOf, type Resumed, type Understood } from "@/engine/turn";
import { useKiboTurn } from "@/engine/useKiboTurn";
import { openLink, type Link, type LinkGate, type LinkMsg } from "@/sync/link";
import { useRoom } from "@/sync/room";
import { limitedReject } from "@/ui/limited";
import { KiboBand, type BandChip } from "@/ui/KiboBand";
import { KiboPointer } from "@/ui/KiboPointer";
import { beat, GAP } from "@/ui/pointer";
import { PairBadge, useQrFlag } from "@/ui/PairBadge";
import { useView } from "@/ui/useView";
import { useSamples } from "../../samples";
import { seatNote, trainGate } from "../gates";
import { initialState, step, type KioskEvent, type KioskState, type Target } from "../machine";
import { plan, type Stop, type TrainIntent } from "../planner";
import { hhmm, legs, paxTotal } from "../rail";
import { TrainKiosk, KIOSK_H, KIOSK_W, type Highlight } from "./Kiosk";
import { intentChips, screenLabel, statusSummary } from "./labels";
import { t } from "./strings";

const PRINT_MS = 2500;
const COMPLETE_MS = 20_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 한국 역 발매기라 한국어 화면으로 시작한다 【판단】
const fresh = () => initialState("ko");

interface InterpretResponse {
  say: string;
  replyLanguage: string;
  // 말한 언어가 휴대폰 언어와 분명히 달라 말한 언어로 답했다(휴대폰이 그 언어로 바꾼다)
  followSpoken?: boolean;
  intent: TrainIntent;
  plan: { kind: "plan"; events: KioskEvent[]; stop: Stop | null; notes: string[] } | { kind: "clarify"; missing: string[] } | { kind: "reject"; reason: string };
  gate: LinkGate | null;
  paymentHandoff: boolean;
  timing: { sparkMs: number; totalMs: number };
  error?: string;
}

function speak(text: string, lang: string) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.speak(u);
}

// 창에 맞춘다. extraH = 키오스크 위 띠 칸, extraW = 옆 개발 콘솔
function useFitScale(extraH: number, extraW: number) {
  // 맞추기 전(서버 렌더와 하이드레이션 직전)에는 null. 그동안 화면을 숨겨, 크기가 바뀌며 밀리는 것(CLS)을 없앤다
  const [scale, setScale] = useState<number | null>(null);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min((window.innerHeight - 24 - extraH) / KIOSK_H, (window.innerWidth - 24 - extraW) / KIOSK_W, 1));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [extraH, extraW]);
  return { scale: scale ?? 0.6, hide: scale === null ? ({ visibility: "hidden" } as const) : undefined };
}

const samples = [
  "내일 아침 9시쯤 등대항 가는 고속열차, 어른 2명, 창가 쪽 나란히 앉고 싶어요.",
  "Two adults to Harborlight tomorrow around 9 am on the express, window seats together please.",
  "Ngày mai khoảng 9 giờ sáng, 2 người lớn đi Harborlight bằng tàu nhanh, ngồi cạnh nhau phía cửa sổ.",
  "네, 그 열차로 할게요",
];

// variant "kiosk": 개발 콘솔 없이 발매기만(/kiosk/train?view=kiosk). 띠는 발매기 위 칸에 둔다
export function TrainStation({ variant: given, room }: { variant?: "dev" | "kiosk"; room?: string | null } = {}) {
  const view = useView();
  const variant = given ?? (view === "kiosk" ? "kiosk" : "dev");
  const roomId = useRoom(room);
  const qrOn = useQrFlag();
  const [state, setState] = useState<KioskState>(fresh);
  const stateRef = useRef(state);
  const [hl, setHl] = useState<Highlight>(null);
  const [progress, setProgress] = useState<{ i: number; n: number } | null>(null);
  // 입력란 기본값은 브라우저 언어에 맞춘 첫 예시. 고치거나 예시를 누르면 그 글
  const examples = useSamples(samples);
  const [typed, setText] = useState<string | null>(null);
  const text = typed ?? examples[0];
  const [last, setLast] = useState<InterpretResponse | null>(null);
  const { scale, hide } = useFitScale(variant === "dev" ? 0 : 150 + 8, variant === "kiosk" ? 0 : 416);
  const [run, setRun] = useState<RunStats>(() => newRun("reservation"));
  const linkRef = useRef<Link | null>(null);
  const [hello, setHello] = useState(0);
  // 이미 답한 hello 번호. hello에 답하는 status에만 지금 카드를 붙인다
  const helloSeenRef = useRef(0);
  const lastActRef = useRef(0);
  const [idle, setIdle] = useState<IdlePhase>({ kind: "active" });
  // 관문을 넘기면 이어 갈 의도와, 지금 기다리는 관문
  const pendingRef = useRef<TrainIntent | null>(null);
  const [waiting, setWaiting] = useState<Stop | null>(null);
  const waitingRef = useRef<Stop | null>(null);
  const langRef = useRef("en");
  // 개발 콘솔에서 보낸 말이면 발매기가 대답을 읽고, 휴대폰에서 온 말이면 휴대폰이 읽는다
  const localRef = useRef(false);
  const playingRef = useRef(false);
  const [chips, setChips] = useState<BandChip[]>([]);

  const setWait = (w: Stop | null) => {
    waitingRef.current = w;
    setWaiting(w);
  };

  const touchActivity = useCallback(() => {
    lastActRef.current = Date.now();
    setIdle({ kind: "active" });
  }, []);

  const apply = useCallback(
    (s: KioskState, by: RunBy = "touch") => {
      stateRef.current = s;
      setState(s);
      touchActivity();
      // 사람이나 시간 초과로 처음 화면에 가면 이어 갈 의도를 버린다. KIBO가 계획대로 예약을 취소하며 지나가는 처음 화면은 그대로 둔다
      if (s.screen === "idle" && by !== "kibo") {
        pendingRef.current = null;
        waitingRef.current = null;
        setWaiting(null);
      }
      const now = Date.now();
      setRun((r) => trackRun(r, { type: "step", by, screen: s.screen }, now));
    },
    [touchActivity],
  );

  // 재생: 서버가 무엇을 보냈든 KIBO의 조작(by: "kibo")으로만 누른다. 끝까지 성공해야 true
  async function play(events: KioskEvent[]) {
    if (playingRef.current) return false;
    playingRef.current = true;
    try {
      for (const [i, raw] of events.entries()) {
        const e: KioskEvent = { ...raw, by: "kibo" };
        setProgress({ i: i + 1, n: events.length });
        setHl({ target: e.target, value: e.value });
        await sleep(beat(i === 0).tap);
        const r = step(stateRef.current, e);
        if (!r.ok) {
          console.error("KIBO step failed", e, r.error);
          setWait(null);
          return false;
        }
        apply(r.state, "kibo");
        setHl(null);
        await sleep(GAP);
      }
      return true;
    } finally {
      setHl(null);
      setProgress(null);
      playingRef.current = false;
    }
  }

  // 휴대폰이 말과 함께 보낸 언어. 한도(429) 문구를 그 언어로 받는다
  const sayLangRef = useRef("");
  async function understand(utterance: string, signal: AbortSignal): Promise<Understood<KioskEvent>> {
    setChips([]);
    // 휴대폰 말에만 그 언어(?lang)를 붙인다. 서버는 그 언어로 답한다. 키오스크에서 친 말은 붙이지 않아 Spark가 고른 언어로 답한다
    const res = await fetch(`/api/train/interpret${sayLangRef.current ? `?lang=${encodeURIComponent(sayLangRef.current)}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterance, state: stateRef.current, pending: pendingRef.current ?? undefined }),
      signal,
    });
    const limited = await limitedReject(res, sayLangRef.current);
    if (limited) return limited;
    if (!res.ok) throw new Error(`interpret ${res.status}`);
    const body = (await res.json()) as InterpretResponse;
    setLast(body);
    if (body.error) throw new Error(body.error);
    langRef.current = body.replyLanguage;
    pendingRef.current = body.intent;
    const p = body.plan;
    setChips(p.kind === "reject" ? [] : intentChips(body.intent, p.kind === "plan" ? p.stop : null, stateRef.current.lang));
    if (p.kind === "clarify") return { kind: "clarify", say: body.say, lang: body.replyLanguage, followSpoken: body.followSpoken };
    // 거절 문구는 서버가 이유에 값(발매기 시각 등)을 넣은 고정 문구다
    if (p.kind === "reject") return { kind: "reject", reason: p.reason, lang: body.replyLanguage, say: body.say, followSpoken: body.followSpoken };
    setWait(p.stop);
    // 관문 문구는 서버가 만든 고정 문구다. 결제하기 앞에서 멈추면 휴대폰에 결제 넘기기 안내가 간다
    return { kind: "plan", events: p.events, lang: body.replyLanguage, followSpoken: body.followSpoken, done: { say: seatNote(p.notes, body.replyLanguage), gate: body.gate, paymentHandoff: body.paymentHandoff, payButton: t.pay[stateRef.current.lang] } };
  }

  // 사람이 늦은 열차를 휴대폰에서 확인했다. 그 확인을 의도에 넣고 서버를 거치지 않고 바로 다시 계획한다.
  // 카드 투입은 마지막 사람 일이라 이어 갈 계획이 없다
  function resume(what: string): Resumed<KioskEvent> | null {
    const w = waitingRef.current;
    const intent = pendingRef.current;
    if (!intent || !w || w.kind !== "ack" || w.what !== what) return null;
    const next = { ...intent, acceptLaterTrain: { trainNo: w.trainNo, day: stateRef.current.day } };
    pendingRef.current = next;
    const p = plan(stateRef.current, next);
    if (p.kind !== "plan") return null;
    setWait(p.stop);
    setChips(intentChips(next, p.stop, stateRef.current.lang));
    return { events: p.events, lang: langRef.current, done: { say: seatNote(p.notes, langRef.current), gate: trainGate(p.stop, langRef.current), paymentHandoff: p.stop?.kind === "human", payButton: t.pay[stateRef.current.lang] } };
  }

  function send(m: LinkMsg) {
    linkRef.current?.send(m);
    if (localRef.current && (m.type === "reply" || m.type === "done")) speak([m.say, m.type === "done" ? m.gate?.text : ""].filter(Boolean).join(" "), m.replyLanguage);
  }

  const { turn, phase, slow, busy } = useKiboTurn<KioskEvent>({ understand, play, resume, send });
  const thinking = phase === "thinking";

  useEffect(() => {
    lastActRef.current = Date.now();
    const id = setInterval(() => {
      if (turn.busy() || stateRef.current.screen === "printing") return;
      const ph = idlePhase(Date.now() - lastActRef.current, stateRef.current.screen);
      if (ph.kind === "reset") apply(fresh());
      else setIdle(ph);
    }, 500);
    return () => clearInterval(id);
  }, [apply, turn]);

  // 해석을 기다리는 동안과 재생하는 동안은 사람 터치를 받지 않는다(낡은 화면으로 계획하지 않게)
  const press = useCallback(
    (target: Target, value?: string) => {
      if (turn.busy()) return;
      const r = step(stateRef.current, value === undefined ? { by: "touch", target } : { by: "touch", target, value });
      if (!r.ok) return;
      turn.touched();
      apply(r.state);
    },
    [apply, turn],
  );

  // 카드 단말기에 사람이 카드를 넣었다(기기 사건). KIBO는 결제하지 않는다
  const onCard = () => {
    if (turn.busy()) return;
    const r = step(stateRef.current, { by: "device", target: "card_inserted" });
    if (!r.ok) return;
    apply(r.state, "auto");
    if (turn.waitingFor() === "card") turn.ack("card");
  };

  // 발권은 발권기가 끝내면 완료 화면으로, 완료 화면은 잠시 뒤 처음으로 돌아간다
  useEffect(() => {
    if (busy || (state.screen !== "printing" && state.screen !== "complete")) return;
    const id = setTimeout(
      () => {
        const e: KioskEvent = state.screen === "printing" ? { by: "device", target: "print_done" } : { by: "touch", target: "finish" };
        const r = step(stateRef.current, e);
        if (r.ok) apply(r.state, "auto");
      },
      state.screen === "printing" ? PRINT_MS : COMPLETE_MS,
    );
    return () => clearTimeout(id);
  }, [state.screen, busy, apply]);

  function ask(utterance: string) {
    localRef.current = true;
    sayLangRef.current = "";
    touchActivity();
    // 발매기 앞에서 친 말은 지금 카드에 대한 말이다(휴대폰 말은 카드 id를 붙여 온다)
    turn.hear({ text: utterance, lang: "auto", gateId: turn.gateId() ?? undefined });
  }

  // 개발 콘솔의 [Person confirms]: 지금 떠 있는 카드에 대한 확인이다
  function ack(what: string) {
    localRef.current = true;
    turn.ack(what, turn.gateId() ?? undefined);
  }

  const onPhone = useEffectEvent((m: LinkMsg) => {
    if (m.type === "utterance") {
      localRef.current = false;
      setText(m.text);
      touchActivity();
      sayLangRef.current = m.lang;
      turn.hear(m);
    }
    if (m.type === "ack") {
      localRef.current = false;
      turn.ack(m.what, m.gateId);
    }
  });

  useEffect(() => {
    if (!roomId) return;
    // 같은 화면 안 휴대폰(BroadcastChannel)과, Supabase 키가 있으면 다른 기기의 휴대폰(Realtime)을 함께 받는다
    const link = openLink(roomId);
    linkRef.current = link;
    const offJoin = link.onJoin(() => setHello((n) => n + 1));
    const off = link.subscribe((m) => {
      if (m.type === "utterance" || m.type === "ack") onPhone(m);
      if (m.type === "hello") setHello((n) => n + 1);
      if ((m.type === "listening" && !m.end) || m.type === "utterance") {
        const now = Date.now();
        setRun((r) => trackRun(r, { type: "listening" }, now));
      }
    });
    return () => {
      off();
      offJoin();
      link.close();
    };
  }, [room, roomId]);

  useEffect(() => {
    const seats = state.chosenSeats ?? state.reservation?.seats ?? [];
    // 휴대폰에는 내부 화면 이름(train_list 등)을 보이지 않는다
    const summary = statusSummary(state.to, seats, langRef.current);
    // 휴대폰이 결제 전에 맞는지 볼 수 있게 타는 날(키오스크 날짜), 고른 열차의 출발 시각, 좌석 등급도 싣는다
    const pick = state.reservation ?? state.pick;
    const leg = pick && state.to ? legs(state.from, state.to).find((l) => l.train.no === pick.trainNo) : undefined;
    const day = new Date();
    day.setDate(day.getDate() + state.day);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const label = screenLabel[state.screen][langOf(langRef.current)];
    const answering = hello !== helloSeenRef.current;
    helloSeenRef.current = hello;
    linkRef.current?.send({ type: "status", screen: state.screen, label, busy, items: 0, total: state.reservation?.total ?? 0, kiosk: "Bridge Rail tickets", kioskId: "train", summary, rail: { from: state.from, to: state.to, people: paxTotal(state.pax), seats, date, ...(pick && { cls: pick.cls }), ...(leg && { dep: hhmm(leg.dep) }) }, ...(progress && { step: progress.i, steps: progress.n }), ...(answering && { gate: turn.card() }) });
  }, [state, busy, progress, hello, turn]);

  const timeoutPopup =
    idle.kind === "warning" ? (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/60 p-8" role="alertdialog" aria-label={state.lang === "ko" ? "시간이 더 필요하세요?" : "Need more time?"}>
        <div className="w-full rounded-xl bg-white p-8 text-center">
          <div className="text-6xl">⏱️</div>
          <div className="mt-4 text-2xl font-bold">{state.lang === "ko" ? "시간이 더 필요하세요?" : "Need more time?"}</div>
          <div className="mt-2 text-neutral-600">{state.lang === "ko" ? `${idle.secondsLeft}초 후 처음 화면으로 돌아갑니다` : `Returning to the start screen in ${idle.secondsLeft}s`}</div>
          <button type="button" onClick={touchActivity} className="mt-6 w-full rounded-lg bg-(--br-wine) py-4 text-xl font-bold text-white">
            {state.lang === "ko" ? "계속하기" : "Keep going"}
          </button>
        </div>
      </div>
    ) : null;

  const kiosk = (
    <div style={{ width: KIOSK_W * scale, height: KIOSK_H * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <TrainKiosk
          state={state}
          press={press}
          onCard={onCard}
          waitCard={waiting?.kind === "device" && !busy}
          banner={
            <>
              {/* 재생이 예약 확인에서 끝나면 사람이 누를 [결제하기]에 고리를 그린다 */}
              <KiboPointer hl={hl} active={progress !== null} screen={state.screen} finale={{ target: "pay" }} />
              {variant === "dev" && <KiboBand phase={phase} slow={slow} chips={chips} progress={progress} />}
              {timeoutPopup}
            </>
          }
        />
      </div>
    </div>
  );

  // 관문을 기다리는 동안 띠에 사람이 할 일
  const yourTurn = phase === "waiting_gate" && waiting ? (waiting.kind === "device" ? "insert your card" : waiting.kind === "ack" ? "confirm on the phone" : null) : null;
  if (variant === "kiosk")
    return (
      <main style={hide} className="flex min-h-screen flex-col items-center gap-2 bg-neutral-200 p-3">
        <h1 className="sr-only">Bridge Rail ticket kiosk</h1>
        {/* 띠 칸은 대기 화면에서 비어 있다. KIBO 연결 QR은 그 칸 오른쪽 아래, 키오스크 틀 바로 위에 붙인 스티커처럼 둔다
            (키오스크 화면 내용을 가리지 않는다). ?qr=0이면 숨긴다 */}
        <div className="relative h-[150px]" style={{ width: KIOSK_W * scale }}>
          <KiboBand phase={phase} slow={slow} chips={chips} progress={progress} slot yourTurn={yourTurn} />
          {roomId && qrOn && state.screen === "idle" && !busy && <PairBadge room={roomId} at="absolute right-0 bottom-0" />}
        </div>
        {kiosk}
      </main>
    );

  return (
    <main style={hide} className="flex min-h-screen items-start justify-center gap-6 bg-neutral-200 p-3">
      {kiosk}

      <div className="w-96 rounded-xl bg-white p-4 text-sm shadow">
        {/* 개발 콘솔 보기도 공개 데모 화면이라 이 제목이 쪽 제목(h1)이다 */}
        <h1 className="mb-2 font-bold">KIBO dev console · train</h1>
        {/* 첫 화면 링크(/kiosk/train)로 온 심사위원도 휴대폰을 바로 짝지을 수 있게 QR을 띄운다. 키오스크 화면은 가리지 않는다. ?qr=0이면 숨긴다 */}
        {roomId && qrOn && state.screen === "idle" && !busy && <PairBadge room={roomId} at="mb-3 w-fit" />}
        <textarea aria-label="What the person says" className="h-24 w-full rounded border border-neutral-300 p-2" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-1">
          {examples.map((s) => (
            <button key={s} type="button" className="rounded bg-neutral-100 px-2 py-1 text-xs" onClick={() => setText(s)}>
              {s.slice(0, 18)}…
            </button>
          ))}
        </div>
        <button type="button" disabled={busy || thinking} onClick={() => ask(text)} className="mt-3 w-full rounded bg-teal-700 py-2 font-bold text-white disabled:opacity-50">
          {thinking ? "Thinking…" : busy ? "Operating…" : "Say it"}
        </button>
        {waiting && (
          <div className="mt-3 rounded border-2 border-orange-400 bg-orange-50 p-2" data-waiting={waiting.what}>
            <div className="font-bold">Waiting for the person: {waiting.what === "later_train" ? `later train ${waiting.trainNo} at ${waiting.dep}` : waiting.what}</div>
            {waiting.kind === "ack" && (
              <button type="button" disabled={busy} onClick={() => ack(waiting.what)} className="mt-2 w-full rounded bg-orange-500 py-1.5 font-bold text-[#042F2E] disabled:opacity-50">
                ✔ Person confirms
              </button>
            )}
          </div>
        )}
        {last && (
          <div className="mt-3 space-y-1 text-xs">
            {last.error ? (
              <div className="text-red-600">{last.error}</div>
            ) : (
              <>
                <div>
                  <b>say</b> ({last.replyLanguage}): {last.say}
                </div>
                <div className="break-all">
                  <b>intent</b>: {JSON.stringify(last.intent)}
                </div>
                <div>
                  <b>plan</b>: {last.plan.kind}
                  {last.plan.kind === "plan" && ` · ${last.plan.events.length} taps · stop ${JSON.stringify(last.plan.stop?.kind === "human" ? { kind: "human", what: "pay" } : last.plan.stop)}`}
                  {last.plan.kind !== "plan" && ` · ${JSON.stringify("missing" in last.plan ? last.plan.missing : last.plan.reason)}`}
                </div>
                <div>
                  <b>timing</b>: Spark {last.timing.sparkMs} ms · server {last.timing.totalMs} ms
                </div>
              </>
            )}
          </div>
        )}
        <div className="mt-4 border-t pt-2 text-xs text-neutral-500">
          screen: {state.screen} · run: {run.startedAt && run.endedAt ? `${((run.endedAt - run.startedAt) / 1000).toFixed(1)} s` : "—"} · taps {run.humanTaps}/{run.kiboTaps}
          <button type="button" className="ml-2 underline" onClick={() => !turn.busy() && apply(fresh())}>
            reset
          </button>
        </div>
      </div>
    </main>
  );
}
