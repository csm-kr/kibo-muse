import { AirportStation } from "@/kiosks/airport/ui/Station";

export const metadata = { title: "Bridge Air check-in kiosk · KIBO" };

// ?view=kiosk 이면 개발 콘솔 없이 키오스크만 보인다(Station이 브라우저에서 읽는다).
// 서버에서 searchParams를 Suspense로 읽으면 숨은 탭에서 경계가 열리지 않아 하이드레이션이 멈춘다
export default function Page() {
  return <AirportStation />;
}
