// 무조작 시간 초과. 실제 키오스크의 공식 수치를 찾지 못해 90초 + 경고 30초로 정했다(【추론】).
export const IDLE_WARN_MS = 90_000;
export const IDLE_COUNTDOWN_MS = 30_000;

export type IdlePhase = { kind: "active" } | { kind: "warning"; secondsLeft: number } | { kind: "reset" };

// 결제를 마친 화면(주문번호)은 경고 없이 이 시간 뒤 처음 화면으로 돌아간다. 실물도 영수증이 나오면 곧 처음 화면으로 돌아간다(【추론】 15초)
export const DONE_RESET_MS = 15_000;

// done: 결제를 마쳤다(이 화면 안 상태라 machine 화면 이름으로는 알 수 없다)
export function idlePhase(msSinceActivity: number, screen: string, done = false): IdlePhase {
  if (done) return msSinceActivity >= DONE_RESET_MS ? { kind: "reset" } : { kind: "active" };
  if (screen === "idle" || msSinceActivity < IDLE_WARN_MS) return { kind: "active" };
  const left = IDLE_WARN_MS + IDLE_COUNTDOWN_MS - msSinceActivity;
  return left <= 0 ? { kind: "reset" } : { kind: "warning", secondsLeft: Math.ceil(left / 1000) };
}
