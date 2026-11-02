// 나란히 비교 장면의 실측. 첫 조작(또는 휴대폰 마이크)부터 끝 화면까지 시간, 사람이 누른 횟수, 넘긴 화면 수를 잰다.

export interface RunStats {
  endOn: string;
  startedAt: number | null;
  endedAt: number | null;
  humanTaps: number;
  kiboTaps: number;
  screens: number;
  lastScreen: string;
}

export type RunEvent = { type: "listening" } | { type: "step"; by: RunBy; screen: string };
// auto = 키오스크가 스스로 넘긴 화면(담기 완료 후 메뉴 복귀). 누른 횟수에 넣지 않는다
export type RunBy = "touch" | "kibo" | "auto";

export const newRun = (endOn: string): RunStats => ({ endOn, startedAt: null, endedAt: null, humanTaps: 0, kiboTaps: 0, screens: 0, lastScreen: "idle" });

export function trackRun(r: RunStats, e: RunEvent, now: number): RunStats {
  if (e.type === "step" && e.screen === "idle") return newRun(r.endOn);
  if (r.endedAt !== null) return r;
  const startedAt = r.startedAt ?? now;
  if (e.type === "listening") return { ...r, startedAt };
  const changed = e.screen !== r.lastScreen;
  return {
    ...r,
    startedAt,
    humanTaps: r.humanTaps + (e.by === "touch" ? 1 : 0),
    kiboTaps: r.kiboTaps + (e.by === "kibo" ? 1 : 0),
    screens: r.screens + (changed ? 1 : 0),
    lastScreen: e.screen,
    endedAt: e.screen === r.endOn ? now : null,
  };
}
