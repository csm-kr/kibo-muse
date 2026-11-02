"use client";

// 키오스크 한 대와 KIBO 개발용 콘솔. 사람 터치와 KIBO 재생이 같은 step()을 거친다.

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { idlePhase, type IdlePhase } from "@/engine/idle";
import { localLink, type Link } from "@/sync/link";
import { initialState, step, type KioskEvent, type KioskState, type Target } from "../machine";
import { FastfoodKiosk, type Highlight } from "./Kiosk";
import { t } from "./strings";

const STEP_MS = 520;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface InterpretResponse {
  say: string;
  replyLanguage: string;
  unknownItems: string[];
  plan: { kind: "plan"; events: KioskEvent[]; paymentHandoff: boolean; assumed: unknown[] } | { kind: "clarify"; missing: unknown[] } | { kind: "reject"; reason: string };
  timing: { sparkMs: number; totalMs: number };
  error?: string;
}

function speak(text: string, lang: string) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase().slice(0, 2)));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

function useFitScale(height: number) {
  const [scale, setScale] = useState(0.8);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min((window.innerHeight - 24) / height, 1.25));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [height]);
  return scale;
}

const samples = [
  "더블 치즈버거 라지 세트, 음료는 제로 콜라로, 피클 빼고, 먹고 갈게요",
  "Can I get a large double cheeseburger meal with a Coke Zero, no pickles, for here?",
  "ダブルチーズバーガーのLセット、ドリンクはコーラゼロで、ピクルス抜き、店内で。",
  "치즈버거 세트 하나요",
];

