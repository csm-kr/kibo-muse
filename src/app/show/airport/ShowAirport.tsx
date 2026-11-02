"use client";

// 공항 영상 화면: 키오스크·내장 휴대폰·말풍선이 같은 room을 쓴다(새로 만들어 주소에 붙인다).
// Supabase 키가 있으면 키오스크 대기 화면의 QR로 실제 휴대폰도 이 room에 붙는다(?qr=0이면 QR 숨김)
import { PhoneSide } from "@/app/compare/PhoneSide";
import { AirportStation } from "@/kiosks/airport/ui/Station";
import { useRoom } from "@/sync/room";

export function ShowAirport() {
  const room = useRoom(undefined);
  if (!room) return null;
  return (
    <>
      <AirportStation variant="show" room={room} />
      <PhoneSide room={room} />
    </>
  );
}
