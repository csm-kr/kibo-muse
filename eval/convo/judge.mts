// KIBO 대답 채점기. 자동 검사 (a)–(f)는 자료 파일(src/kiosks/*)에서 계산하고, 루브릭 판정(사람/모델 판단)은 rubric 파일에서 합친다.
// 실행(저장소에서, @/ 경로 별칭 때문): npx tsx eval/convo/judge.mts <kiosk> <scen.json> <results.json> [--rubric r.json] [--sheet] [--json out.json]
//  --sheet: 루브릭 판정용 블라인드 시트(코드 판본·시간 없음)를 찍는다
import fs from "node:fs";
import { planSay, rejectSay } from "../../src/engine/turn";
import * as menu from "../../src/kiosks/fastfood/menu";
import * as bk from "../../src/kiosks/airport/booking";
import * as rail from "../../src/kiosks/train/rail";
import { misspelledStation } from "../../src/kiosks/train/facts";
import { clarifySay as trainClarify } from "../../src/kiosks/train/gates";
import { clarifySay as airClarify } from "../../src/kiosks/airport/gates";

const args = process.argv.slice(2);
const [kiosk, scenFile, resFile] = args;
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const scen: Record<string, Turn[]> = JSON.parse(fs.readFileSync(scenFile, "utf8"));
const res: Record<string, Row[]> = JSON.parse(fs.readFileSync(resFile, "utf8"));
const rubric: Record<string, [string, string, string?]> = opt("--rubric") && fs.existsSync(opt("--rubric")!) ? JSON.parse(fs.readFileSync(opt("--rubric")!, "utf8")) : {};

interface Turn { u: string; act?: string; expect?: string; must?: string[]; intent?: string[]; intentNot?: string[]; notAvail?: string[]; q?: boolean }
interface Row { u: string; say: string; intent: string; plan: string; timing: string; screen: string; stale?: boolean; api?: { intent?: unknown } | null }

const LANGS = ["en", "ko", "ja", "vi", "zh", "es"];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NEG = /없|않|안 |아니|못|불가|어려|모르|no\b|not\b|n't|nothing|unfortunately|unable|isn’t|ません|ない|không|chưa/i;
const ss0 = (s: string) => sentences(s);
const sentences = (s: string) => s.split(/(?<=[.!?。？！])\s*/).map((x) => x.trim()).filter((x) => x.replace(/[\s\p{P}]/gu, "").length > 0);

// ---------- 언어
const VI = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
function langOfText(s: string) {
  const t = s.replace(/\[[^\]]*\]|「[^」]*」|“[^”]*”|"[^"]*"/g, " ");
  if (/[぀-ヿ]/.test(t)) return "ja";
  if (/[가-힣]/.test(t)) return "ko";
  if (VI.test(t)) return "vi";
  if (/[一-鿿]/.test(t)) return "zh";
  return "en";
}

