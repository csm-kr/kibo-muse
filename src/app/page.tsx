export const metadata = { title: "KIBO" };

// 첫 화면: 한 줄 소개, 데모 링크, 공식 제품이 아니라는 고지. 키오스크 이름은 모두 지어낸 것이다
const demos = [
  { href: "/compare", name: "Touch vs KIBO", note: "Side by side, with live counters for screens, taps and time" },
  { href: "/kiosk/fastfood", name: "Bridge Burger", note: "Fast-food kiosk (fictional)" },
  { href: "/kiosk/airport", name: "Bridge Air", note: "Self check-in kiosk (fictional)" },
  { href: "/kiosk/train", name: "Bridge Rail", note: "Reserved-ticket machine (fictional)" },
  { href: "/phone", name: "Guide mode", note: "Any kiosk: take a photo, ask, and see which button to press" },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">KIBO</h1>
      <p className="text-lg leading-7">
        Say one sentence on your phone. KIBO works the kiosk&apos;s own screens for you, one visible tap at a time, and stops wherever a person must act.
      </p>
      <ul className="flex flex-col gap-3">
        {demos.map((d) => (
          <li key={d.href}>
            <a href={d.href} className="block rounded-xl border border-neutral-300 px-4 py-3 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">
              <span className="font-semibold">{d.name}</span>
              <span className="ml-2 font-mono text-sm text-neutral-500">{d.href}</span>
              <span className="block text-sm text-neutral-600 dark:text-neutral-400">{d.note}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-400">
        <strong>Not an official Meta product.</strong> KIBO is an independent hackathon entry that uses Meta models through the Meta Model API. It is not built, endorsed or reviewed by Meta.
      </p>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">Source: ⟦REPO⟧</p>
    </main>
  );
}
