"use client";

// 키오스크 한 대와 KIBO 개발용 콘솔. 사람 터치와 KIBO 재생이 같은 step()을 거친다.

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { idlePhase, type IdlePhase } from "@/engine/idle";
import { newRun, trackRun, type RunBy, type RunStats } from "@/engine/run";
import { langOf, type Understood } from "@/engine/turn";
import { useKiboTurn } from "@/engine/useKiboTurn";
import { openLink, type Answer, type Link, type LinkMsg } from "@/sync/link";
import { useRoom } from "@/sync/room";
import { limitedReject } from "@/ui/limited";
import { PairBadge, useQrFlag } from "@/ui/PairBadge";
import { FASTFOOD_TASK } from "@/engine/trialLog";
import { TrialPanel, useLogFlag, useTrialLog } from "@/ui/TrialRecorder";
import { KiboBand, type BandChip } from "@/ui/KiboBand";
import { KiboPointer } from "@/ui/KiboPointer";
import { beat, GAP } from "@/ui/pointer";
import { useView } from "@/ui/useView";
import { useSamples } from "../../samples";
import { initialState, step, type CartLine, type KioskEvent, type KioskState, type Screen, type Target } from "../machine";
import { answerKind } from "../clarify";
import type { FastfoodIntent, Missing } from "../planner";
import { FastfoodKiosk, type Highlight } from "./Kiosk";
import { intentChips, lineName, orderLines, screenLabel, statusSummary } from "./labels";
import { t } from "./strings";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface InterpretResponse {
  say: string;
  replyLanguage: string;
  // 말한 언어가 휴대폰 언어와 분명히 달라 말한 언어로 답했다(휴대폰이 그 언어로 바꾼다)
  followSpoken?: boolean;
  unknownItems: string[];
  // 계획 앞에 말할 알아들은 내용(서버 고정 문구)
  lead?: string;
  // 누를 것 없는 턴(질문)의 Spark 답
  answer?: string;
  intent: FastfoodIntent;
  plan: { kind: "plan"; events: KioskEvent[]; paymentHandoff: boolean; assumed: unknown[]; dropped: unknown[]; endScreen: string } | { kind: "clarify"; missing: Missing[]; events?: KioskEvent[] } | { kind: "reject"; reason: string };
  timing: { sparkMs: number; totalMs: number };
  error?: string;
}

function speak(text: string, lang: string) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase().slice(0, 2)));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

// 키오스크(960 높이)를 창 높이에 맞춘다. extra = 키오스크 위아래에 붙는, 크기가 고정된 칸들의 높이
function useFitScale(extra: number) {
  // 맞추기 전(서버 렌더와 하이드레이션 직전)에는 null. 그동안 화면을 숨겨, 크기가 바뀌며 밀리는 것(CLS)을 없앤다
  const [scale, setScale] = useState<number | null>(null);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min((window.innerHeight - 24 - extra) / 960, 1.25));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [extra]);
  return { scale: scale ?? 0.8, hide: scale === null ? ({ visibility: "hidden" } as const) : undefined };
}

