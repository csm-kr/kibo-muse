// 누르고 말하기(push-to-talk)의 시간 규칙. 누르는 동안 녹음하고, 떼면 보낸다
// 이보다 짧게 누르면(실수로 톡 친 것) 보내지 않고 '누른 채로 말해 주세요'를 보인다
export const MIN_HOLD_MS = 400;
// 뗀 뒤 조금 더 녹음한다. 말끝이 잘리지 않게
export const TAIL_MS = 250;

export const releaseAction = (heldMs: number): "too_short" | "send" => (heldMs < MIN_HOLD_MS ? "too_short" : "send");
