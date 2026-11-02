"use client";

// 사용자의 휴대폰 화면. 말하면 전사해서 키오스크로 보내고, KIBO의 대답을 사용자의 언어로 읽어 준다.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { encodeWav } from "@/engine/wav";
import { openLink, type Link, type LinkGate, type LinkMsg } from "@/sync/link";
import { GuideCamera } from "./Guide";
import { pickLang, saveLang, savedLang } from "./lang";
import { payText } from "./pay";
import { speak } from "./speak";

// guide·pair: room 없이 연 휴대폰(어느 키오스크와도 연결 안 됨)은 안내 모드만 쓴다
const langs = [
  { label: "English", bias: "English", tts: "en-US", guide: "📷 Take a photo of any kiosk screen", pair: "Scan the QR code on a KIBO kiosk to connect." },
  { label: "한국어", bias: "Korean", tts: "ko-KR", guide: "📷 아무 키오스크 화면이나 찍어 주세요", pair: "키오스크의 QR을 찍으면 연결돼요." },
  { label: "日本語", bias: "Japanese", tts: "ja-JP", guide: "📷 キオスクの画面を撮影してください", pair: "キオスクのQRコードを読み取ると接続します。" },
  { label: "Tiếng Việt", bias: "Vietnamese", tts: "vi-VN", guide: "📷 Chụp màn hình kiosk bất kỳ", pair: "Quét mã QR trên kiosk để kết nối." },
  { label: "中文", bias: "Chinese", tts: "zh-CN", guide: "📷 拍下任意自助机的屏幕", pair: "扫描自助机上的二维码即可连接。" },
  { label: "Español", bias: "Spanish", tts: "es-ES", guide: "📷 Haz una foto de la pantalla de cualquier quiosco", pair: "Escanea el código QR del quiosco para conectarte." },
];

const noop = () => () => {};

type Turn = { who: "you" | "kibo"; text: string };
type Status = Extract<LinkMsg, { type: "status" }>;

// 녹음본을 16kHz 모노로 다시 표본화해 WAV로 만든다
async function toWav16k(blob: Blob) {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  await ctx.close();
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  return encodeWav((await off.startRendering()).getChannelData(0), 16000);
}

