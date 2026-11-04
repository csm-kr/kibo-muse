"use client";

// 탭하고 말하기 녹음. 한 번 누르면 말이 끝나 조용해질 때까지 듣고, 조금 더 녹음한 뒤 넘긴다. 손을 떼거나 다시 눌러도 보내지 않는다.
// 휴대폰 화면과 받아쓰기 측정 화면(/asr-test)이 같은 길을 쓴다(같은 길을 재야 측정이 의미 있다)

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { assistClick, createMic, type MicEvents, type MicPhase, type RecorderLike } from "./mic";
import { watchSilence } from "./silence";

export type { Take } from "./mic";

// talking: KIBO가 말하는 중인가(탭 모드에서 끼어들기를 잰다), onBarge: 사람이 끼어들었다(KIBO를 멈춘다)
export type HoldToTalk = Omit<MicEvents, "onPhase">;

// 길게 누를 때 메뉴·글자 선택·스크롤이 끼어들지 않게
export const HOLD_CLASS = "touch-none select-none [-webkit-touch-callout:none]";

const holdKey = (e: KeyboardEvent) => e.key === " " || e.key === "Enter";

export function useHoldToTalk(o: HoldToTalk) {
  const [phase, setPhase] = useState<MicPhase>("idle");
  // 콜백은 매 렌더 최신 것을 부른다
  const evRef = useRef(o);
  useEffect(() => {
    evRef.current = o;
  });
  const micRef = useRef<ReturnType<typeof createMic> | null>(null);
  // 녹음기는 화면에 붙을 때 만든다. 녹음 중 화면이 숨겨지면(잠금·앱 전환) 뗀 것으로 보고, 화면을 떠나면 마이크를 끈다
  useEffect(() => {
    const mic = createMic(
      {
        // 모노 한 채널. 반향 제거·잡음 억제·자동 음량은 브라우저 기본값(켬)을 그대로 쓴다
        open: () => navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } }),
        record: (s) => new MediaRecorder(s as MediaStream) as unknown as RecorderLike,
        now: () => performance.now(),
        wait: (ms) => new Promise((r) => setTimeout(r, ms)),
        later: (fn, ms) => {
          const id = setTimeout(fn, ms);
          return () => clearTimeout(id);
        },
        watch: (s, end, none, keep) => watchSilence(s as MediaStream, end, none, { talking: () => evRef.current.talking?.() ?? false, barge: () => evRef.current.onBarge?.(), keep }),
      },
      {
        onPhase: setPhase,
        onPress: () => evRef.current.onPress?.(),
        onRecording: () => evRef.current.onRecording?.(),
        onTake: (t) => evRef.current.onTake(t),
        onBlocked: () => evRef.current.onBlocked?.(),
        onFailed: () => evRef.current.onFailed?.(),
        onTooLong: () => evRef.current.onTooLong?.(),
        onToggleOn: () => evRef.current.onToggleOn?.(),
        onNoSpeech: () => evRef.current.onNoSpeech?.(),
        talking: () => evRef.current.talking?.() ?? false,
        onBarge: () => evRef.current.onBarge?.(),
      },
    );
    micRef.current = mic;
    const onVis = () => document.visibilityState === "hidden" && mic.hidden();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      mic.dispose();
      micRef.current = null;
    };
  }, []);
  const down = () => micRef.current?.down();
  // 이어 듣기: 누름 없이 듣기 시작 / 듣던 것을 보내지 않고 멈추기(답 칩)
  const listen = useCallback(() => micRef.current?.listen(), []);
  const cancel = useCallback(() => micRef.current?.cancel(), []);

  const bind = {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      down();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (!holdKey(e)) return;
      e.preventDefault();
      if (!e.repeat) down();
    },
    // Space를 뗄 때 생기는 click이 한 번 더 누름이 되지 않게 막는다
    onKeyUp: (e: KeyboardEvent) => {
      if (holdKey(e)) e.preventDefault();
    },
    // 화면 읽기의 두 번 탭(합성 click, detail 0)도 누름이다
    onClick: (e: { detail: number }) => assistClick(down)(e),
    onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(),
    // 보내는 동안: disabled는 초점을 버튼 밖(body)으로 빼서 다음 턴에 마이크를 다시 찾아가야 한다. 알리기만 하고 눌러도 무시한다(mic가 phase로 막는다)
    "aria-disabled": phase === "sending",
  };
  return { phase, bind, listen, cancel };
}