// ---------- 고정 문구(템플릿) 정규식
const REASONS = ["reject", "failed", "chat", "payment_in_progress", "bad_qty", "unsupported", "cancel_order", "train_unsupported", "train_discount", "same_station", "bad_day", "bad_hour", "no_trains_available", "train_exit", "unknown_station", "past_time", "bad_passengers", "exit", "bad_bags", "__default__"];
const tmplStrings = new Set<string>();
for (const l of LANGS) {
  for (const r of REASONS) tmplStrings.add(rejectSay(r, l, { b: "\u0001", now: "\u0002" }));
  tmplStrings.add(planSay(0, l));
  tmplStrings.add(planSay(7, l).replace("7", "\u0003"));
  for (const what of ["dangerous_goods", "confirm_checkin", "later_train"]) tmplStrings.add(planSay(0, l, { what, button: "\u0001" }));
  const sub = <T,>(xs: T[]) => xs.reduce<T[][]>((a, x) => a.concat(a.map((s) => [...s, x])), [[]]).filter((s) => s.length);
  for (const m of sub(["to", "date", "passengers"])) for (const known of [{}, { day: 1 }]) { try { tmplStrings.add(trainClarify(m as never, l, known)); } catch {} }
  for (const m of sub(["airline", "travelers", "bags"])) for (const a of [{}, { airline: "bridge_air" }]) { try { tmplStrings.add(airClarify(m as never, a, l)); } catch {} }
}
const toRe = (s: string) => esc(s).replace(/\u0001/g, ".{1,24}").replace(/\u0002/g, "\\d{1,2}:\\d{2}").replace(/\u0003/g, "\\d+");
// 문장 단위로도 넣는다(템플릿 문장 둘을 이은 대답)
const tmplParts = [...tmplStrings].flatMap((s) => [s, ...sentences(s)]).filter((s) => s.length >= 4).sort((a, b) => b.length - a.length);
const tmplRes = tmplParts.map((s) => new RegExp(toRe(s), "g"));
// 패스트푸드 되묻기 고정 문구(clarify.ts text 표)
const ffAsk = [/매장에서 드시나요, 포장하시나요\?/g, /세트로 할까요, 단품으로 할까요\?/g, /사이즈는 M, L 중 무엇으로 할까요\?/g, /음료는 무엇으로 할까요\?/g, /[^.?!]* 담을게요\./g, /Eat in or take out\?/g, /Meal or single\?/g, /Which size, M or L\?/g, /Which drink would you like\?/g, /I'll add [^.]*\./g];
function bareTemplate(say: string) {
  let s = say;
  for (const re of [...tmplRes, ...ffAsk]) s = s.replace(re, " ");
  return s.replace(/[\s\p{P}\p{S}]/gu, "").length <= 3;
}

// ---------- 자료에서 만든 허용 값
const k100 = (n: number) => Math.round(n / 100) * 100;
type Named = { names: string[]; prices: Set<number> };
const named: Named[] = [];
const globalPrices = new Set<number>();
const validTimes = new Set<string>();
const validDur = new Set<number>();
let badNames: RegExp[] = [];
const multiples = (xs: number[], kmax = 10) => xs.flatMap((x) => Array.from({ length: kmax }, (_, i) => x * (i + 1)));

if (kiosk === "fastfood") {
  const base: number[] = [];
  for (const b of menu.burgers) { const ps = [b.price, b.setPrice.M, b.setPrice.L]; base.push(...ps); named.push({ names: [b.name.ko, b.name.en, b.name.ko.replace(/ ?버거$/, "")], prices: new Set(multiples(ps)) }); }
  for (const i of menu.simpleItems) { const ps = [i.price, ...(i.setUpcharge ? [i.setUpcharge] : [])]; base.push(...ps); named.push({ names: [i.name.ko, i.name.en], prices: new Set(multiples(ps)) }); }
  // 짧은 별칭(치즈·패티)이 다른 이름(더블 치즈버거) 안에 들어 있으면 쓰지 않는다
  const itemNames = [...menu.burgers, ...menu.simpleItems].flatMap((i) => [i.name.ko, i.name.en]);
  for (const a of menu.addOns) { base.push(a.price); const alias = a.name.ko.replace(/ 추가$/, ""); named.push({ names: [a.name.ko, a.name.en, ...(itemNames.some((n) => n.includes(alias)) ? [] : [alias])], prices: new Set(multiples([a.price])) }); }
  const m = multiples(base);
  for (const x of m) for (const y of base) globalPrices.add(x + y);
  m.forEach((x) => globalPrices.add(x));
  badNames = [/빅맥|와퍼|맥너겟|맥플러리|스프라이트|사이다|밀크티|데리야?끼|てりやき|whopper|big mac|sprite|milk ?tea|teriyaki|치즈볼|핫도그|라지 ?감자|감자튀김 ?(라지|큰)|콜라 ?(라지|큰)|(라지|큰) ?콜라|large (fries|cola|coke)/i];
} else if (kiosk === "airport") {
  multiples([bk.EXCESS_FEE], 18).forEach((x) => globalPrices.add(x));
  ["09:40", "12:05", "09:00", "9:40", "9:00"].forEach((t) => validTimes.add(t));
  badNames = [/대한항공|아시아나|진에어|제주항공|티웨이|에어부산|이스타|korean air|asiana|jeju air|jin air|\bJAL\b|\bANA\b|오사카|후쿠오카|osaka/i];
} else {
  const ids = rail.stations.map((s) => s.id);
  const pax: rail.Pax[] = [];
  for (let a = 0; a <= 9; a++) for (let c = 0; a + c <= 9; c++) for (let s = 0; a + c + s <= 9; s++) if (a + c + s) pax.push({ adult: a, child: c, senior: s });
  const per: Record<string, Set<number>> = {};
  for (const f of ids) for (const t of ids) {
    if (f === t) continue;
    for (const l of rail.legs(f, t)) {
      validTimes.add(rail.hhmm(l.dep)); validTimes.add(rail.hhmm(l.arr));
      validDur.add(l.arr - l.dep);
      for (const fare of [l.fare.general, l.fare.first]) if (fare) for (const p of pax) { const v = rail.fareFor(fare, p); globalPrices.add(v); (per[t] ??= new Set()).add(v); }
    }
  }
  for (const s of rail.stations) if (per[s.id]) named.push({ names: [s.name.ko, s.name.en], prices: per[s.id] });
  for (let h = rail.FIRST_HOUR; h <= rail.LAST_HOUR; h++) validTimes.add(`${String(h).padStart(2, "0")}:00`);
  validDur.add(30);
  badNames = [/부산|서울역|서울|강릉|대전|동대구|대구|광주|목포|여수|전주|수원|용산|천안|울산|경주|춘천|KTX|SRT|ITX|무궁화|새마을|busan|seoul|gangneung|daejeon/i];
}

// 대답에서 값 뽑기
const nums = (s: string) => Number(s.replace(/,/g, ""));
function prices(say: string) {
  const out: { v: number; at: number }[] = [];
  for (const m of say.matchAll(/₩\s?([\d,]{3,})|([\d,]{3,})\s?(?:원|won\b|ウォン|đồng|KRW)/gi)) out.push({ v: nums(m[1] ?? m[2]), at: m.index! });
  for (const m of say.matchAll(/(\d+)만\s?(\d{1,4})?\s?천?\s?원/g)) out.push({ v: Number(m[1]) * 10000 + (m[2] ? Number(m[2]) * (m[0].includes("천") ? 1000 : 1) : 0), at: m.index! });
  return out;
}
function nearestName(say: string, at: number) {
  let best: Named | null = null, bestAt = -1;
  for (const n of named) for (const nm of n.names) {
    if (!nm) continue;
    const i = say.toLowerCase().lastIndexOf(nm.toLowerCase(), at);
    // 이름 끝과 값 사이가 12자 이내일 때만 그 상품의 값으로 본다(“감자튀김과 음료가 포함되고, M은 6,000원”은 세트 값)
    if (i >= 0 && at - (i + nm.length) <= 12 && i > bestAt) { best = n; bestAt = i; }
  }
  return best;
}

interface Result { key: string; id: string; i: number; u: string; act: string; expect: string; say: string; lang: string; plan: string; intent: string; taps: number; fails: Record<string, string>; ms: number | null; stale: boolean }
const results: Result[] = [];

for (const [id, turns] of Object.entries(scen)) {
  const rows = res[id] ?? [];
  let prevSay = "";
  const userTimes = new Set<string>();
  turns.forEach((t, i) => {
    const r = rows[i];
    if (t.u.startsWith("@") || !r) return;
    for (const m of t.u.matchAll(/(\d{1,2}):(\d{2})/g)) userTimes.add(`${m[1].padStart(2, "0")}:${m[2]}`);
    if (!r.intent && r.api?.intent) r.intent = `intent: ${JSON.stringify(r.api.intent)}`;
    const m = r.say.match(/^say \(([^)]*)\):\s?(.*)$/);
    const say = m ? m[2] : "";
    const plan = r.plan.replace(/^plan:\s*/, "");
    const taps = Number((plan.match(/(\d+) taps/) ?? [])[1] ?? 0);
    const ms = Number((r.timing.match(/Spark (\d+) ms/) ?? [])[1] ?? NaN);
    const fails: Record<string, string> = {};
    const act = t.act ?? "followup";
    const stale = !!r.stale;
    if (!stale && say) {
      // (a) 묻는 사실이 대답에 있는가
      for (const re of t.must ?? []) if (!new RegExp(re, "i").test(say)) fails.a = `missing /${re}/`;
      // (b) 값이 자료와 맞는가
      const bad: string[] = [];
      for (const p of prices(say)) {
        const n = nearestName(say, p.at);
        if (n ? !n.prices.has(p.v) : !globalPrices.has(p.v)) bad.push(`₩${p.v}${n ? `@${n.names[0]}` : ""}`);
      }
      for (const tm of say.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) {
        const hm = `${tm[1].padStart(2, "0")}:${tm[2]}`;
        if (!validTimes.has(hm) && !validTimes.has(`${tm[1]}:${tm[2]}`) && !userTimes.has(hm) && hm !== "13:00") bad.push(hm);
      }
      if (kiosk === "train") {
        for (const d of say.matchAll(/(\d+)\s*시간\s*(\d+)\s*분|(\d+)\s*(?:분|min(?:utes)?)\b(?!\s*마다|\s*간격)/g)) {
          const v = d[1] ? Number(d[1]) * 60 + Number(d[2]) : Number(d[3]);
          if (!validDur.has(v) && v !== 30 && v > 5) bad.push(`${v}min`);
        }
        if (misspelledStation(say)) bad.push("misspelled station");
        if (/[{}]/.test(say)) bad.push("raw {id}");
      }
      if (kiosk === "airport") {
        for (const f of say.matchAll(/\b([A-Z]{2,3})\s?(\d{2,4})\b/g)) if (`${f[1]} ${f[2]}` !== "BRG 701" && !/^(ICN|NRT)$/.test(f[1])) bad.push(`flight ${f[0]}`);
        for (const g of say.matchAll(/(\d+)\s*번?\s*(?:탑승구|게이트)|gate\s*(\d+)|(\d+)\s*番/gi)) if ((g[1] ?? g[2] ?? g[3]) !== "23") bad.push(`gate ${g[0]}`);
        for (const s of say.matchAll(/\b(\d{2}[A-K])\b/g)) if (!bk.isRealSeat(s[1])) bad.push(`seat ${s[1]}`);
      }
      // 없는 이름을 있는 것처럼(부정어 없는 문장에서)
      for (const sen of sentences(say)) for (const re of [...badNames, ...(t.notAvail ?? []).map((x) => new RegExp(esc(x), "i"))]) {
        const hit = sen.match(re);
        if (hit && !NEG.test(sen) && !/대신|말고|instead|代わり|thay vì|카운터|창구|counter|カウンター|quầy/i.test(sen)) bad.push(`claims "${hit[0]}"`);
      }
      if (bad.length) fails.b = [...new Set(bad)].join(", ");
      // (c) 누른 것이 없는데 했다고 말하나 / 결제했다고 말하나
      const CLAIM = /(예약했|예매했|예약(이|을) (완료|마쳤)|주문했|주문(이|을) (완료|마쳤)|담았|추가했|눌렀|바꿨|바꿔 ?드렸|변경했|변경(이|을) (완료|마쳤)|체크인(을|이)? ?(했|완료|마쳤|됐)|발권했|취소했|booked|ordered|I(?:'ve| have)? added|added (it|your|the)|I(?:'ve| have)? changed|changed (it|your|the)|checked you in|cancell?ed|予約しました|注文しました|追加しました|変更しました|đã đặt|đã thêm|đã đổi)/i;
      const PAID = /(결제했|결제(가|를) ?(완료|마쳤|끝냈|했)|결제해 ?드렸|\bpaid\b|payment (is )?(complete|done)|支払いました|お支払いが完了|đã thanh toán)/i;
      for (const sen of sentences(say)) {
        if (PAID.test(sen) && !NEG.test(sen)) fails.c = `payment claim: "${sen}"`;
        else if (taps === 0 && CLAIM.test(sen) && !NEG.test(sen)) fails.c = `action claim w/o taps: "${sen}"`;
      }
      // (d) 대답 언어 = 말한 언어
      const ul = langOfText(t.u), sl = langOfText(say);
      if (ul !== sl) fails.d = `utterance ${ul} → reply ${sl}`;
      // (e) 같은 말 되풀이 / 질문에 고정 문구만
      if (say === prevSay) fails.e = "same say as previous turn";
      const q = t.q ?? (["fact", "offtopic", "vague"].includes(act) || (/[?？]/.test(t.u) && !["full", "payment", "correction", "followup"].includes(act)));
      if (q && bareTemplate(say)) fails.e = (fails.e ? fails.e + "; " : "") + "bare fixed template answering a question";
      // 되묻기만 되풀이(질문에 답 없이 '…을 알려 주세요'만)
      else if (q && ss0(say).every((x) => /(알려\s?주세요|말씀해\s?주세요|tell me\b.*|let me know\b.*|教えてください|お知らせください|cho tôi biết.*)[.!。]?$/i.test(x))) fails.e = (fails.e ? fails.e + "; " : "") + "only asks for slots, question unanswered";
      const SLOT = /항공사|인원|몇 분|몇 명|짐|수하물|가방|어디로|언제|몇 시|매장|포장|airline|travel+ers|bags|where|what day|what time|how many|eat in|take out|航空会社|人数|荷物|何名|どちら/i;
      if (q && !fails.e && ss0(say).every((x) => SLOT.test(x) && /[?？]$|주세요\.?$|ください。?$/.test(x))) fails.e = "only asks for slots, question unanswered";
      // (f) 짧은 문장 3개 이하
      const ss = sentences(say);
      const lim = ["ko", "ja", "zh"].includes(sl) ? 90 : 170;
      if (ss.length > 3 || ss.some((x) => x.length > lim)) fails.f = `${ss.length} sentences, longest ${Math.max(...ss.map((x) => x.length))}`;
      // (i) 의도 칸(보조, 루브릭 참고용)
      if (r.intent) for (const re of t.intent ?? []) if (!new RegExp(re).test(r.intent)) fails.i = `intent missing /${re}/`;
      for (const re of t.intentNot ?? []) if (new RegExp(re).test(r.intent)) fails.i = `intent has /${re}/`;
      prevSay = say;
    } else fails.x = stale ? "no new reply (stale)" : "no say";
    results.push({ key: `${id}#${i}`, id, i, u: t.u, act, expect: t.expect ?? "", say, lang: m?.[1] ?? "", plan, intent: r.intent.replace(/^intent:\s*/, ""), taps, fails, ms: Number.isFinite(ms) && !stale && ms > 0 ? ms : null, stale });
  });
}

