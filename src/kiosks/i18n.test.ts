// 키오스크 화면 글자는 고른 언어로만 쓴다(실제 기기처럼). 세 키오스크의 화면을 넓이 우선으로 밟으며 그린 글에서
// ko 모드는 허용 목록 밖의 라틴 낱말이 0, en 모드는 한글이 0이어야 한다.
// 숫자가 섞인 조각(편명 BA701, 좌석 34A, 6-1B, 160Wh)은 코드라서 보지 않는다
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as A from "./airport/machine";
import { airlines, booking } from "./airport/booking";
import { AirportKiosk } from "./airport/ui/Kiosk";
import * as F from "./fastfood/machine";
import { FastfoodKiosk } from "./fastfood/ui/Kiosk";
import * as T from "./train/machine";
import { TrainKiosk } from "./train/ui/Kiosk";

type Ev = { by: string; target: string; value?: string };
const A_AIRLINES = airlines.map((a) => a.name.en);

// 보이는 글만(태그·속성 빼고). 원래 두 언어로 쓰는 곳(하드웨어 라벨, 언어 이름 버튼, 실제 화면의 영어 부제)은
// 화면에서 lang으로 다른 언어임을 표시한다. 그 낱(안에 태그가 없는 요소)은 이 언어의 글로 보지 않는다
const visible = (html: string, lang: string) =>
  html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, " ")
    .replace(/<(\w+)\b[^>]*\slang="([a-z-]+)"[^>]*>[^<]*<\/\1>/g, (all, _tag: string, l: string) => (l === lang ? all : " "))
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
const chunks = (text: string) => text.split(/[\s·,.:;!?()[\]{}"“”‘’/|→←+×–—…%₩#*~<>]+/).filter(Boolean);

// 언어를 바꾸는 버튼은 누르지 않는다(한 언어의 화면만 본다). 화면당 perScreen개 상태까지
function leaks<S extends { screen: string; lang: string }>(start: S, render: (s: S) => string, step: (s: S, e: Ev) => { ok: boolean; state?: S }, devices: Ev[], bad: (chunk: string) => boolean, perScreen = 40) {
  const seen = new Set<string>();
  const per: Record<string, number> = {};
  const found = new Map<string, Set<string>>();
  const q = [start];
  while (q.length) {
    const s = q.shift()!;
    const k = JSON.stringify(s);
    if (seen.has(k) || (per[s.screen] ?? 0) >= perScreen) continue;
    seen.add(k);
    per[s.screen] = (per[s.screen] ?? 0) + 1;
    const html = render(s);
    for (const c of chunks(visible(html, s.lang))) if (bad(c)) (found.get(c) ?? found.set(c, new Set()).get(c)!).add(s.screen);
    const evs: Ev[] = [...html.matchAll(/data-target="([^"]+)"(?: data-value="([^"]*)")?/g)].map((m) => (m[2] === undefined ? { by: "touch", target: m[1] } : { by: "touch", target: m[1], value: m[2] }));
    for (const e of [...evs, ...devices]) {
      if (e.target === "language") continue;
      const r = step(s, e);
      if (r.ok && r.state) q.push(r.state);
    }
  }
  return Object.fromEntries([...found].map(([c, w]) => [c, [...w].sort().join(",")]));
}

const latin = (allow: Set<string>) => (c: string) => /^[A-Za-z][A-Za-z'’-]*$/.test(c) && !allow.has(c);
const hangul = (c: string) => /[가-힣ㄱ-ㅎ]/.test(c);

const airport = (lang: "ko" | "en", bad: (c: string) => boolean) =>
  leaks(
    A.initialState(lang),
    (s) => renderToStaticMarkup(createElement(AirportKiosk, { state: s, press: () => {}, onDevice: () => {}, waitPassport: false })),
    (s, e) => A.step(s, e as A.KioskEvent) as never,
    [...booking.passengers.map((p) => ({ by: "device", target: "scan_passport", value: p.id })), { by: "device", target: "print_done" }],
    bad,
  );
const train = (lang: "ko" | "en", bad: (c: string) => boolean) =>
  leaks<T.KioskState>(
    T.initialState(lang),
    (s) => renderToStaticMarkup(createElement(TrainKiosk, { state: s, press: () => {}, onCard: () => {}, waitCard: false })),
    (s, e) => T.step(s, e as T.KioskEvent) as never,
    [
      { by: "device", target: "card_inserted" },
      { by: "device", target: "print_done" },
    ],
    bad,
  );
const fastfood = (lang: "ko" | "en", bad: (c: string) => boolean) =>
  leaks(
    F.initialState(lang),
    (s) => renderToStaticMarkup(createElement(FastfoodKiosk, { state: s, press: () => {}, pay: { no: null, onPay: () => {} } })),
    (s, e) => F.step(s, e as F.KioskEvent) as never,
    [],
    bad,
  );

// 번역하지 않는 것(낱말 단위). 숫자가 섞인 코드는 위에서 이미 뺐다
const words = (...xs: string[]) => xs.flatMap((x) => x.split(/\s+/));
const ALLOW = {
  airport: new Set([
    // 지어낸 항공사 로고 글자(대문자)와 여권 이름(로마자, MS 같은 호칭 포함)
    ...words(...A_AIRLINES).flatMap((w) => [w, w.toUpperCase()]),
    ...booking.passengers.flatMap((p) => [p.family, p.given, p.title]).flatMap((w) => [w, w[0] + w.slice(1).toLowerCase()]),
    // 공항·항공사 코드, 좌석 지도의 비상구 표지·유료 좌석 기호, 보조배터리 단위, 실제 화면(V-KE·V1)의 "Check n" 머리표와 "전자항공권(E-Ticket)" 괄호 표기
    ...words("ICN NRT BRG EXIT S V Wh mAh Check E-Ticket"),
  ]),
  // 지어낸 브랜드 로고 글자, 좌석 열 기호, QR 결제
  train: new Set(words("Bridge Rail A D QR")),
  // 지어낸 브랜드 로고 글자, NEW 표지, 사이즈 기호 L, 열량 단위
  fastfood: new Set(words("Bridge Burger NEW L kcal")),
};

describe("키오스크 화면 언어", () => {
  it("공항: ko 모드에 허용 밖 라틴 낱말 0, en 모드에 한글 0", () => {
    expect(airport("ko", latin(ALLOW.airport))).toEqual({});
    expect(airport("en", hangul)).toEqual({});
  });
  it("기차: ko 모드에 허용 밖 라틴 낱말 0, en 모드에 한글 0", () => {
    expect(train("ko", latin(ALLOW.train))).toEqual({});
    expect(train("en", hangul)).toEqual({});
  });
  it("패스트푸드: ko 모드에 허용 밖 라틴 낱말 0, en 모드에 한글 0", () => {
    expect(fastfood("ko", latin(ALLOW.fastfood))).toEqual({});
    expect(fastfood("en", hangul)).toEqual({});
  });
});
