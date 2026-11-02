// 무조작 시간 초과. 실제 키오스크의 공식 수치를 찾지 못해 90초 + 경고 30초로 정했다(【추론】).
export const IDLE_WARN_MS = 90_000;
export const IDLE_COUNTDOWN_MS = 30_000;

export type IdlePhase = { kind: "active" } | { kind: "warning"; secondsLeft: number } | { kind: "reset" };

export function idlePhase(msSinceActivity: number, screen: string): IdlePhase {
  if (screen === "idle" || msSinceActivity < IDLE_WARN_MS) return { kind: "active" };
  const left = IDLE_WARN_MS + IDLE_COUNTDOWN_MS - msSinceActivity;
  return left <= 0 ? { kind: "reset" } : { kind: "warning", secondsLeft: Math.ceil(left / 1000) };
}