// embedded: 나란히 비교 화면(/compare) 안에 휴대폰 모양으로 넣는다
export function Phone({ room: roomProp, embedded = false }: { room?: string; embedded?: boolean } = {}) {
  // 기본 언어: 주소 ?lang= → 칩으로 고른 값(저장) → 브라우저 언어. 서버 렌더에서는 English
  const initialCode = useSyncExternalStore(noop, () => pickLang([new URLSearchParams(location.search).get("lang"), savedLang(), ...navigator.languages]), () => "en");
  const [picked, setLang] = useState<(typeof langs)[number] | null>(null);
  const lang = picked ?? langs.find((l) => l.tts.startsWith(initialCode))!;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  // KIBO가 이번 재생에서 지나온 화면 이름들(체크리스트)
  const [trail, setTrail] = useState<string[]>([]);
  // 결제 넘기기 안내. 키오스크가 알려 준 결제 버튼 이름(없으면 빈 문자열 → 일반 이름)
  const [handoff, setHandoff] = useState<string | null>(null);
  // 사람이 해야 하는 다음 일 (공항: 위험물 확인, 여권, 체크인 확정)
  const [gate, setGate] = useState<LinkGate | null>(null);
  const [phase, setPhase] = useState<"idle" | "recording" | "sending">("idle");
  const [typed, setTyped] = useState("");
  const linkRef = useRef<Link | null>(null);
  // 마지막으로 받은 관문 카드. 말하는 동안 카드는 숨기지만, 그때 한 '예'가 이 카드에 대한 말이라는 것은 id로 함께 보낸다
  const cardRef = useRef<LinkGate | null>(null);
  const recRef = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // room이 없으면(키오스크 QR로 열지 않음) 연결하지 않고 안내 모드만 쓴다. 서버 렌더에서는 아직 모른다(undefined)
  const room = useSyncExternalStore(
    noop,
    () => roomProp ?? new URLSearchParams(location.search).get("room"),
    () => roomProp,
  );
  const guideOnly = room === null;

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [turns, handoff, gate]);

  useEffect(() => {
    if (!room) return;
    // 같은 브라우저 안(나란히 비교의 내장 휴대폰)과, Supabase 키가 있으면 다른 기기의 키오스크를 함께 잇는다
    const link = openLink(room);
    linkRef.current = link;
    const off = link.subscribe((m) => {
      if (m.type === "status") {
        setStatus(m);
        // hello에 대한 답에는 지금 떠 있는 카드가 붙어 온다(끊긴 동안 놓친 카드)
        if (m.gate !== undefined) {
          setGate(m.gate);
          cardRef.current = m.gate;
        }
        const label = m.label;
        if (m.busy && m.steps && label) setTrail((t) => (m.step === 1 && t.at(-1) !== label ? [label] : t.at(-1) === label ? t : [...t, label]));
      }
      // KIBO가 대답한 언어로 언어 칩을 맞춘다(휴대폰 설정과 다른 언어로 말했을 때)
      if (m.type === "reply" || m.type === "done") {
        const code = m.replyLanguage.toLowerCase().slice(0, 2);
        const l = langs.find((x) => x.tts.toLowerCase().startsWith(code));
        if (l && !(m.type === "reply" && m.result === "busy")) setLang(l);
      }
      // 같은 room의 다른 휴대폰(나란히 비교의 내장 휴대폰과 실제 휴대폰)이 한 말도 대화에 보인다
      if (m.type === "utterance") setTurns((t) => [...t, { who: "you", text: m.text }]);
      // 해석이 8초를 넘기면 한 번 오는 '아직 생각 중'
      if (m.type === "slow") {
        setTurns((t) => [...t, { who: "kibo", text: m.say }]);
        speak(m.say, m.replyLanguage);
      }
      // 대답(reply)은 말마다 한 번, 완료(done)는 재생이 끝난 뒤. 관문 카드와 결제 안내는 완료에만 온다
      if (m.type === "reply") {
        if (m.say) setTurns((t) => [...t, { who: "kibo", text: m.say }]);
        if (m.result !== "busy") {
          setHandoff(null);
          setGate(null);
          cardRef.current = null;
        }
        speak(m.say, m.replyLanguage);
      }
      if (m.type === "done") {
        if (m.say) setTurns((t) => [...t, { who: "kibo", text: m.say }]);
        setHandoff(m.paymentHandoff ? (m.payButton ?? "") : null);
        setGate(m.gate);
        cardRef.current = m.gate;
        speak([m.say, m.gate?.text].filter(Boolean).join(" "), m.replyLanguage);
      }
    });
    // (다시) 연결될 때마다, 그리고 휴대폰 화면을 다시 켤 때마다 hello로 키오스크의 지금 상태를 받는다
    const offJoin = link.onJoin(() => link.send({ type: "hello" }));
    const onVisible = () => document.visibilityState === "visible" && link.send({ type: "hello" });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      offJoin();
      document.removeEventListener("visibilitychange", onVisible);
      link.close();
    };
  }, [room, roomProp]);

  function send(text: string) {
    if (!text.trim() || guideOnly) return;
    setTurns((t) => [...t, { who: "you", text }]);
    // 새로 말하면 떠 있던 관문 카드는 낡는다(답이 바뀔 수 있다). 새 카드가 오면 다시 뜬다
    setGate(null);
    const card = cardRef.current;
    linkRef.current?.send({ type: "utterance", id: crypto.randomUUID(), text, lang: lang.bias, ...(card?.kind === "ack" && card.id && { gateId: card.id }) });
  }

  async function toggleMic() {
    if (phase === "idle") {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.start();
      // 말하기 시작하면 관문 카드를 숨긴다. 말하는 동안 옛 카드를 누르지 않게
      setGate(null);
      linkRef.current?.send({ type: "listening" });
      recRef.current = { rec, stream, chunks };
      setPhase("recording");
      return;
    }
    if (phase !== "recording" || !recRef.current) return;
    const { rec, stream, chunks } = recRef.current;
    setPhase("sending");
    await new Promise((r) => {
      rec.onstop = r;
      rec.stop();
    });
    stream.getTracks().forEach((t) => t.stop());
    try {
      const wav = await toWav16k(new Blob(chunks, { type: rec.mimeType }));
      const res = await fetch(`/api/transcribe?lang=${encodeURIComponent(lang.bias)}&kiosk=${status?.kioskId ?? "fastfood"}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav as BodyInit });
      const body = (await res.json()) as { transcript?: string; error?: string; say?: string };
      // 안내 모드에서는 말한 것이 사진에 대한 질문이 된다
      if (body.transcript && guideOnly) setTyped(body.transcript);
      else if (body.transcript) send(body.transcript);
      // 한도·크기 초과는 서버가 휴대폰 언어로 만든 고정 문구(say)를 보낸다
      else setTurns((t) => [...t, { who: "kibo", text: body.say ?? body.error ?? "…" }]);
    } finally {
      setPhase("idle");
    }
  }

  function confirmGate(g: LinkGate) {
    setTurns((t) => [...t, { who: "you", text: `✔ ${g.button}` }]);
    setGate(null);
    linkRef.current?.send({ type: "ack", what: g.what, gateId: g.id });
  }

  const operating = status?.busy && status.steps;

  return (
    <div
      className={
        embedded
          ? "relative flex h-[880px] w-[400px] flex-col overflow-hidden rounded-[40px] border-[10px] border-neutral-800 bg-neutral-50 text-neutral-900 shadow-2xl"
          : "relative mx-auto flex h-dvh max-w-md flex-col bg-neutral-50 text-neutral-900"
      }
      data-phone
    >
      <header className="flex items-center gap-2 bg-teal-800 px-4 py-3 text-white">
        <span className="text-xl font-black">KIBO</span>
        <span className="text-sm opacity-80">· {status?.kiosk ?? (guideOnly ? "Guide" : "Bridge Burger kiosk")}</span>
        <span className={`ml-auto h-2.5 w-2.5 rounded-full ${status ? "bg-green-400" : "bg-neutral-400"}`} aria-label={status ? "connected" : "waiting for kiosk"} />
      </header>

      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {langs.map((l) => (
          <button key={l.bias} type="button" onClick={() => {
              setLang(l);
              saveLang(l.tts.slice(0, 2));
            }} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${l.bias === lang.bias ? "border-teal-700 bg-teal-700 text-white" : "border-neutral-300 bg-white"}`}>
            {l.label}
          </button>
        ))}
      </div>

      {status && (
        <div className={`mx-4 rounded-lg bg-white p-3 shadow-sm ${embedded ? "text-[22px] leading-snug" : "text-sm"}`} aria-live="polite">
          {operating ? (
            <>
              <div className="font-bold">
                KIBO is tapping · {status.step}/{status.steps} taps
              </div>
              <ul className="mt-1 space-y-0.5">
                {trail.slice(-4).map((l, i, shown) => {
                  const now = i === shown.length - 1;
                  return (
                    <li key={`${trail.length - shown.length + i}-${l}`} className={`kibo-line flex items-center gap-1.5 ${now ? "font-semibold text-neutral-900" : "text-neutral-500"}`}>
                      {now ? (
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-orange-500 motion-safe:animate-pulse" aria-hidden />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                          <path d="M2 7.5 5.5 11 12 3.5" fill="none" stroke="#0f766e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="kibo-tick" />
                        </svg>
                      )}
                      {l}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 h-2 rounded bg-neutral-200">
                <div className="h-2 rounded bg-orange-500 motion-safe:transition-all" style={{ width: `${(100 * (status.step ?? 0)) / (status.steps ?? 1)}%` }} />
              </div>
            </>
          ) : (
            <div>
              <b>{status.label ?? status.screen}</b>
              {status.summary ? <> · {status.summary}</> : <> · {status.items} item(s) · ₩{status.total.toLocaleString("en-US")}</>}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-3 text-lg leading-snug ${t.who === "you" ? "ml-auto bg-teal-700 text-white" : "bg-white shadow-sm"}`}>
            {t.text}
          </div>
        ))}
        {gate && (
          <div data-gate={gate.what} className={`rounded-xl border-2 p-4 text-lg leading-snug ${gate.kind === "done" ? "border-teal-600 bg-teal-50" : "border-orange-500 bg-orange-50"}`}>
            <div className="mb-2 text-3xl">{gate.what === "dangerous_goods" ? "🧯" : gate.what === "passport" ? "🛂" : gate.what === "confirm_checkin" ? "🪑" : "🎫"}</div>
            <div>{gate.text}</div>
            {gate.kind === "ack" && gate.button && (
              // 카드 글이 길어도 버튼은 화면 아래에 붙어 보이게 한다
              <button type="button" onClick={() => confirmGate(gate)} className="sticky bottom-0 mt-4 w-full rounded-xl bg-orange-500 py-4 text-xl font-bold text-white shadow-[0_-8px_16px_rgba(255,247,237,0.9)]">
                ✔ {gate.button}
              </button>
            )}
          </div>
        )}
        {handoff !== null && <div className="rounded-xl border-2 border-orange-500 bg-orange-50 p-4 text-center text-lg font-bold">💳 {payText(lang.tts, handoff)}</div>}
        <div ref={endRef} />
      </div>

      <div className="flex flex-col items-center gap-3 border-t border-neutral-200 bg-neutral-50 px-4 pt-3 pb-6">
        <button
          type="button"
          onClick={toggleMic}
          disabled={phase === "sending"}
          aria-label={phase === "recording" ? "Stop and send" : "Start speaking"}
          className={`flex h-28 w-28 items-center justify-center rounded-full text-5xl text-white shadow-lg ${phase === "recording" ? "bg-red-600 motion-safe:animate-pulse" : "bg-teal-700"} disabled:opacity-50`}
        >
          {phase === "sending" ? "…" : phase === "recording" ? "■" : "🎤"}
        </button>
        <div className="text-sm text-neutral-600" data-phone-hint>
          {phase === "recording" ? "Listening… tap to send" : guideOnly ? lang.guide : status?.kioskId && status.kioskId !== "fastfood" ? "Tap and tell me what you need" : "Tap and say your order"}
        </div>
        {guideOnly && <div className="text-xs text-neutral-500">{lang.pair}</div>}
        <form
          className="flex w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(typed);
            setTyped("");
          }}
        >
          {/* 안내 모드: KIBO가 조작할 수 없는 키오스크는 화면을 찍으면 누를 버튼을 알려 준다. 입력 칸의 글을 질문으로 쓴다 */}
          <GuideCamera question={typed} language={lang.bias} tts={lang.tts} onAsked={() => setTyped("")} />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="…or type it" className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2" />
          {!guideOnly && (
            <button type="submit" className="rounded-lg bg-neutral-800 px-4 text-white">
              Send
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
