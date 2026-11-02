"use client";

// 공항 체크인 키오스크 한 대와 KIBO 개발용 콘솔. 사람 터치, KIBO 재생, 기기(여권·프린터) 사건이 같은 step()을 거친다.
// KIBO는 사람이 해야 하는 관문(위험물 동의, 여권, 체크인 확정)에서 멈추고, 사람이 넘기면 같은 의도로 다시 계획해 이어 간다.

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { idlePhase, type IdlePhase } from "@/engine/idle";
import { newRun, trackRun, type RunBy, type RunStats } from "@/engine/run";
import { langOf, type Resumed, type Understood } from "@/engine/turn";
import { useKiboTurn } from "@/engine/useKiboTurn";
import { openLink, type Link, type LinkMsg } from "@/sync/link";
import { useRoom } from "@/sync/room";
import { PairBadge, useQrFlag } from "@/ui/PairBadge";
import { gateFor, noSeatsText, type Gate } from "../gates";
import { initialState, step, type KioskEvent, type KioskState, type Target } from "../machine";
import { plan, splitBags, type AirportIntent, type Stop } from "../planner";
import { KiboBand, type BandChip } from "@/ui/KiboBand";
import { KiboPointer } from "@/ui/KiboPointer";
import { useView } from "@/ui/useView";
import { AirportKiosk, KIOSK_H, KIOSK_W, type Highlight } from "./Kiosk";
import { intentChips, screenLabel, statusSummary } from "./labels";
import { t } from "./strings";

const STEP_MS = 520;
const PRINT_MS = 2500;
const COMPLETE_MS = 20_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface InterpretResponse {
  say: string;
  replyLanguage: string;
  intent: AirportIntent;
  plan: { kind: "plan"; events: KioskEvent[]; stop: Stop | null; notes: string[] } | { kind: "clarify"; missing: string[] } | { kind: "reject"; reason: string };
  gate: Gate | null;
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
  const [scale, setScale] = useState(0.6);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min((window.innerHeight - 24 - extraH) / KIOSK_H, (window.innerWidth - 24 - extraW) / KIOSK_W, 1));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [extraH, extraW]);
  return scale;
}

const samples = [
  "브리지항공으로 엄마랑 둘이 도쿄 가요. 나란히 앉고 싶고, 짐은 하나 부칠게요.",
  "Bridge Air to Tokyo, me and my mom. We'd like to sit together, and we're checking one bag.",
  "ブリッジエアで母と二人、東京へ行きます。隣同士の席で、預ける荷物は一つです。",
  "네, 확인했어요",
];

const totalBags = (intent: AirportIntent | null, s: KioskState) => Object.values(splitBags(intent?.bags ?? 0, s.scanned)).reduce((a, b) => a + b, 0);