// 재생이 끝난 뒤 사용자에게 알리는 고정 문구
const doneSay = {
  // b: 키오스크 화면의 결제 버튼 글자(키오스크 언어). 휴대폰 카드의 [b]와 같은 이름을 말한다
  pay: {
    en: (b: string) => `Your order is on the screen. Please check it and tap [${b}] yourself.`,
    ko: (b: string) => `주문이 화면에 있어요. 확인하시고 [${b}]는 직접 눌러 주세요.`,
    ja: (b: string) => `ご注文が画面に出ています。確認して、[${b}]はご自身で押してください。`,
    vi: (b: string) => `Đơn của bạn đã ở trên màn hình. Hãy kiểm tra và tự bấm [${b}].`,
    zh: (b: string) => `您的订单已在屏幕上。请确认后自己点[${b}]。`,
    es: (b: string) => `Su pedido está en la pantalla. Revíselo y pulse [${b}] usted mismo.`,
  },
  // 계획이 메뉴 화면에서 끝났을 때. 실제 사람은 "그게 다예요"를 스스로 말하지 않을 가능성이 커서 알려 준다
  more: {
    en: "Anything else? If not, just say “That's all.”",
    ko: "더 주문하실 게 있나요? 없으면 '그게 다예요'라고 말씀하세요.",
    ja: "ほかにご注文はありますか？なければ「以上です」とおっしゃってください。",
    vi: "Bạn còn muốn gọi gì nữa không? Nếu không, hãy nói “Vậy thôi”.",
    zh: "还要点别的吗？没有的话，请说“就这些”。",
    es: "¿Algo más? Si no, diga «Eso es todo».",
  },
  // 메뉴 화면에서 끝났는데 장바구니가 비었을 때(예: "먹고 갈게요"만 말함). 더 주문할지 묻지 않고 무엇을 말할지 예를 든다
  ask: {
    en: "What would you like? For example: one Double Cheeseburger meal.",
    ko: "드실 메뉴를 말씀해 주세요. 예: 더블 치즈버거 세트 하나",
    ja: "ご注文をお話しください。例：ダブルチーズバーガーのセットを一つ。",
    vi: "Bạn muốn gọi món gì? Ví dụ: một phần combo Double Cheeseburger.",
    zh: "请说出您想点的餐。例如：一份双层芝士汉堡套餐。",
    es: "¿Qué desea pedir? Por ejemplo: un menú de Double Cheeseburger.",
  },
  // 그 버거에 없거나 뺄 수 없는 재료를 빼 달라고 했을 때
  dropped: {
    en: "Some ingredients you asked to remove aren't in that burger or can't be removed, so I left them.",
    ko: "그 버거에 없거나 뺄 수 없는 재료는 그대로 두었어요.",
    ja: "そのバーガーにない材料や抜けない材料は、そのままにしました。",
    vi: "Một số nguyên liệu không có trong bánh đó hoặc không thể bỏ, nên tôi để nguyên.",
    zh: "有些配料那款汉堡里没有或不能去掉，我就保持原样了。",
    es: "Algunos ingredientes no están en esa hamburguesa o no se pueden quitar, así que los dejé.",
  },
};

// 계획을 다 누른 뒤 휴대폰에 할 말. hasItems: 이번 계획까지 장바구니에 담긴 것이 있는가
export function planDoneSay(p: { endScreen: string; dropped: number; hasItems: boolean }, l: ReturnType<typeof langOf>, payButton: string) {
  const end = p.endScreen === "review" ? doneSay.pay[l](payButton) : p.hasItems ? doneSay.more[l] : doneSay.ask[l];
  return [p.dropped ? doneSay.dropped[l] : "", end].filter(Boolean).join(" ");
}

const samples = [
  // 결정적 장면 발화. 마지막 "그게 다예요"까지 말해야 주문 확인(Ready to pay)에서 끝난다
  "더블 치즈버거 라지 세트, 음료는 제로 콜라로, 피클 빼고, 먹고 갈게요. 그게 다예요.",
  "Can I get a large double cheeseburger meal with a Zero Cola, no pickles, for here?",
  "ダブルチーズバーガーのLセット、ドリンクはコーラゼロで、ピクルス抜き、店内で。",
  "치즈버거 세트 하나요",
];

