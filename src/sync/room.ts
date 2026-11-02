// 휴대폰과 키오스크를 짝짓는 room. 키오스크 화면에 room이 없으면 추측할 수 없는 코드를 만들어 주소에 붙이고,
// 단독 화면(?view=kiosk)은 대기 화면 구석에 QR(/phone?room=…)을 띄운다. 공용 기본 room은 없다.
import { useEffect, useSyncExternalStore } from "react";

// 16바이트 난수를 base64url(22자)로. room을 아는 사람은 그 키오스크에 말하고 카드를 엿들을 수 있으므로 추측할 수 없어야 한다
export function newRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const pairUrl = (origin: string, room: string) => `${origin}/phone?room=${encodeURIComponent(room)}`;

// 이 탭에서 한 번 만든 코드. 새로고침하면 주소에 붙은 코드를 그대로 읽는다
let generated: string | null = null;
const noop = () => () => {};

function clientRoom() {
  const r = new URLSearchParams(location.search).get("room");
  if (r) return r;
  generated ??= newRoomCode();
  return generated;
}

// given: 이미 정한 room(나란히 비교·영상 화면이 키오스크와 내장 휴대폰에 같은 값을 넘긴다). null이면 어디에도 연결하지 않는 화면.
// undefined면 주소의 room, 없으면 새로 만든다. 서버 렌더와 첫 하이드레이션에서는 null
export function useRoom(given: string | null | undefined) {
  const room = useSyncExternalStore(
    noop,
    () => (given === undefined ? clientRoom() : given),
    () => given ?? null,
  );
  useEffect(() => {
    if (!room || given !== undefined) return;
    const url = new URL(location.href);
    if (url.searchParams.get("room") === room) return;
    url.searchParams.set("room", room);
    history.replaceState(history.state, "", url);
  }, [room, given]);
  return room;
}
