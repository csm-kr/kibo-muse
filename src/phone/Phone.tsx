"use client";

// 사용자의 휴대폰 화면. 말하면 전사해서 키오스크로 보내고, KIBO의 대답을 사용자의 언어로 읽어 준다.

import { useEffect, useRef, useState } from "react";
import { encodeWav } from "@/engine/wav";
import { localLink, type Link, type LinkMsg } from "@/sync/link";

const langs = [
  { label: "English", bias: "English", tts: "en-US" },
  { label: "한국어", bias: "Korean", tts: "ko-KR" },
  { label: "日本語", bias: "Japanese", tts: "ja-JP" },
  { label: "Tiếng Việt", bias: "Vietnamese", tts: "vi-VN" },
  { label: "中文", bias: "Chinese", tts: "zh-CN" },
  { label: "Español", bias: "Spanish", tts: "es-ES" },
];

type Turn = { who: "you" | "kibo"; text: string };
type Status = Extract<LinkMsg, { type: "status" }>;

function speak(text: string, lang: string) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.speak(u);
}

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

export function Phone() {
  const [lang, setLang] = useState(langs[0]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [handoff, setHandoff] = useState(false);
  const [phase, setPhase] = useState<"idle" | "recording" | "sending">("idle");
  const [typed, setTyped] = useState("");
  const linkRef = useRef<Link | null>(null);
  const recRef = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [turns, handoff]);

  useEffect(() => {
    const room = new URLSearchParams(location.search).get("room") ?? "demo";
    const link = localLink(room);
    linkRef.current = link;
    const off = link.subscribe((m) => {
      if (m.type === "status") setStatus(m);
      if (m.type === "reply") {
        setTurns((t) => [...t, { who: "kibo", text: m.say }]);
        setHandoff(!!m.paymentHandoff);
        speak(m.say, m.replyLanguage);
      }
    });
    link.send({ type: "hello" });
    return () => {
      off();
      link.close();
    };
  }, []);

  function send(text: string) {
    if (!text.trim()) return;
    setTurns((t) => [...t, { who: "you", text }]);
    linkRef.current?.send({ type: "utterance", text, lang: lang.bias });
  }

  async function toggleMic() {
    if (phase === "idle") {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.start();
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
      const res = await fetch(`/api/transcribe?lang=${encodeURIComponent(lang.bias)}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav as BodyInit });
      const body = (await res.json()) as { transcript?: string; error?: string };
      if (body.transcript) send(body.transcript);
      else setTurns((t) => [...t, { who: "kibo", text: body.error ?? "…" }]);
    } finally {
      setPhase("idle");
    }
  }

  const operating = status?.busy && status.steps;

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-neutral-50 text-neutral-900">
      <header className="flex items-center gap-2 bg-teal-800 px-4 py-3 text-white">
        <span className="text-xl font-black">KIBO</span>
        <span className="text-sm opacity-80">· Bridge Burger kiosk</span>
        <span className={`ml-auto h-2.5 w-2.5 rounded-full ${status ? "bg-green-400" : "bg-neutral-400"}`} aria-label={status ? "connected" : "waiting for kiosk"} />
      </header>

      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {langs.map((l) => (
          <button key={l.bias} type="button" onClick={() => setLang(l)} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${l.bias === lang.bias ? "border-teal-700 bg-teal-700 text-white" : "border-neutral-300 bg-white"}`}>
            {l.label}
          </button>
        ))}
      </div>

      {status && (
        <div className="mx-4 rounded-lg bg-white p-3 text-sm shadow-sm" aria-live="polite">
          {operating ? (
            <>
              <div className="font-bold">
                KIBO is operating the kiosk · {status.step}/{status.steps}
              </div>
              <div className="mt-2 h-2 rounded bg-neutral-200">
                <div className="h-2 rounded bg-orange-500 transition-all" style={{ width: `${(100 * (status.step ?? 0)) / (status.steps ?? 1)}%` }} />
              </div>
            </>
          ) : (
            <div>
              Kiosk screen: <b>{status.screen}</b> · {status.items} item(s) · ₩{status.total.toLocaleString("en-US")}
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
        {handoff && <div className="rounded-xl border-2 border-orange-500 bg-orange-50 p-4 text-center text-lg font-bold">💳 Tap “Pay” on the kiosk. KIBO never pays for you.</div>}
        <div ref={endRef} />
      </div>

      <div className="flex flex-col items-center gap-3 border-t border-neutral-200 bg-neutral-50 px-4 pt-3 pb-6">
        <button
          type="button"
          onClick={toggleMic}
          disabled={phase === "sending"}
          aria-label={phase === "recording" ? "Stop and send" : "Start speaking"}
          className={`flex h-28 w-28 items-center justify-center rounded-full text-5xl text-white shadow-lg ${phase === "recording" ? "animate-pulse bg-red-600" : "bg-teal-700"} disabled:opacity-50`}
        >
          {phase === "sending" ? "…" : phase === "recording" ? "■" : "🎤"}
        </button>
        <div className="text-sm text-neutral-600">{phase === "recording" ? "Listening… tap to send" : "Tap and say your order"}</div>
        <form
          className="flex w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(typed);
            setTyped("");
          }}
        >
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="…or type it" className="flex-1 rounded-lg border border-neutral-300 px-3 py-2" />
          <button type="submit" className="rounded-lg bg-neutral-800 px-4 text-white">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