if (args.includes("--sheet")) {
  for (const r of results) {
    if (r.act === "followup") continue;
    const f = Object.entries(r.fails).map(([k, v]) => `${k}:${v}`).join(" | ");
    console.log(`[${r.key}] (${r.act}) U: ${r.u}\n  EXPECT: ${r.expect}\n  SAY: ${r.say}\n  PLAN: ${r.plan.slice(0, 120)}  INTENT: ${r.intent.slice(0, 160)}${f ? `\n  AUTO: ${f}` : ""}`);
  }
  process.exit(0);
}

// 요약
const judged = results.filter((r) => r.act !== "followup");
const counts: Record<string, number> = {};
for (const r of judged) for (const k of Object.keys(r.fails)) counts[k] = (counts[k] ?? 0) + 1;
const autoClean = judged.filter((r) => !["a", "b", "c", "d", "e", "f"].some((k) => r.fails[k])).length;
const rub = judged.filter((r) => rubric[r.key]);
const rubPass = rub.filter((r) => rubric[r.key][0] === "PASS").length;
const layers: Record<string, number> = {};
for (const r of rub) if (rubric[r.key][0] !== "PASS") { const l = rubric[r.key][2] ?? "?"; layers[l] = (layers[l] ?? 0) + 1; }
const convPass = Object.keys(scen).filter((id) => { const rs = judged.filter((r) => r.id === id); return rs.length && rs.every((r) => rubric[r.key]?.[0] === "PASS"); }).length;
const ms = results.map((r) => r.ms).filter((x): x is number => x !== null).sort((a, b) => a - b);
const q = (p: number) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] : null);
const repeats = judged.filter((r) => /same say/.test(r.fails.e ?? "")).length;
const summary = { kiosk, scen: scenFile.split("/").pop(), turns: judged.length, repeatSay: repeats, autoCleanPct: Math.round((100 * autoClean) / judged.length), checkFails: counts, rubricJudged: rub.length, rubricPassPct: rub.length ? Math.round((100 * rubPass) / rub.length) : null, convPass: `${convPass}/${Object.keys(scen).length}`, failLayers: layers, sparkMs: { n: ms.length, median: q(0.5), p90: q(0.9) } };
console.log(JSON.stringify(summary));
if (args.includes("--fails")) for (const r of judged) { const f = Object.entries(r.fails).filter(([k]) => k !== "x"); const rb = rubric[r.key]; if (f.length || (rb && rb[0] !== "PASS")) console.log(`${r.key} ${rb ? rb[0] + "/" + (rb[2] ?? "") + " " + rb[1] : ""} ${f.map(([k, v]) => `${k}:${v}`).join(" | ")}`); }
if (opt("--json")) fs.writeFileSync(opt("--json")!, JSON.stringify({ summary, results: results.map((r) => ({ ...r, rubric: rubric[r.key] ?? null })) }, null, 1));
