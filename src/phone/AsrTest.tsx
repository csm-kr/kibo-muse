"use client";

// 받아쓰기 측정 화면(/asr-test). 휴대폰 화면과 같은 누르고 말하기 녹음을 쓰고, 같은 녹음을 24kHz(a)·16kHz(b) 두 갈래로 보낸다.
// 소리는 저장하지 않는다. 결과는 글자만 다루고, 사용자가 '결과 복사'로 채팅에 붙여 넣는다

import { useRef, useState } from "react";
import { cer, repeated, SENTENCES, summarize } from "./asr";
import { decodeBlob, wavAt } from "./audio";
import { useDocLang } from "./docLang";
import { HOLD_CLASS, useHoldToTalk, type Take } from "./useHoldToTalk";

interface Branch {
  rate: number;
  text: string;
  cer: number;
  repeated: boolean;
  ms?: number;
  error?: string;
}
interface Row {
  n: number;
  lang: string;
  ref: string;
  a: Branch;
  b: Branch;
  startDelayMs: number;
  durationMs: number;
}

// 한도(분당 20, 3초마다 1개 충전)에 걸리면 잠깐 기다렸다가 다시 보낸다
async function transcribeAt(decoded: AudioBuffer, rate: number, ref: string, lang: string): Promise<Branch> {
  const wav = await wavAt(decoded, rate);
  for (let tries = 0; ; tries++) {
    const res = await fetch(`/api/transcribe?lang=${encodeURIComponent(lang)}&kiosk=fastfood`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav as BodyInit });
    if (res.status === 429 && tries < 10) {
      await new Promise((r) => setTimeout(r, 3500));
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as { transcript?: string; error?: string; ms?: number };
    const text = body.transcript ?? "";
    return { rate, text, cer: cer(ref, text), repeated: repeated(ref, text), ms: body.ms, ...(!res.ok && { error: body.error ?? `HTTP ${res.status}` }) };
  }
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

export function AsrTest() {
  // 안내 글이 한국어인 화면
  useDocLang("ko");
  const [rows, setRows] = useState<(Row | undefined)[]>([]);
  const [i, setI] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // 마지막 문장을 마친 시각. 렌더 중에 new Date()를 부르면 Next가 미리 그리기(prerender)에서 빌드를 멈춘다
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const jsonRef = useRef<HTMLTextAreaElement>(null);
  const done = rows.filter(Boolean) as Row[];
  const finished = i >= SENTENCES.length;
  const s = SENTENCES[i];

  async function onTake({ blob, startDelayMs, durationMs }: Take) {
    const at = i;
    const { lang, text: ref } = SENTENCES[at];
    // 소리가 거의 담기지 않은 녹음은 풀 수 없다. 같은 문장을 다시 읽게 한다
    const decoded = await decodeBlob(blob).catch(() => null);
    if (!decoded) return setNotice("녹음을 읽지 못했어요. 한 번 더 읽어 주세요.");
    const [a, b] = await Promise.all([transcribeAt(decoded, 24000, ref, lang), transcribeAt(decoded, 16000, ref, lang)]);
    // 한 번에 한 녹음만 보내므로(보내는 동안 버튼이 꺼진다) 이 화면의 rows가 최신이다
    const next = [...rows];
    next[at] = { n: at + 1, lang, ref, a, b, startDelayMs, durationMs };
    setRows(next);
    // 다음 문장: 아직 결과가 없는 것 중 첫 번째
    const empty = SENTENCES.findIndex((_, k) => !next[k]);
    setI(empty === -1 ? SENTENCES.length : empty);
    if (empty === -1) setFinishedAt(new Date().toISOString());
  }

  const { phase, bind } = useHoldToTalk({
    onPress: () => setNotice(null),
    onTake,
    onTooShort: () => setNotice("누른 채로 읽어 주세요"),
    onBlocked: () => setNotice("마이크를 쓸 수 없어요. 브라우저 설정에서 마이크를 허용해 주세요."),
    onFailed: () => setNotice("다시 눌러 읽어 주세요"),
    onAllowRetry: () => setNotice("마이크를 허용했으면 다시 눌러 읽어 주세요"),
    onTooLong: () => setNotice("55초가 넘어서 여기까지 보냈어요"),
  });

  const summary = done.length ? summarize(done) : null;
  const json = finished ? JSON.stringify({ page: "asr-test", at: finishedAt, ua: navigator.userAgent, summary, rows: done }, null, 2) : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied("복사했어요. 채팅에 붙여 넣어 주세요.");
    } catch {
      // http 주소처럼 클립보드 API가 막힌 곳: 아래 글 칸을 골라 직접 복사한다
      jsonRef.current?.select();
      setCopied(document.execCommand("copy") ? "복사했어요. 채팅에 붙여 넣어 주세요." : "아래 글 칸을 길게 눌러 모두 선택한 뒤 복사해 주세요.");
    }
  }

  const last = done.at(-1);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 bg-neutral-50 p-4 text-neutral-900">
      <header className="flex items-center justify-between">
        <h1 className="font-bold">받아쓰기 측정</h1>
        <span className="text-sm text-neutral-500">
          {Math.min(i + 1, SENTENCES.length)}/{SENTENCES.length} · 완료 {done.length}
        </span>
      </header>

      {!finished && (
        <>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="text-xs text-neutral-500">
              {i + 1}번 · {s.lang === "Korean" ? "한국어" : "영어"}
            </div>
            <div className="mt-2 text-3xl leading-snug font-bold" data-sentence>
              {s.text}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              {...bind}
              aria-label="누른 채로 읽기"
              className={`flex h-28 w-28 items-center justify-center rounded-full text-5xl text-white shadow-lg ${HOLD_CLASS} ${phase === "recording" ? "scale-110 bg-red-600 ring-8 ring-red-200" : "bg-teal-700"} aria-disabled:opacity-50`}
            >
              {phase === "sending" ? "…" : "🎤"}
            </button>
            <div className={`text-sm ${phase === "recording" ? "font-bold text-red-700" : notice ? "font-bold text-orange-700" : "text-neutral-600"}`} data-asr-hint>
              {phase === "recording" ? "듣고 있어요… 다 읽으면 떼세요" : phase === "sending" ? "보내는 중… (24kHz·16kHz 두 갈래)" : (notice ?? "누른 채로 문장을 읽고, 다 읽으면 떼세요")}
            </div>
          </div>
        </>
      )}

      {last && !finished && (
        <div className="rounded-lg bg-white p-3 text-sm shadow-sm" data-asr-last>
          <div className="text-neutral-500">
            {last.n}번 결과 · 시작 지연 {last.startDelayMs}ms · 녹음 {(last.durationMs / 1000).toFixed(1)}초
          </div>
          {[last.a, last.b].map((x) => (
            <div key={x.rate}>
              {x.rate / 1000}kHz · CER {pct(x.cer)}
              {x.repeated && " · 되풀이"}
              {x.error && ` · ${x.error}`} — {x.text || "(빈 결과)"}
            </div>
          ))}
          <button type="button" onClick={() => setI(last.n - 1)} className="mt-2 rounded border border-neutral-300 px-3 py-1">
            ↺ {last.n}번 다시 읽기
          </button>
        </div>
      )}

      {finished && summary && (
        <div className="space-y-3" data-asr-summary>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div>
              평균 CER · 24kHz(a) <b>{pct(summary.cerA)}</b> · 16kHz(b) <b>{pct(summary.cerB)}</b>
            </div>
            <div>
              되풀이 · a {summary.repeatsA}건 · b {summary.repeatsB}건 (문장 {summary.n}개)
            </div>
          </div>
          <button type="button" onClick={copy} className="w-full rounded-xl bg-teal-700 py-3 text-lg font-bold text-white">
            결과 복사
          </button>
          {copied && <div className="text-sm text-teal-800">{copied}</div>}
          <table className="w-full text-xs [&_td]:pr-2 [&_td:not(:last-child)]:whitespace-nowrap [&_th]:pr-2">
            <thead>
              <tr className="text-left text-neutral-500">
                <th>#</th>
                <th>a CER</th>
                <th>b CER</th>
                <th>받아쓰기 (a / b)</th>
              </tr>
            </thead>
            <tbody>
              {done.map((r) => (
                <tr key={r.n} className="border-t border-neutral-200 align-top">
                  <td>{r.n}</td>
                  <td>
                    {pct(r.a.cer)}
                    {r.a.repeated && " ↻"}
                  </td>
                  <td>
                    {pct(r.b.cer)}
                    {r.b.repeated && " ↻"}
                  </td>
                  <td>
                    <div className="text-neutral-500">{r.ref}</div>
                    <div>a: {r.a.text || "—"}</div>
                    <div>b: {r.b.text || "—"}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <textarea ref={jsonRef} readOnly value={json} className="h-40 w-full rounded border border-neutral-300 p-2 font-mono text-[10px]" />
        </div>
      )}
    </main>
  );
}