// 나란히 비교 장면의 실측 표시. 사람이 누른 수와 끝났는지를 앞에 세우고, 시간은 작게 둔다
function RunBar({ run }: { run: RunStats }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (run.startedAt === null || run.endedAt !== null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [run.startedAt, run.endedAt]);
  const ms = run.startedAt === null ? 0 : (run.endedAt ?? Math.max(now, run.startedAt)) - run.startedAt;
  const done = run.endedAt !== null;
  return (
    <div className={`flex h-[104px] w-full items-center gap-4 rounded-2xl px-5 whitespace-nowrap ${done ? "bg-teal-700 text-white" : "bg-white"}`} data-run-done={done}>
      <div className="leading-none">
        {/* 끝난 청록 바탕에서는 흐림을 줄인다(70%는 대비 3.46, 90%는 4.66) */}
        <div className={`text-[15px] font-semibold ${done ? "opacity-90" : "opacity-70"}`}>Your taps</div>
        <div className="text-[56px] font-black tabular-nums" data-run-taps>
          {run.humanTaps}
        </div>
      </div>
      {/* 끝나면 체크를 오른쪽 칸 맨 위에 한 줄로 두고 화면 수·시간을 그 아래 한 줄로 모은다.
          433px 칸에 누른 수·체크·실측 세 칸을 나란히 두면 체크가 두 줄로 접혔다. 칸 높이(104)는 그대로 */}
      <div className="ml-auto shrink-0 text-right text-[24px] leading-tight tabular-nums">
        {done && (
          <div className="kibo-check text-[28px] font-bold" data-run-check>
            ✓ Ready to pay
          </div>
        )}
        <div className="opacity-80">
          {done ? <div>{run.screens} screens · {(ms / 1000).toFixed(1)} s</div> : <div>{run.screens} screens</div>}
          {run.kiboTaps > 0 && <div>KIBO {run.kiboTaps} taps</div>}
          {!done && <div>{(ms / 1000).toFixed(1)} s</div>}
        </div>
      </div>
    </div>
  );
}

