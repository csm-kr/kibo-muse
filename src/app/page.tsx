import { numbers } from "./film/numbers";

export const metadata = { title: "KIBO" };

// 첫 화면: 한 줄 소개, 데모 링크, 공식 제품이 아니라는 고지. 키오스크 이름은 모두 지어낸 것이다
// 키오스크 링크는 개발 콘솔이 아니라 키오스크만 보이는 화면(?view=kiosk)으로 보낸다. 대기 화면에 짝짓기 QR이 크게 보이고 태블릿 폭에도 들어간다
const demos = [
  { href: "/compare", name: "Touch vs KIBO", note: "Side by side, with live counters for screens, taps and time", start: true },
  { href: "/kiosk/fastfood?view=kiosk", name: "Bridge Burger", note: "Fast-food kiosk (fictional)" },
  { href: "/kiosk/airport?view=kiosk", name: "Bridge Air", note: "Self check-in kiosk (fictional)" },
  { href: "/kiosk/train?view=kiosk", name: "Bridge Rail", note: "Reserved-ticket machine (fictional)" },
  { href: "/phone", name: "Guide mode", note: "Any kiosk: take a photo, ask, and see which button to press" },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">KIBO</h1>
      <p className="text-lg leading-7">
        Say one sentence on your phone. KIBO works the kiosk&apos;s own screens for you, one visible tap at a time, and stops wherever a person must act.
      </p>
      {/* 시험 방법. 예문은 각 키오스크 데이터(메뉴·항공사·역)에 있는 이름만 쓴다 */}
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">How to try</h2>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 leading-7">
          <li>Open a kiosk below on a PC or tablet. A QR code shows above it.</li>
          <li>Scan the QR code with your phone&apos;s camera. Your phone is now paired with that kiosk.</li>
          <li>On the phone, tap the mic once and say one sentence. It sends by itself after 1.5 seconds of silence.</li>
          <li>Watch the kiosk tap through its own screens. It stops before payment, consent or a passport scan; you do that step yourself.</li>
        </ol>
        <p className="leading-7">Try saying:</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 leading-7">
          <li>Bridge Burger: &ldquo;A large double cheeseburger meal with a Cola, for here. That&apos;s all.&rdquo;</li>
          <li>Bridge Air: &ldquo;Bridge Air to Tokyo, me and my mom. We&apos;re checking one bag.&rdquo;</li>
          <li>Bridge Rail: &ldquo;Two adults to Harborlight tomorrow around 9 am.&rdquo;</li>
        </ul>
      </section>
      {/* 휴대폰이 없는 사람(노트북으로 보는 심사위원)도 바로 해 볼 수 있게: 나란히 비교의 휴대폰 칸에 글로 친다 */}
      <p className="leading-7">
        <strong>No phone needed.</strong> Start with Touch vs KIBO and type a sentence into the phone panel on the right.
      </p>
      <ul className="flex flex-col gap-3">
        {demos.map((d) => (
          <li key={d.href}>
            <a href={d.href} className="block rounded-xl border border-neutral-300 px-4 py-3 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">
              <span className="font-semibold">{d.name}</span>
              {d.start && <span className="ml-2 rounded-full bg-teal-700 px-2 py-0.5 text-xs font-bold text-white">Start here</span>}
              <span className="ml-2 font-mono text-sm text-neutral-500">{d.href}</span>
              <span className="block text-sm text-neutral-600 dark:text-neutral-400">{d.note}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-400">
        <strong>Not an official Meta product.</strong> KIBO is an independent hackathon entry that uses Meta models through the Meta Model API. It is not built, endorsed or reviewed by Meta.
      </p>
      {/* 저장소 주소는 영상 끝 카드와 같은 곳(film/numbers.ts REPO)에서 읽는다. 아직 정하지 않았으면(null) 줄을 그리지 않는다 */}
      {typeof numbers.REPO === "string" && numbers.REPO && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Source: <a href={numbers.REPO} className="underline">{numbers.REPO}</a>
        </p>
      )}
    </main>
  );
}
