"use client";

// 누르고 말하기 녹음. 누르는 동안 녹음하고, 떼면(버튼 밖으로 나가거나 브라우저가 취소해도) 조금 더 녹음한 뒤 넘긴다.
// 휴대폰 화면과 받아쓰기 측정 화면(/asr-test)이 같은 길을 쓴다(같은 길을 재야 측정이 의미 있다)

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { releaseAction, TAIL_MS } from "./ptt";

// 녹음 한 번. startDelayMs = 누른 순간부터 녹음이 실제로 시작될 때까지, durationMs = 녹음 길이(뗀 뒤 꼬리 포함)
export interface Take {
  blob: Blob;
  startDelayMs: number;
  durationMs: number;
}

interface Press {
  at: number;
  rec?: MediaRecorder;
  startedAt?: number;
  chunks: Blob[];
}

export interface HoldToTalk {
  // 누른 순간(녹음 전). 소리 잠금 풀기, 안내 지우기 같은 일
  onPress?(): void;
  // 녹음이 실제로 시작됨
  onRecording?(): void;
  // 뗀 뒤 녹음본. 이것이 끝날 때까지 'sending'
  onTake(take: Take): Promise<void> | void;
  onTooShort?(): void;
  onBlocked?(): void;
}

// 길게 누를 때 메뉴·글자 선택·스크롤이 끼어들지 않게
export const HOLD_CLASS = "touch-none select-none [-webkit-touch-callout:none]";

const holdKey = (e: KeyboardEvent) => e.key === " " || e.key === "Enter";

export function useHoldToTalk(o: HoldToTalk) {
  const [phase, setPhase] = useState<"idle" | "recording" | "sending">("idle");
  // 마이크 스트림은 권한을 받은 뒤 열어 두고 다시 쓴다(누를 때마다 권한을 다시 묻지 않게)
  const streamRef = useRef<MediaStream | null>(null);
  const pressRef = useRef<Press | null>(null);
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  async function down() {
    if (phase !== "idle" || pressRef.current) return;
    const press: Press = { at: performance.now(), chunks: [] };
    pressRef.current = press;
    setPhase("recording");
    o.onPress?.();
    try {
      // 모노 한 채널. 반향 제거·잡음 억제·자동 음량은 브라우저 기본값(켬)을 그대로 쓴다
      streamRef.current ??= await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
    } catch {
      pressRef.current = null;
      setPhase("idle");
      o.onBlocked?.();
      return;
    }
    // 권한 창을 보는 사이에 손을 뗐으면 녹음하지 않는다
    if (pressRef.current !== press) return;
    const rec = new MediaRecorder(streamRef.current);
    rec.ondataavailable = (e) => press.chunks.push(e.data);
    rec.onstart = () => (press.startedAt = performance.now());
    rec.start();
    press.rec = rec;
    o.onRecording?.();
  }

  async function up() {
    const press = pressRef.current;
    if (!press) return;
    pressRef.current = null;
    const rec = press.rec;
    if (!rec || releaseAction(performance.now() - press.at) === "too_short") {
      rec?.stop();
      setPhase("idle");
      o.onTooShort?.();
      return;
    }
    setPhase("sending");
    await new Promise((r) => setTimeout(r, TAIL_MS));
    await new Promise((r) => {
      rec.onstop = r;
      rec.stop();
    });
    const end = performance.now();
    const startedAt = press.startedAt ?? end;
    try {
      await o.onTake({ blob: new Blob(press.chunks, { type: rec.mimeType }), startDelayMs: Math.round(startedAt - press.at), durationMs: Math.round(end - startedAt) });
    } finally {
      setPhase("idle");
    }
  }

  const bind = {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      down();
    },
    onPointerUp: () => void up(),
    onPointerCancel: () => void up(),
    onPointerLeave: () => void up(),
    onKeyDown: (e: KeyboardEvent) => {
      if (!holdKey(e)) return;
      e.preventDefault();
      if (!e.repeat) down();
    },
    onKeyUp: (e: KeyboardEvent) => holdKey(e) && void up(),
    onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(),
    disabled: phase === "sending",
  };
  return { phase, bind };
}