// variant "kiosk": 개발 콘솔 없이 키오스크만(영상·사용자 시험용 /kiosk/fastfood?view=kiosk). "compare": 나란히 비교의 한쪽
// room: null이면 어떤 room에도 연결하지 않는다(나란히 비교의 터치 쪽)
export function FastfoodStation({ variant: given, room, title }: { variant?: "dev" | "compare" | "kiosk"; room?: string | null; title?: string } = {}) {
  const view = useView();
  const variant = given ?? (view === "kiosk" ? "kiosk" : "dev");
  // room이 없으면 새로 만든다(대기 화면의 QR로 휴대폰과 짝짓는다)
  const roomId = useRoom(room);
  const qrOn = useQrFlag();
  // 사용자 시험 기록(키오스크 단독 화면 + ?log=1). 음성·전사문은 넣지 않는다
  const logOn = useLogFlag() && variant === "kiosk";
  const trial = useTrialLog(logOn, "fastfood");
  // 이번 시험에서 주문 확인 화면의 장바구니를 남겼는지([시작]마다 다시)
  const cartLoggedRef = useRef(false);
  const log = trial.log;
  const warnedRef = useRef(false);
  const [state, setState] = useState<KioskState>(initialState);
  const stateRef = useRef(state);
  // 시연용 모의 결제. machine은 모른다. 사람이 결제 화면에서 '카드 넣기'를 누르면 주문번호를 보인다(그 장바구니가 그대로일 때만)
  const [paid, setPaid] = useState<{ no: number; cart: CartLine[] } | null>(null);
  const paidNo = paid && state.screen === "payment" && paid.cart === state.cart ? paid.no : null;
  // 무조작 타이머가 읽는다: 결제를 마친 화면은 경고 없이 처음 화면으로 돌아간다
  const paidRef = useRef(false);
  useEffect(() => {
    paidRef.current = paidNo !== null;
  }, [paidNo]);
  const [hl, setHl] = useState<Highlight>(null);
  const [progress, setProgress] = useState<{ i: number; n: number } | null>(null);
  // 입력란 기본값은 브라우저 언어에 맞춘 첫 예시. 고치거나 예시를 누르면 그 글
  const examples = useSamples(samples);
  const [typed, setText] = useState<string | null>(null);
  const text = typed ?? examples[0];
  const [last, setLast] = useState<InterpretResponse | null>(null);
  // 나란히 비교에서는 띠 칸(150)·실측 막대(104)·간격까지 한 화면(1080)에 들어가게 줄인다
  const { scale, hide } = useFitScale(variant === "compare" ? 150 + 104 + 24 + 8 : variant === "kiosk" ? 150 + 8 : 0);
  const [run, setRun] = useState<RunStats>(() => newRun("review"));
  const linkRef = useRef<Link | null>(null);
  const [hello, setHello] = useState(0);
  // 이미 답한 hello 번호. hello에 답하는 status에만 지금 카드를 붙인다
  const helloSeenRef = useRef(0);
  const lastActRef = useRef(0);
  const [idle, setIdle] = useState<IdlePhase>({ kind: "active" });
  // 휴대폰 마이크가 듣는 중: 누른 순간부터 키오스크에 'Listening' 띠(그 앱 비교: 첫 변화 1.6초). 말이 오거나 end가 오면, 늦어도 60초 뒤에 끈다
  const [listening, setListening] = useState<boolean | "heard">(false);
  useEffect(() => {
    if (!listening) return;
    const id = setTimeout(() => setListening(false), 60_000);
    return () => clearTimeout(id);
  }, [listening]);
  // 개발 콘솔에서 보낸 말이면 키오스크가 대답을 읽고, 휴대폰에서 온 말이면 휴대폰이 읽는다
  const localRef = useRef(false);
  const playingRef = useRef(false);
  // 앞 턴에 되물은 의도. 다음 말과 합친다
  const pendingRef = useRef<FastfoodIntent | null>(null);
  // 띠에 보일 의도 칩과, 휴대폰 단계 이름의 언어(마지막 대답 언어)
  const [chips, setChips] = useState<BandChip[]>([]);
  const [replyLang, setReplyLang] = useState("en");

  const touchActivity = useCallback(() => {
    lastActRef.current = Date.now();
    warnedRef.current = false;
    setIdle({ kind: "active" });
  }, []);

  const apply = useCallback(
    (s: KioskState, by: RunBy = "touch") => {
      stateRef.current = s;
      setState(s);
      touchActivity();
      if (s.screen === "idle") pendingRef.current = null;
      // 오류 완료를 가르기 위해, 주문 확인에 처음 도달한 때의 주문 방식과 장바구니(메뉴 id만)를 남긴다
      if (s.screen === "review" && !cartLoggedRef.current) {
        cartLoggedRef.current = true;
        log({ kind: "cart", by: "kiosk", screen: s.screen, orderType: s.orderType, cart: s.cart.map(({ menuId, mode, size, side, drink, remove, add, qty }) => ({ menuId, mode, size, side, drink, remove, add, qty })) });
      }
      const now = Date.now();
      setRun((r) => trackRun(r, { type: "step", by, screen: s.screen }, now));
    },
    [touchActivity, log],
  );

  // 재생: 서버가 무엇을 보냈든 KIBO의 조작(by: "kibo")으로만 누른다. 끝까지 성공해야 true
  async function play(events: KioskEvent[]) {
    if (playingRef.current) return false;
    playingRef.current = true;
    try {
      for (const [i, raw] of events.entries()) {
        const e: KioskEvent = { ...raw, by: "kibo" };
        setProgress({ i: i + 1, n: events.length });
        setHl({ target: e.target, value: e.value });
        await sleep(beat(i === 0).tap);
        const r = step(stateRef.current, e);
        if (!r.ok) {
          console.error("KIBO step failed", e, r.error);
          return false;
        }
        apply(r.state, "kibo");
        log({ kind: "tap", by: "kibo", screen: r.state.screen, target: e.target, value: e.value });
        setHl(null);
        await sleep(GAP);
      }
      return true;
    } finally {
      setHl(null);
      setProgress(null);
      playingRef.current = false;
    }
  }

  // 휴대폰이 말과 함께 보낸 언어. 한도(429) 문구를 그 언어로 받는다
  const sayLangRef = useRef("");
  // 휴대폰 답 칩이 글과 함께 보낸 정해진 답. 같은 글의 턴에만 한 번 쓴다(서버가 Spark 없이 계획)
  const chipRef = useRef<{ text: string; answer: Answer } | null>(null);
  async function understand(utterance: string, signal: AbortSignal): Promise<Understood<KioskEvent>> {
    setChips([]);
    const chip = chipRef.current;
    chipRef.current = null;
    // 휴대폰 말에만 그 언어(?lang)를 붙인다. 서버는 그 언어로 답한다. 키오스크에서 친 말은 붙이지 않아 Spark가 고른 언어로 답한다
    const res = await fetch(`/api/fastfood/interpret${sayLangRef.current ? `?lang=${encodeURIComponent(sayLangRef.current)}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterance, state: stateRef.current, pending: pendingRef.current ?? undefined, answer: chip?.text === utterance ? chip.answer : undefined }),
      signal,
    });
    const limited = await limitedReject(res, sayLangRef.current);
    if (limited) return limited;
    if (!res.ok) throw new Error(`interpret ${res.status}`);
    const body = (await res.json()) as InterpretResponse;
    setLast(body);
    if (body.error) throw new Error(body.error);
    const p = body.plan;
    const lang = body.replyLanguage;
    // 되물었으면 다음 턴에 합칠 수 있게 의도를 남긴다
    pendingRef.current = p.kind === "clarify" ? body.intent : null;
    setReplyLang(lang);
    setChips(p.kind === "reject" ? [] : intentChips(body.intent, p.kind === "plan" ? (p.endScreen as Screen) : null, stateRef.current.lang));
    // 되물을 때도 아는 만큼 먼저 누른다(빠진 것을 고르는 화면에서 멈춤)
    if (p.kind === "clarify") return { kind: "clarify", say: body.say, lang, followSpoken: body.followSpoken, events: p.events ?? [], answers: answerKind(p.missing ?? []) };
    if (p.kind === "reject") return { kind: "reject", reason: p.reason, lang, say: body.say, followSpoken: body.followSpoken };
    const l = langOf(lang);
    const payButton = t.pay[stateRef.current.lang];
    const hasItems = stateRef.current.cart.length > 0 || p.events.some((e) => e.target === "add_to_cart");
    const say = planDoneSay({ endScreen: p.endScreen, dropped: p.dropped.length, hasItems }, l, payButton);
    return { kind: "plan", events: p.events, lang, followSpoken: body.followSpoken, lead: body.lead, answer: body.answer, done: { say, gate: null, paymentHandoff: p.endScreen === "review", payButton, ...(p.endScreen !== "review" && hasItems && { answers: "more" as const }) } };
  }

  function send(m: LinkMsg) {
    linkRef.current?.send(m);
    if (m.type === "reply") log({ kind: "result", by: "kibo", screen: stateRef.current.screen, result: m.result });
    if (m.type === "done") log({ kind: "done", by: "kibo", screen: stateRef.current.screen });
    if (localRef.current && (m.type === "reply" || m.type === "done")) speak(m.say, m.replyLanguage);
  }

  const { turn, phase, slow, busy } = useKiboTurn<KioskEvent>({ understand, play, resume: () => null, send });
  const thinking = phase === "thinking";

  // 실제 키오스크처럼 오래 조작이 없으면 경고하고, 그래도 없으면 처음 화면으로 돌아간다
  useEffect(() => {
    lastActRef.current = Date.now();
    const id = setInterval(() => {
      if (turn.busy()) return;
      const ph = idlePhase(Date.now() - lastActRef.current, stateRef.current.screen, paidRef.current);
      if (ph.kind === "reset") {
        apply(initialState());
        log({ kind: "reset", by: "kiosk", screen: "idle" });
      } else {
        // 경고는 뜨는 순간 한 번만 적는다
        if (ph.kind === "warning" && !warnedRef.current) {
          warnedRef.current = true;
          log({ kind: "warning", by: "kiosk", screen: stateRef.current.screen });
        }
        setIdle(ph);
      }
    }, 500);
    return () => clearInterval(id);
  }, [apply, turn, log]);

  // 해석을 기다리는 동안과 재생하는 동안은 사람 터치를 받지 않는다(낡은 화면으로 계획하지 않게)
  const press = useCallback(
    (target: Target, value?: string) => {
      if (turn.busy()) return;
      const r = step(stateRef.current, value === undefined ? { by: "touch", target } : { by: "touch", target, value });
      if (!r.ok) return;
      turn.touched();
      apply(r.state);
      log({ kind: "tap", by: "human", screen: r.state.screen, target, value });
    },
    [apply, turn, log],
  );

  // 실제 키오스크처럼 "담기 완료" 화면은 잠시 뒤 메뉴로 돌아간다
  useEffect(() => {
    if (state.screen !== "added" || busy) return;
    const id = setTimeout(() => {
      const r = step(stateRef.current, { by: "touch", target: "added_ok" });
      if (r.ok) apply(r.state, "auto");
    }, 1500);
    return () => clearTimeout(id);
  }, [state.screen, busy, apply]);

  function ask(utterance: string) {
    localRef.current = true;
    sayLangRef.current = "";
    touchActivity();
    // 키오스크 앞에서 친 말은 지금 카드에 대한 말이다(휴대폰 말은 카드 id를 붙여 온다)
    turn.hear({ text: utterance, lang: "auto", gateId: turn.gateId() ?? undefined });
  }
  const onPhoneUtterance = useEffectEvent((m: { id?: string; text: string; lang: string; gateId?: string; answer?: Answer }) => {
    chipRef.current = m.answer ? { text: m.text, answer: m.answer } : null;
    localRef.current = false;
    // 말 원문은 남기지 않는다. 턴이 있었다는 사실만
    log({ kind: "turn", by: "phone", screen: stateRef.current.screen });
    setText(m.text);
    touchActivity();
    sayLangRef.current = m.lang;
    turn.hear(m);
  });

  // 말 시도(마이크를 켬). 받아쓰기에 실패해 턴이 없어도 시도로 센다
  const onListening = useEffectEvent(() => log({ kind: "listen", by: "phone", screen: stateRef.current.screen }));

  useEffect(() => {
    if (!roomId) return;
    // 같은 화면 안 휴대폰(BroadcastChannel)과, Supabase 키가 있으면 다른 기기의 휴대폰(Realtime)을 함께 받는다
    const link = openLink(roomId);
    linkRef.current = link;
    // (다시) 연결되면 지금 상태를 다시 보낸다
    const offJoin = link.onJoin(() => setHello((n) => n + 1));
    const off = link.subscribe((m) => {
      if (m.type === "utterance") {
        setListening(false);
        onPhoneUtterance(m);
      }
      if (m.type === "hello") setHello((n) => n + 1);
      if (m.type === "listening") {
        setListening(m.end ? false : m.heard ? "heard" : true);
        if (!m.end && !m.heard) onListening();
      }
      // 글로 보낸 경우에도 해석 시간이 빠지지 않게 받은 순간부터 잰다(마이크로 이미 시작했으면 그대로)
      if ((m.type === "listening" && !m.end) || m.type === "utterance") {
        const now = Date.now();
        setRun((r) => trackRun(r, { type: "listening" }, now));
      }
    });
    return () => {
      off();
      offJoin();
      link.close();
    };
  }, [room, roomId]);

  // 휴대폰에 지금 화면과 진행을 알린다
  useEffect(() => {
    const total = state.cart.reduce((n, l) => n + l.qty * l.unitPrice, 0);
    const items = state.cart.reduce((n, l) => n + l.qty, 0);
    const label = screenLabel[state.screen][langOf(replyLang)].replace("{b}", t.pay[state.lang]);
    // 품목 수·합계도 단계 이름과 같은 언어로 보낸다(없으면 휴대폰이 영어로 채운다)
    // 담는 중이거나 마지막에 담은 품목 이름을 앞에 붙인다(Spark가 다른 버거로 바꿔 넣어도 사람이 휴대폰에서 알아채게)
    const current = state.draft ?? state.cart.at(-1);
    const summary = statusSummary(items, total, replyLang, current && lineName(current, state.lang));
    const answering = hello !== helloSeenRef.current;
    helloSeenRef.current = hello;
    // cart·draft: machine 상태 원자료. 휴대폰이 품목 이름을 자기 언어(ko/en)로 그린다(lines·summary는 키오스크 언어라서)
    // kioskLang: 키오스크 화면 언어. 휴대폰이 키오스크 버튼 이름(예: Pay)을 화면과 같게 적는다
    linkRef.current?.send({ type: "status", screen: state.screen, label, busy, items, total, kioskId: "fastfood", summary, cart: state.cart, draft: state.draft, kioskLang: state.lang, ...(progress && { step: progress.i, steps: progress.n }), ...(answering && { gate: turn.card() }), ...((state.screen === "review" || state.screen === "payment") && { lines: orderLines(state.cart, state.lang) }), ...(paidNo !== null && { paid: paidNo }) });
  }, [state, busy, progress, hello, replyLang, turn, paidNo]);

  const banner = <KiboBand phase={phase} slow={slow} chips={chips} progress={progress} listening={listening} />;

  const timeoutPopup =
    idle.kind === "warning" ? (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-neutral-900/60 p-8" role="alertdialog" aria-label={t.needMoreTime[state.lang]}>
        <div className="w-full rounded-xl bg-white p-8 text-center">
          <div className="text-6xl">⏱️</div>
          <div className="mt-4 text-2xl font-bold">{t.needMoreTime[state.lang]}</div>
          <div className="mt-2 text-neutral-600">{state.lang === "ko" ? `${idle.secondsLeft}초 후 처음 화면으로 돌아갑니다` : `Returning to the start screen in ${idle.secondsLeft}s`}</div>
          <button
            type="button"
            onClick={() => {
              touchActivity();
              log({ kind: "tap", by: "human", screen: stateRef.current.screen, target: "keep_going" });
            }}
            className="mt-6 w-full rounded-xl bg-(--bb-cobalt) py-4 text-xl font-bold text-white"
          >
            {t.continue[state.lang]}
          </button>
        </div>
      </div>
    ) : null;

  const kiosk = (
    <div style={{ width: 540 * scale, height: 960 * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <FastfoodKiosk
          state={state}
          press={press}
          pay={{
            no: paidNo,
            // 결제한 순간부터 처음 화면으로 돌아갈 시간을 센다
            onPay: () => {
              touchActivity();
              setPaid({ no: 100 + Math.floor(Math.random() * 900), cart: state.cart });
            },
          }}
          banner={
            <>
              {/* 재생이 주문 확인에서 끝나면 사람이 누를 결제 버튼에 고리를 그린다 */}
              <KiboPointer hl={hl} active={progress !== null} screen={state.screen} finale={{ target: "pay" }} />
              {variant === "dev" && banner}
              {timeoutPopup}
            </>
          }
        />
      </div>
    </div>
  );

  if (variant === "kiosk")
    return (
      <main style={hide} className="flex min-h-screen flex-col items-center gap-2 bg-neutral-200 p-3">
        <h1 className="sr-only">{t.kioskTitle[state.lang]}</h1>
        {/* 띠 칸은 KIBO가 일하지 않는 대기 화면에서 비어 있다. KIBO 연결 QR은 그 칸 오른쪽 아래, 키오스크 틀 바로 위에 붙인
            스티커처럼 둔다(키오스크 화면 내용을 가리지 않는다). ?qr=0이면 숨긴다 */}
        <div className="relative h-[150px]" style={{ width: 540 * scale }}>
          <KiboBand phase={phase} slow={slow} chips={chips} progress={progress} listening={listening} slot />
          {roomId && qrOn && state.screen === "idle" && !busy && <PairBadge room={roomId} at="absolute right-0 bottom-0" />}
        </div>
        {kiosk}
        {logOn && (
          <TrialPanel
            events={trial.events}
            kiosk="fastfood"
            task={FASTFOOD_TASK}
            onSaved={trial.saved}
            onClear={trial.clear}
            onStart={(participant, condition) => {
              trial.start(stateRef.current.screen, participant, condition);
              cartLoggedRef.current = false;
            }}
          />
        )}
      </main>
    );

  if (variant === "compare")
    return (
      <div className="flex flex-col items-center gap-3" style={{ width: 540 * scale, ...hide }}>
        {/* 띠 칸: 평소에는 제목, KIBO가 알아듣고 누르는 동안에는 띠 */}
        {/* KIBO 연결 QR은 띠 칸 오른쪽 위에 둔다(제목은 아래 가운데). 키오스크 화면 내용을 가리지 않는다 */}
        <div className="@container relative flex h-[150px] w-full items-end justify-center">
          {/* 좁은 화면(xl 미만)은 휴대폰으로 보는 경우라 그 화면의 QR을 같은 휴대폰으로 찍을 수 없다. 접힌 제목을 덮지 않게 숨긴다.
              배지(높이 100)는 4px 올려 한 줄 제목(띠 아래 52)과 겹치지 않게 한다.
              노트북처럼 화면 높이가 낮아 키오스크가 좁으면(띠 320px 이하) 숨기지 않고 글을 빼 QR만 두고 12px 올린다.
              제목은 20px로 줄여 두 줄이어도 띠 아래 54px 안에 들어가게 한다(전에는 숨겨서 노트북에서 QR이 안 보였다) */}
          {roomId && qrOn && state.screen === "idle" && !busy && <PairBadge room={roomId} at="absolute -top-1 right-0 max-xl:hidden @max-[320px]:-top-3 @max-[320px]:pr-2 @max-[320px]:[&>div:last-child]:hidden" />}
          {phase === "thinking" || phase === "replaying" ? (
            <div className="h-full w-full">
              <KiboBand phase={phase} slow={slow} chips={chips} progress={progress} listening={listening} slot />
            </div>
          ) : (
            <h2 className="pb-1 text-[32px] font-bold @max-[320px]:text-[20px] @max-[320px]:leading-tight">{title}</h2>
          )}
        </div>
        {kiosk}
        <RunBar run={run} />
      </div>
    );

  return (
    <main style={hide} className="flex min-h-screen items-start justify-center gap-8 bg-neutral-200 p-3">
      <h1 className="sr-only">{t.kioskTitle[state.lang]}</h1>
      {kiosk}

      <div className="w-96 rounded-xl bg-white p-4 text-sm shadow">
        <div className="mb-2 font-bold">KIBO dev console</div>
        <textarea aria-label="KIBO에게 할 말 (Say to KIBO)" className="h-24 w-full rounded border border-neutral-300 p-2" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-1">
          {examples.map((s) => (
            <button key={s} type="button" className="rounded bg-neutral-100 px-2 py-1 text-xs" onClick={() => setText(s)}>
              {s.slice(0, 18)}…
            </button>
          ))}
        </div>
        <button type="button" disabled={busy || thinking} onClick={() => ask(text)} className="mt-3 w-full rounded bg-teal-700 py-2 font-bold text-white disabled:opacity-50">
          {thinking ? "Thinking…" : busy ? "Operating…" : "Say it"}
        </button>
        {last && (
          <div className="mt-3 space-y-1 text-xs">
            {last.error ? (
              <div className="text-red-600">{last.error}</div>
            ) : (
              <>
                <div>
                  <b>say</b> ({last.replyLanguage}): {last.say}
                </div>
                <div>
                  <b>plan</b>: {last.plan.kind}
                  {last.plan.kind === "plan" && ` · ${last.plan.events.length} taps${last.plan.paymentHandoff ? " · payment handed to customer" : ""}`}
                  {last.plan.kind !== "plan" && ` · ${JSON.stringify("missing" in last.plan ? last.plan.missing : last.plan.reason)}`}
                </div>
                {last.unknownItems.length > 0 && (
                  <div>
                    <b>not on menu</b>: {last.unknownItems.join(", ")}
                  </div>
                )}
                <div>
                  <b>timing</b>: Spark {last.timing.sparkMs} ms · server {last.timing.totalMs} ms
                </div>
              </>
            )}
          </div>
        )}
        <div className="mt-4 border-t pt-2 text-xs text-neutral-500">
          screen: {state.screen} · cart: {state.cart.length} lines
          <button type="button" className="ml-2 underline" onClick={() => !turn.busy() && apply(initialState(state.lang))}>
            reset
          </button>
        </div>
      </div>
    </main>
  );
}
