"use client";

// createTurn을 React 화면에 붙인다. 턴 객체는 화면이 살아 있는 동안 하나이고, deps는 매 렌더 뒤 최신 함수로 바꿔 끼운다.

import { useLayoutEffect, useState } from "react";
import { createTurn, type TurnDeps, type TurnPhase } from "./turn";

export function useKiboTurn<E>(deps: Omit<TurnDeps<E>, "onPhase" | "onSlow">) {
  const [phase, setPhase] = useState<TurnPhase>("idle");
  // 해석이 오래 걸리는 중(띠에 '아직 생각 중'). phase가 바뀌면 끝난다
  const [slow, setSlow] = useState(false);
  const [turn] = useState(() =>
    createTurn<E>({
      ...deps,
      onPhase: (p) => {
        setPhase(p);
        setSlow(false);
      },
      onSlow: () => setSlow(true),
    }),
  );
  useLayoutEffect(() => {
    turn.rebind(deps);
  });
  return { turn, phase, slow, busy: phase === "thinking" || phase === "replaying" };
}
