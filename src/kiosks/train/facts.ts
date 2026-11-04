// Spark가 질문(몇 시에 있어요·얼마예요·어디 갈 수 있어요)에 답할 수 있게 주는 가상 철도 사실. rail.ts 자료에서 만든다.
// 역 이름은 {id}로 쓰게 하고 서버가 대답 언어의 정확한 이름으로 채운다(Spark는 역 이름을 틀리게 쓸 수 있다. 실측 '버들둱')

import { langOf } from "@/engine/turn";
import { DAYS_AHEAD, FIRST_HOUR, HOME_STATION, LAST_HOUR, MAX_PASSENGERS, findStation, hhmm, legs, stations } from "./rail";
import { payMethods } from "./ui/strings";

const won = (n: number | null) => `₩${(n ?? 0).toLocaleString("en-US")}`;

export function railFacts(): string {
  const rows = stations
    .filter((s) => s.id !== HOME_STATION)
    .map((s) => {
      const ls = legs(HOME_STATION, s.id);
      const ex = ls.filter((l) => l.train.type === "express");
      const lo = ls.filter((l) => l.train.type === "local");
      const lines = [...new Set(ls.map((l) => l.train.line))].join("/");
      const e = ex[0];
      const local = lo.length ? `; local ${lo[0].arr - lo[0].dep} min, ${won(lo[0].fare.general)}, leaves ${lo.map((l) => hhmm(l.dep)).join(", ")}` : "";
      return `{${s.id}} (${lines} line): express ${e.arr - e.dep} min, ${won(e.fare.general)} standard / ${won(e.fare.first)} first class${local}`;
    });
  const ex = legs(HOME_STATION, stations[1].id).filter((l) => l.train.type === "express");
  return [
    `From {${HOME_STATION}} (this machine) express trains run on every line every 30 minutes, first ${hhmm(ex[0].dep)}, last ${hhmm(ex[ex.length - 1].dep)}. Trains also run between other stations on the same line; there are no direct trains between different lines.`,
    ...rows,
    "Fares above are for one adult. Child 50% off, senior 30% off. First class only on express trains (cars 1–2); standard cars 3–8; local trains are standard only.",
    `Booking: today to ${DAYS_AHEAD - 1} days ahead, ${FIRST_HOUR}:00–${LAST_HOUR}:00, up to ${MAX_PASSENGERS} people. Seats: window, aisle or together, from the free seats.`,
    `Payment (the traveler pays on the screen; KIBO never pays): ${payMethods.map((m) => m.name.en).join(", ")}; no cash at this machine (ask at the ticket window).`,
    "Korean words on the screen (use them in Korean replies): express = 고속, local = 완행, first class = 특실, standard = 일반실.",
  ].join("\n");
}

// {id}를 대답 언어의 역 이름으로 채운다(한국어는 한국어 이름, 그 밖의 언어는 화면의 영어 이름). 모르는 {id}가 남으면 null
export function fillStations(say: string, language: string): string | null {
  const ko = langOf(language) === "ko";
  let bad = false;
  const out = say.replace(/\{([a-z]+)\}/g, (_, id: string) => {
    const s = findStation(id);
    if (!s) bad = true;
    return s ? (ko ? s.name.ko : s.name.en) : "";
  });
  return bad || /[{}]/.test(out) ? null : ko ? fixParticles(out) : out;
}

// 한국어 조사를 앞 역 이름의 받침에 맞춘다(Spark는 {id}만 보고 조사를 고른다. 실측 '단풍언덕로'). ㄹ 받침은 '로'
const PAIRS: [string, string][] = [["으로", "로"], ["이에요", "예요"], ["이나", "나"], ["이랑", "랑"], ["이", "가"], ["은", "는"], ["을", "를"], ["과", "와"]];
// 한 글자 조사 이·가·나는 뒤에 한글이 이어지면 조사가 아니다('산호만가는'의 가)
const ALT = PAIRS.flat().sort((a, b) => b.length - a.length).map((x) => (["이", "가", "나"].includes(x) ? `${x}(?![가-힣])` : x)).join("|");
function fixParticles(s: string) {
  return stations.reduce((acc, st) => {
    const last = st.name.ko.charCodeAt(st.name.ko.length - 1) - 0xac00;
    const tail = last % 28;
    return acc.replace(new RegExp(`${st.name.ko}(${ALT})`, "g"), (_, p: string) => {
      const [withB, noB] = PAIRS.find((x) => x.includes(p))!;
      const pick = withB === "으로" ? (tail === 0 || tail === 8 ? noB : withB) : tail === 0 ? noB : withB;
      return st.name.ko + pick;
    });
  }, s);
}

const diff = (a: string, b: string) => {
  // 같은 길이면 다른 글자 수, 길이가 하나 다르면 한 글자 넣고 빼서 같은지(Harbourlight)
  if (a.length === b.length) return [...a].filter((c, i) => c !== b[i]).length;
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  if (l.length - s.length !== 1) return 99;
  for (let i = 0; i < l.length; i++) if (l.slice(0, i) + l.slice(i + 1) === s) return 1;
  return 99;
};

// 역 이름을 한 글자 틀리게 쓴 문장. 한국어는 세 글자 넘는 이름만 본다(두 글자 이름은 '서울'·'서풍'처럼 흔한 말과 한 글자 차이)
export function misspelledStation(say: string): boolean {
  const ko = say.split(/[^\p{Script=Hangul}]+/u).filter(Boolean);
  const en = say.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return stations.some((s) => {
    const k = s.name.ko;
    if (k.length >= 3 && ko.some((w) => w.length >= k.length && diff(w.slice(0, k.length), k) === 1)) return true;
    const parts = s.name.en.toLowerCase().split(" ");
    for (let i = 0; i + parts.length <= en.length; i++) {
      const w = en.slice(i, i + parts.length).join(" ");
      if (w.length >= 6 && diff(w, parts.join(" ")) === 1) return true;
    }
    return false;
  });
}
