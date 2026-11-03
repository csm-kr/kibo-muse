"use client";

// 사용자 시험 기록기. ?log=1일 때만 켜지고, 화면 왼쪽 아래 구석에 작은 [시작]·[기록 저장]을 띄운다(진행자용, 흐리게).
// 기록은 새로고침에 대비해 localStorage에도 두고, [기록 저장]을 누르면 JSON 파일로 내려받는다. 음성·전사문·사진은 넣지 않는다.
// [시작]·[다시 시작]은 앞 기록을 지우지 않는다. 기록은 계속 쌓이고, 시도마다 시도 번호·시작 시각을 단 start가 사이를 가른다.
// [기록 저장]은 쌓인 시도 전부를 내보낸다(room은 빼고). 기록은 [기록 지우기]에서 두 번 확인을 받은 뒤에만 지운다.
// [시작] 때 참가자 번호(P1–P3)와 조건(touch/kibo)을 함께 남긴다(개인정보 아님).
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { askTwice, judgeTrial, startSession, summarize, trialExport, type TrialEvent, type TrialTask } from "@/engine/trialLog";

const noop = () => () => {};
export const useLogFlag = () =>
  useSyncExternalStore(
    noop,
    () => new URLSearchParams(location.search).get("log") === "1",
    () => false,
  );

function load(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

export function useTrialLog(enabled: boolean, kiosk: string) {
  const key = `kibo.trial.${kiosk}`;
  const [events, setEvents] = useState<TrialEvent[]>(() => {
    const v = load(key);
    return Array.isArray(v) ? v : [];
  });
  // 마지막 [기록 저장] 때 기록이 몇 개였는가. 그보다 많으면 저장하지 않은 기록이 있다([기록 지우기]에서 알린다)
  const [savedLen, setSavedLen] = useState(() => {
    const v = load(`${key}.saved`);
    return typeof v === "number" ? v : 0;
  });
  useEffect(() => {
    if (!enabled) return;
    try {
      localStorage.setItem(key, JSON.stringify(events));
      localStorage.setItem(`${key}.saved`, JSON.stringify(savedLen));
    } catch {
      // 저장할 수 없으면 메모리에만 둔다
    }
  }, [enabled, key, events, savedLen]);
  const log = useCallback((e: Omit<TrialEvent, "t">) => enabled && setEvents((es) => [...es, { t: Date.now(), ...e }]), [enabled]);
  const start = useCallback((screen: string, participant: string, condition: string) => setEvents((es) => startSession(es, Date.now(), screen, participant, condition)), []);
  const markSaved = useCallback(() => setSavedLen(events.length), [events.length]);
  const clear = useCallback(() => {
    const n = events.filter((e) => e.kind === "start").length;
    const unsaved = events.length > savedLen ? " 저장하지 않은 기록이 있어요." : "";
    if (!askTwice((m) => window.confirm(m), `시험 기록(시도 ${n}개)을 모두 지울까요?${unsaved}`, "정말 지울까요? 지운 기록은 되돌릴 수 없어요.")) return;
    setEvents([]);
    setSavedLen(0);
  }, [events, savedLen]);
  return { events, log, start, saved: markSaved, clear };
}

export function TrialPanel({ events, onStart, onSaved, onClear, kiosk, task }: { events: TrialEvent[]; onStart: (participant: string, condition: string) => void; onSaved: () => void; onClear: () => void; kiosk: string; task?: TrialTask }) {
  const s = summarize(events);
  const judge = task ? judgeTrial(events, task) : null;
  const startEv = events.findLast((e) => e.kind === "start");
  const started = !!startEv;
  const [participant, setParticipant] = useState(startEv?.participant ?? "P1");
  const [condition, setCondition] = useState(startEv?.condition ?? "kibo");
  function save() {
    const out = trialExport(kiosk, events, task, Date.now());
    const stamp = out.exportedAt.replace(/[:.]/g, "-");
    // 파일 이름에는 기록에 든 참가자들(P1+P2)
    const who = [...new Set(out.sessions.map((x) => x.participant ?? "P"))].join("+") || "P";
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kibo-trial-${kiosk}-${who}-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    onSaved();
  }
  return (
    <div className="group fixed bottom-3 left-3 z-50 flex items-center gap-1.5 rounded-lg bg-white/80 p-1.5 text-[11px] text-neutral-700 opacity-40 hover:opacity-100" data-trial={started ? "started" : "ready"}>
      <select value={participant} onChange={(e) => setParticipant(e.target.value)} className="rounded border border-neutral-400 px-1 py-1" aria-label="participant" data-trial-participant>
        {["P1", "P2", "P3"].map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <select value={condition} onChange={(e) => setCondition(e.target.value)} className="rounded border border-neutral-400 px-1 py-1" aria-label="condition" data-trial-condition>
        {["touch", "kibo"].map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <button type="button" onClick={() => onStart(participant, condition)} className="rounded border border-neutral-400 px-2 py-1">
        {started ? "다시 시작" : "시작"}
      </button>
      <button type="button" onClick={save} className="rounded border border-neutral-400 px-2 py-1" data-trial-save>
        기록 저장
      </button>
      {/* 지우기는 떨어뜨려 두고 두 번 묻는다(무심코 눌러 시험 데이터를 잃지 않게) */}
      <button type="button" onClick={onClear} className="ml-3 rounded px-1.5 py-1 text-red-700 underline" data-trial-clear>
        기록 지우기
      </button>
      {/* 요약은 진행자가 가리킬 때만 보인다 */}
      <span className="hidden group-hover:inline" data-trial-summary>
        {s.msToReview !== null ? `${(s.msToReview / 1000).toFixed(1)}s` : "–"} · 탭 {s.humanTaps}/{s.kiboTaps} · 턴 {s.turns} · 시도 {s.listens} · 되돌림 {s.undos} · 거절 {s.rejects} · 초기화 {s.resets} · 경고 {s.warnings}
        {judge?.reached && (judge.correct ? " · 정답" : ` · 오류 완료(${judge.mismatches.length})`)}
      </span>
    </div>
  );
}
