import { FastfoodStation } from "@/kiosks/fastfood/ui/Station";
import { KiboSide } from "./KiboSide";

export const metadata = { title: "Touch vs KIBO · Bridge Burger" };

// 결정적 장면 1: 왼쪽은 터치, 가운데는 KIBO가 넘기는 키오스크, 오른쪽은 사람이 한 문장을 말하는 휴대폰
// 좁은 화면(휴대폰으로 연 심사위원, 1024 노트북 포함)에서는 세로로 쌓는다. xl(1280) 이상(영상 1920)은 가로 그대로
export default function Page() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-8 bg-neutral-200 p-4 xl:flex-row xl:justify-center">
      {/* 키오스크가 둘이라 각 키오스크가 아니라 페이지가 h1을 하나 갖는다(양쪽 제목은 h2) */}
      <h1 className="sr-only">Touch vs KIBO · Bridge Burger</h1>
      {/* 터치 쪽은 어떤 room에도 연결하지 않는다 */}
      <FastfoodStation variant="compare" room={null} title="Touch" />
      <KiboSide />
    </main>
  );
}
