import { FastfoodStation } from "@/kiosks/fastfood/ui/Station";

export const metadata = { title: "Touch vs KIBO · Bridge Burger" };

// 결정적 장면 1: 왼쪽은 터치, 오른쪽은 휴대폰(/phone?room=compare-kibo)으로 한 문장
export default function Page() {
  return (
    <main className="flex min-h-screen items-start justify-center gap-10 bg-neutral-200 p-4">
      <FastfoodStation variant="compare" room="compare-touch" title="Touch" />
      <FastfoodStation variant="compare" room="compare-kibo" title="KIBO · one sentence" />
    </main>
  );
}
