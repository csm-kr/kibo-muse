import { ShowAirport } from "./ShowAirport";

export const metadata = { title: "KIBO · Bridge Air check-in" };

// 영상용 공항 장면: 왼쪽 키오스크(위에 KIBO 띠), 오른쪽 사람이 말하는 휴대폰. /compare처럼 둘을 점선으로 잇는다
export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center gap-2 bg-neutral-200 p-3">
      <ShowAirport />
    </main>
  );
}