// variant "kiosk": 개발 콘솔 없이 키오스크만(영상·사용자 시험용 /kiosk/airport?view=kiosk). 띠는 키오스크 위 칸에 둔다
// variant "show": 키오스크 + 오른쪽 휴대폰(/show/airport, 영상용). 휴대폰 자리(약 520px)를 비워 두고 줄인다
export function AirportStation({ variant: given, room }: { variant?: "dev" | "kiosk" | "show"; room?: string | null } = {}) {
  const view = useView();
  const variant = given ?? (view === "kiosk" ? "kiosk" : "dev");
  // 키오스크 단독 화면은 room이 없으면 6자리 코드를 만든다(대기 화면의 QR로 휴대폰과 짝짓는다)
  const roomId = useRoom(room);
  const qrOn = useQrFlag();
  const [state, setState] = useState<KioskState>(initialState);
  const stateRef = useRef(state);
  const [hl, setHl] = useState<Highlight>(null);
  const [progress, setProgress] = useState<{ i: number; n: number } | null>(null);
  const [text, setText] = useState(samples[0]);
  const [last, setLast] = useState<InterpretResponse | null>(null);
  const scale = useFitScale(variant === "dev" ? 0 : 150 + 8, variant === "kiosk" ? 0 : variant === "show" ? 530 : 416);
  const [run, setRun] = useState<RunStats>(() => newRun("complete"));
  const linkRef = useRef<Link | null>(null);
  const [hello, setHello] = useState(0);
  // 이미 답한 hello 번호. hello에 답하는 status에만 지금 카드를 붙인다
  const helloSeenRef = useRef(0);
  const lastActRef = useRef(0);
  const [idle, setIdle] = useState<IdlePhase>({ kind: "active" });
  // 관문을 넘기면 이어 갈 의도와, 지금 기다리는 관문
  const pendingRef = useRef<AirportIntent | null>(null);
  const [waiting, setWaiting] = useState<Stop | null>(null);
  const waitingRef = useRef<Stop | null>(null);
  const langRef = useRef("en");
  // 개발 콘솔에서 보낸 말이면 키오스크가 대답을 읽고, 휴대폰에서 온 말이면 휴대폰이 읽는다
  const localRef = useRef(false);
  const playingRef = useRef(false);
  // 띠에 보일 의도 칩
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
      if (s.screen === "idle") {
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
        await sleep(STEP_MS);
        const r = step(stateRef.current, e);
        if (!r.ok) {
          console.error("KIBO step failed", e, r.error);
          setWait(null);
          return false;
        }
        apply(r.state, "kibo");
        setHl(null);
        await sleep(120);
      }
      return true;
    } finally {
      setHl(null);
      setProgress(null);
      playingRef.current = false;
    }
  }

  async function understand(utterance: string, signal: AbortSignal): Promise<Understood<KioskEvent>> {
    setChips([]);
    const res = await fetch("/api/airport/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterance, state: stateRef.current, pending: pendingRef.current ?? undefined }),
      signal,
    });
    if (!res.ok) throw new Error(`interpret ${res.status}`);
    const body = (await res.json()) as InterpretResponse;
    setLast(body);
    if (body.error) throw new Error(body.error);
    langRef.current = body.replyLanguage;
    pendingRef.current = body.intent;
    const p = body.plan;
    setChips(p.kind === "reject" ? [] : intentChips(body.intent, p.kind === "plan" ? p.stop : null));
    if (p.kind === "clarify") return { kind: "clarify", say: body.say, lang: body.replyLanguage };
    if (p.kind === "reject") return { kind: "reject", reason: p.reason, lang: body.replyLanguage };
    setWait(p.stop);
    // 관문 문구는 서버가 계획의 마지막 상태로 만든 고정 문구다. 재생이 성공해야 휴대폰에 간다
    return { kind: "plan", events: p.events, lang: body.replyLanguage, done: { say: p.notes.includes("no_matching_seats") ? noSeatsText(body.replyLanguage) : "", gate: body.gate } };
  }

  // 사람이 관문을 넘겼다(여권을 넣거나 휴대폰에서 확인). 확인이면 상태 기계에 휴대폰 동의 증표를 남기고, 서버를 거치지 않고 바로 다시 계획한다
  function resume(what: string): Resumed<KioskEvent> | null {
    const w = waitingRef.current;
    const intent = pendingRef.current;
    if (!intent || !w) return null;
    if (w.kind === "ack" && w.what === what) {
      const r = step(stateRef.current, { by: "phone", target: "consent", value: what });
      if (!r.ok) return null;
      apply(r.state, "auto");
    } else if (!(w.kind === "device" && what === "passport")) return null;
    const p = plan(stateRef.current, intent);
    if (p.kind !== "plan") return null;
    setWait(p.stop);
    setChips(intentChips(intent, p.stop));
    const say = p.notes.includes("no_matching_seats") ? noSeatsText(langRef.current) : "";
    return { events: p.events, lang: langRef.current, done: { say, gate: gateFor(p.stop, langRef.current, totalBags(intent, p.final)) } };
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
      if (ph.kind === "reset") apply(initialState());
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

  const onDevice = (passengerId: string) => {
    if (turn.busy()) return;
    const r = step(stateRef.current, { by: "device", target: "scan_passport", value: passengerId });
    if (!r.ok) return;
    apply(r.state, "auto");
    turn.ack("passport");
  };

  // 발급은 프린터가 끝내면 완료 화면으로, 완료 화면은 잠시 뒤 처음으로 돌아간다
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
    touchActivity();
    // 키오스크 앞에서 친 말은 지금 카드에 대한 말이다(휴대폰 말은 카드 id를 붙여 온다)
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
    // (다시) 연결되면 지금 상태를 다시 보낸다
    const offJoin = link.onJoin(() => setHello((n) => n + 1));
    const off = link.subscribe((m) => {
      if (m.type === "utterance" || m.type === "ack") onPhone(m);
      if (m.type === "hello") setHello((n) => n + 1);
      if (m.type === "listening" || m.type === "utterance") {
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
    const seats = state.scanned.map((p) => state.seats[p]).join("·");
    // 휴대폰에는 내부 화면 이름(flight_info 등)을 보이지 않는다
    const summary = statusSummary(state.scanned.length, seats, langRef.current);
    const label = screenLabel[state.screen][langOf(langRef.current)];
    const answering = hello !== helloSeenRef.current;
    helloSeenRef.current = hello;
    linkRef.current?.send({ type: "status", screen: state.screen, label, busy, items: state.scanned.length, total: 0, kiosk: "Bridge Air check-in", kioskId: "airport", summary, ...(progress && { step: progress.i, steps: progress.n }), ...(answering && { gate: turn.card() }) });
  }, [state, busy, progress, hello, turn]);

  const banner = <KiboBand phase={phase} slow={slow} chips={chips} progress={progress} />;

  const timeoutPopup =
    idle.kind === "warning" ? (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/60 p-8" role="alertdialog" aria-label={t.needMoreTime[state.lang]}>
        <div className="w-[520px] rounded-xl bg-white p-8 text-center">
          <div className="text-6xl">⏱️</div>
          <div className="mt-4 text-2xl font-bold">{t.needMoreTime[state.lang]}</div>
          <div className="mt-2 text-neutral-600">{state.lang === "ko" ? `${idle.secondsLeft}초 후 처음 화면으로 돌아갑니다` : `Returning to the start screen in ${idle.secondsLeft}s`}</div>
          <button type="button" onClick={touchActivity} className="mt-6 w-full rounded bg-red-600 py-4 text-xl font-bold text-white">
            {t.keepGoing[state.lang]}
          </button>
        </div>
      </div>
    ) : null;

  const kiosk = (
    <div style={{ width: KIOSK_W * scale, height: KIOSK_H * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <AirportKiosk
          state={state}
          press={press}
          onDevice={onDevice}
          waitPassport={waiting?.kind === "device" && !busy}
          banner={
            <>
              <KiboPointer hl={hl} active={progress !== null} screen={state.screen} />
              {variant === "dev" && banner}
              {timeoutPopup}
            </>
          }
        />
      </div>
    </div>
  );

  // 관문을 기다리는 동안 띠에 사람이 할 일
  const yourTurn = phase === "waiting_gate" && waiting ? (waiting.kind === "device" ? "put your passport in the reader" : "confirm on the phone") : null;
  const slotted = (
    <div className="flex flex-col items-center gap-2">
      <div className="h-[150px]" style={{ width: KIOSK_W * scale }}>
        <KiboBand phase={phase} slow={slow} chips={chips} progress={progress} slot yourTurn={yourTurn} />
      </div>
      {kiosk}
    </div>
  );
  if (variant === "kiosk")
    return (
      <div className="flex min-h-screen flex-col items-center bg-neutral-200 p-3">
        {slotted}
        {roomId && state.screen === "idle" && !busy && <PairBadge room={roomId} />}
      </div>
    );
  if (variant === "show")
    return (
      <div className="relative">
        {slotted}
        {roomId && qrOn && state.screen === "idle" && !busy && <PairBadge room={roomId} at="absolute top-0 right-0" />}
      </div>
    );

  return (
    <div className="flex min-h-screen items-start justify-center gap-6 bg-neutral-200 p-3">
      {kiosk}

      <div className="w-96 rounded-xl bg-white p-4 text-sm shadow">
        <div className="mb-2 font-bold">KIBO dev console · airport</div>
        <textarea className="h-24 w-full rounded border border-neutral-300 p-2" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-1">
          {samples.map((s) => (
            <button key={s} type="button" className="rounded bg-neutral-100 px-2 py-1 text-xs" onClick={() => setText(s)}>
              {s.slice(0, 18)}…
            </button>
          ))}
        </div>
        <button type="button" disabled={busy || thinking} onClick={() => ask(text)} className="mt-3 w-full rounded bg-teal-700 py-2 font-bold text-white disabled:opacity-50">
          {thinking ? "Thinking…" : busy ? "Operating…" : "Say it"}
        </button>
        {waiting && (
          <div className="mt-3 rounded border-2 border-orange-400 bg-orange-50 p-2" data-waiting={waiting.kind === "device" ? "passport" : waiting.what}>
            <div className="font-bold">Waiting for the person: {waiting.kind === "device" ? `passport (${waiting.who})` : waiting.what}</div>
            {waiting.kind === "ack" && (
              <button type="button" disabled={busy} onClick={() => ack(waiting.what)} className="mt-2 w-full rounded bg-orange-500 py-1.5 font-bold text-white disabled:opacity-50">
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
                <div>
                  <b>intent</b>: {JSON.stringify(last.intent)}
                </div>
                <div>
                  <b>plan</b>: {last.plan.kind}
                  {last.plan.kind === "plan" && ` · ${last.plan.events.length} taps · stop ${JSON.stringify(last.plan.stop)}`}
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
          screen: {state.screen} · passports: {state.scanned.length} · run: {run.startedAt && run.endedAt ? `${((run.endedAt - run.startedAt) / 1000).toFixed(1)} s` : "—"} · taps {run.humanTaps}/{run.kiboTaps}
          <button type="button" className="ml-2 underline" onClick={() => !turn.busy() && apply(initialState(state.lang))}>
            reset
          </button>
        </div>
      </div>
    </div>
  );
}
