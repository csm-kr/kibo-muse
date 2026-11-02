import { FastfoodStation } from "@/kiosks/fastfood/ui/Station";
import { KiboSide } from "./KiboSide";

export const metadata = { title: "Touch vs KIBO · Bridge Burger" };

// 결정적 장면 1: 왼쪽은 터치, 가운데는 KIBO가 넘기는 키오스크, 오른쪽은 사람이 한 문장을 말하는 휴대폰
export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center gap-8 bg-neutral-200 p-4">
      {/* 터치 쪽은 어떤 room에도 연결하지 않는다 */}
      <FastfoodStation variant="compare" room={null} title="Touch" />
      <KiboSide />
    </main>
  );
}