export function FastfoodStation() {
  const [state, setState] = useState<KioskState>(initialState);
  const stateRef = useRef(state);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [hl, setHl] = useState<Highlight>(null);
  const [progress, setProgress] = useState<{ i: number; n: number } | null>(null);
  const [text, setText] = useState(samples[0]);
  const [last, setLast] = useState<InterpretResponse | null>(null);
  const [thinking, setThinking] = useState(false);
  const scale = useFitScale(960);
  const linkRef = useRef<Link | null>(null);
  const [hello, setHello] = useState(0);
  const lastActRef = useRef(0);
  const [idle, setIdle] = useState<IdlePhase>({ kind: "active" });

  const touchActivity = useCallback(() => {
    lastActRef.current = Date.now();
    setIdle({ kind: "active" });
  }, []);

  const apply = useCallback(
    (s: KioskState) => {
      stateRef.current = s;
      setState(s);
      touchActivity();
    },
    [touchActivity],
  );

  // 실제 키오스크처럼 오래 조작이 없으면 경고하고, 그래도 없으면 처음 화면으로 돌아간다
  useEffect(() => {
    lastActRef.current = Date.now();
    const id = setInterval(() => {
      if (busyRef.current) return;
      const ph = idlePhase(Date.now() - lastActRef.current, stateRef.current.screen);
      if (ph.kind === "reset") apply(initialState());
      else setIdle(ph);
    }, 500);
    return () => clearInterval(id);
  }, [apply]);

  const press = useCallback((target: Target, value?: string) => {
    if (busyRef.current) return;
    const r = step(stateRef.current, value === undefined ? { by: "touch", target } : { by: "touch", target, value });
    if (r.ok) apply(r.state);
  }, [apply]);

  // 실제 키오스크처럼 "담기 완료" 화면은 잠시 뒤 메뉴로 돌아간다
  useEffect(() => {
    if (state.screen !== "added" || busy) return;
    const id = setTimeout(() => press("added_ok"), 1500);
    return () => clearTimeout(id);
  }, [state.screen, busy, press]);

  async function play(events: KioskEvent[]) {
    busyRef.current = true;
    setBusy(true);
    try {
      for (const [i, e] of events.entries()) {
        setProgress({ i: i + 1, n: events.length });
        setHl({ target: e.target, value: e.value });
        await sleep(STEP_MS);
        const r = step(stateRef.current, e);
        if (!r.ok) {
          console.error("KIBO step failed", e, r.error);
          break;
        }
        apply(r.state);
        setHl(null);
        await sleep(120);
      }
    } finally {
      setHl(null);
      setProgress(null);
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function ask(utterance: string, fromPhone = false) {
    if (busyRef.current) return;
    touchActivity();
    setThinking(true);
    const res = await fetch("/api/fastfood/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterance, state: stateRef.current }),
    });
    const body = (await res.json()) as InterpretResponse;
    setThinking(false);
    setLast(body);
    const p = body.plan;
    linkRef.current?.send(
      body.error
        ? { type: "reply", say: body.error, replyLanguage: "en", result: "error" }
        : { type: "reply", say: body.say, replyLanguage: body.replyLanguage, result: p.kind, ...(p.kind === "plan" && { taps: p.events.length, paymentHandoff: p.paymentHandoff }) },
    );
    if (body.error) return;
    // 휴대폰에서 온 말이면 휴대폰이 대답을 읽는다
    if (!fromPhone) speak(body.say, body.replyLanguage);
    if (p.kind === "plan") await play(p.events);
  }
  const onPhoneUtterance = useEffectEvent((u: string) => {
    setText(u);
    void ask(u, true);
  });

  useEffect(() => {
    const link = localLink(new URLSearchParams(location.search).get("room") ?? "demo");
    linkRef.current = link;
    const off = link.subscribe((m) => {
      if (m.type === "utterance") onPhoneUtterance(m.text);
      if (m.type === "hello") setHello((n) => n + 1);
    });
    return () => {
      off();
      link.close();
    };
  }, []);

  // 휴대폰에 지금 화면과 진행을 알린다
  useEffect(() => {
    const total = state.cart.reduce((n, l) => n + l.qty * l.unitPrice, 0);
    const items = state.cart.reduce((n, l) => n + l.qty, 0);
    linkRef.current?.send({ type: "status", screen: state.screen, busy, items, total, ...(progress && { step: progress.i, steps: progress.n }) });
  }, [state, busy, progress, hello]);

  const banner = progress ? (
    <div className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 bg-orange-500 px-4 py-2 text-sm font-bold text-white">
      🤖 {t.kiboOperating[state.lang]}
      <span className="ml-auto">
        {t.step[state.lang]} {progress.i}/{progress.n}
      </span>
    </div>
  ) : null;

  const timeoutPopup =
    idle.kind === "warning" ? (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-neutral-900/60 p-8" role="alertdialog" aria-label={t.needMoreTime[state.lang]}>
        <div className="w-full rounded-xl bg-white p-8 text-center">
          <div className="text-6xl">⏱️</div>
          <div className="mt-4 text-2xl font-bold">{t.needMoreTime[state.lang]}</div>
          <div className="mt-2 text-neutral-600">{state.lang === "ko" ? `${idle.secondsLeft}초 후 처음 화면으로 돌아갑니다` : `Returning to the start screen in ${idle.secondsLeft}s`}</div>
          <button type="button" onClick={touchActivity} className="mt-6 w-full rounded bg-orange-500 py-4 text-xl font-bold text-white">
            {t.continue[state.lang]}
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="flex min-h-screen items-start justify-center gap-8 bg-neutral-200 p-3">
      <div style={{ width: 540 * scale, height: 960 * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <FastfoodKiosk
            state={state}
            press={press}
            highlight={hl}
            banner={
              <>
                {banner}
                {timeoutPopup}
              </>
            }
          />
        </div>
      </div>

      <div className="w-96 rounded-xl bg-white p-4 text-sm shadow">
        <div className="mb-2 font-bold">KIBO dev console</div>
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
                  <b>plan</b>: {last.plan.kind}
                  {last.plan.kind === "plan" && ` · ${last.plan.events.length} taps${last.plan.paymentHandoff ? " · payment handed to customer" : ""}`}
                  {last.plan.kind !== "plan" && ` · ${JSON.stringify("missing" in last.plan ? last.plan.missing : last.plan.reason)}`}
                </div>
                {last.unknownItems.length > 0 && (
                  <div>
                    <b>not on menu</b>: {last.unknownItems.join(", ")}
                  </div>
                )}
                <div>
                  <b>timing</b>: Spark {last.timing.sparkMs} ms · server {last.timing.totalMs} ms
                </div>
              </>
            )}
          </div>
        )}
        <div className="mt-4 border-t pt-2 text-xs text-neutral-500">
          screen: {state.screen} · cart: {state.cart.length} lines
          <button type="button" className="ml-2 underline" onClick={() => !busy && apply(initialState(state.lang))}>
            reset
          </button>
        </div>
      </div>
    </div>
  );
}
