"use client";

// 나란히 비교의 KIBO 쪽: 키오스크·내장 휴대폰·말풍선이 같은 room을 쓴다. room은 추측할 수 없게 새로 만들어 주소에 붙인다
// (새로고침해도 같은 room). Supabase 키가 있으면 키오스크 대기 화면의 QR로 실제 휴대폰도 이 room에 붙는다.
import { FastfoodStation } from "@/kiosks/fastfood/ui/Station";
import { useRoom } from "@/sync/room";
import { PhoneSide } from "./PhoneSide";

export function KiboSide() {
  const room = useRoom(undefined);
  if (!room) return null;
  return (
    // 좁은 화면에서는 키오스크 아래에 휴대폰을 쌓는다(폭은 화면에 맞춤). xl(1280) 이상은 가로 그대로
    <div className="flex flex-col items-center gap-8 max-xl:w-full xl:flex-row xl:gap-0">
      <FastfoodStation variant="compare" room={room} title="KIBO · one sentence" />
      <PhoneSide room={room} />
    </div>
  );
}
