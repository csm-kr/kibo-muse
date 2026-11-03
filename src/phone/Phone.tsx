"use client";

// 사용자의 휴대폰 화면. 말하면 전사해서 키오스크로 보내고, KIBO의 대답을 사용자의 언어로 읽어 준다.

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { krFont } from "@/kiosks/fastfood/ui/tokens";
import { openLink, type Link, type LinkGate, type LinkMsg } from "@/sync/link";
import { decodeBlob, PHONE_WAV_RATE, wavAt } from "./audio";
import { useDocLang } from "./docLang";
import { GuideCamera } from "./Guide";
import { AlertIcon, CameraIcon, CheckIcon, KiboMark, MicIcon, SpeakerIcon, TapIcon } from "./icons";
import { pickLang, saveLang, savedLang } from "./lang";
import { payStep } from "./pay";
import { nextOrder, type OrderMemo } from "./receipt";
import { setSound, soundOn, speak, subscribeSound, unlockSpeech } from "./speak";
import { bandHidden, orderLinesIn, statusLine } from "./status";
import { phoneText } from "./text";
import { HOLD_CLASS, useHoldToTalk, type Take } from "./useHoldToTalk";
import { welcomeExamples } from "./welcome";

// guide·pair: room 없이 연 휴대폰(어느 키오스크와도 연결 안 됨)은 안내 모드만 쓴다
const langs = [
  { label: "English", bias: "English", tts: "en-US", guide: "Take a photo of any kiosk screen", pair: "Scan the QR code on a KIBO kiosk to connect." },
  { label: "한국어", bias: "Korean", tts: "ko-KR", guide: "아무 키오스크 화면이나 찍어 주세요", pair: "키오스크의 QR을 찍으면 연결돼요." },
  { label: "日本語", bias: "Japanese", tts: "ja-JP", guide: "キオスクの画面を撮影してください", pair: "キオスクのQRコードを読み取ると接続します。" },
  { label: "Tiếng Việt", bias: "Vietnamese", tts: "vi-VN", guide: "Chụp màn hình kiosk bất kỳ", pair: "Quét mã QR trên kiosk để kết nối." },
  { label: "中文", bias: "Chinese", tts: "zh-CN", guide: "拍下任意自助机的屏幕", pair: "扫描自助机上的二维码即可连接。" },
  { label: "Español", bias: "Spanish", tts: "es-ES", guide: "Haz una foto de la pantalla de cualquier quiosco", pair: "Escanea el código QR del quiosco para conectarte." },
];

const noop = () => () => {};

// 휴대폰 색 토큰. [data-phone] 루트에만 건다(키오스크는 그대로). 대비 값은 critic-demo phone-spec.md §3
// 주황은 사람 차례(마이크, 확인 버튼, 고리, 띠), 청록은 KIBO가 하는 일(점, 물결, 진행). 주황·청록·종이 위 글자는 ink만 쓴다
const phoneVars = {
  "--k-bg": "#042F2E", // 바탕. 흰 글자 13.8
  "--k-surface": "#0B3F3D", // KIBO 말풍선, 위 띠. 흰 글자 11.2
  "--k-surface2": "#134E4A", // 생각 중 마이크, 보내기. 흰 글자 9.06
  "--k-text": "#F8FAFC",
  "--k-muted": "#99C5BF", // 보조 글자. 바탕 7.64, surface 6.19
  "--k-line": "#5E9C96", // 칩·입력 칸 테두리. 바탕 4.6
  "--k-teal": "#2DD4BF", // ink 글자 7.77
  "--k-orange": "#F97316", // ink 글자 5.16. 흰 글자 금지(2.80)
  "--k-ink": "#042F2E",
  "--k-paper": "#F8FAFC", // 주문 카드·영수증. 보조 글자 #475569(7.24)
  "--k-warn": "#FDE68A", // 연결 전
} as CSSProperties;

// 영수증 아래 가장자리 톱니(이 10px 높이)
const zigzag = { mask: "conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 20px 100%" } as CSSProperties;

// kind: ask = 되묻기(주황 띠, 사람 차례), error = 못 들었거나 실패(빨간 띠)
type Turn = { who: "you" | "kibo"; text: string; kind?: "ask" | "error" };
type Status = Extract<LinkMsg, { type: "status" }>;

// embedded: 나란히 비교 화면(/compare) 안에 휴대폰 모양으로 넣는다
export function Phone({ room: roomProp, embedded = false }: { room?: string; embedded?: boolean } = {}) {
  // 기본 언어: 주소 ?lang= → 칩으로 고른 값(저장) → 브라우저 언어. 서버 렌더에서는 English
  const initialCode = useSyncExternalStore(noop, () => pickLang([new URLSearchParams(location.search).get("lang"), savedLang(), ...navigator.languages]), () => "en");
  const [picked, setLang] = useState<(typeof langs)[number] | null>(null);
  const lang = picked ?? langs.find((l) => l.tts.startsWith(initialCode))!;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  // KIBO가 이번 재생에서 지나온 화면 이름들(체크리스트)
  // 단계 이름은 그릴 때 휴대폰 언어로 바꾸므로 화면 상태를 그대로 둔다
  const [trail, setTrail] = useState<Status[]>([]);
  // 결제 넘기기 안내. 키오스크가 알려 준 결제 버튼 이름(없으면 빈 문자열 → 일반 이름)
  const [handoff, setHandoff] = useState<string | null>(null);
  // 사람이 해야 하는 다음 일 (공항: 위험물 확인, 여권, 체크인 확정)
  const [gate, setGate] = useState<LinkGate | null>(null);
  const [typed, setTyped] = useState("");
  // 말을 보낸 뒤 KIBO의 대답(reply)을 기다리는 중
  const [thinking, setThinking] = useState(false);
  // 주문 확인 때 받은 품목과 결제 완료 영수증(결제 시각)
  const [order, setOrder] = useState<OrderMemo>({});
  // 언어 격자: null이면 대화가 없을 때만 펼친다. 머리의 언어 버튼으로 열고 닫는다
  const [langOpen, setLangOpen] = useState<boolean | null>(null);
  const linkRef = useRef<Link | null>(null);
  // 마지막으로 받은 관문 카드. 말하는 동안 카드는 숨기지만, 그때 한 '예'가 이 카드에 대한 말이라는 것은 id로 함께 보낸다
  const cardRef = useRef<LinkGate | null>(null);
  // 마이크 아래 한 줄 안내(너무 짧게 누름, 마이크 막힘)
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // room이 없으면(키오스크 QR로 열지 않음) 연결하지 않고 안내 모드만 쓴다. 서버 렌더에서는 아직 모른다(undefined)
  const room = useSyncExternalStore(
    noop,
    () => roomProp ?? new URLSearchParams(location.search).get("room"),
    () => roomProp,
  );
  const guideOnly = room === null;
  const tx = phoneText(lang.tts);
  const sound = useSyncExternalStore(subscribeSound, soundOn, () => true);
  // 단독 화면만 html lang을 바꾼다. /compare 안의 휴대폰은 위의 lang 속성으로 이 부분만 표시한다
  useDocLang(lang.tts, !embedded);
  const operating = status?.busy && status.steps;
  const line = status && statusLine(status, lang.tts);
  // 키오스크가 주문 확인·결제 화면에 오면 휴대폰에 주문 확인 카드와 끝 표시를 띄운다(패스트푸드)
  const orderCard = !status || operating || status.kioskId !== "fastfood" ? null : status.paid ? "paid" : status.screen === "payment" ? "paying" : status.screen === "review" && status.lines?.length ? "review" : null;

  // 중괄호로 감싸 아무것도 돌려주지 않는다. Chrome 153부터 scrollIntoView가 Promise를 돌려주고, React는 돌려받은 값을 정리 함수로 부른다
  // 대화 칸만 내린다. scrollIntoView는 문서까지 끌어내려 좁은 화면 /compare(세로로 쌓음)를 열자마자 휴대폰 쪽으로 튀게 했다
  useEffect(() => {
    const box = endRef.current?.parentElement;
    box?.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [turns, handoff, gate, orderCard, thinking]);

  // 키오스크가 대답하지 않으면(닫힘 등) 생각 중 표시를 오래 두지 않는다
  useEffect(() => {
    if (!thinking) return;
    const t = setTimeout(() => setThinking(false), 25000);
    return () => clearTimeout(t);
  }, [thinking]);

  useEffect(() => {
    if (!room) return;
    // 같은 브라우저 안(나란히 비교의 내장 휴대폰)과, Supabase 키가 있으면 다른 기기의 키오스크를 함께 잇는다
    const link = openLink(room);
    linkRef.current = link;
    const off = link.subscribe((m) => {
      if (m.type === "status") {
        setStatus(m);
        if (m.kioskId === "fastfood") setOrder((o) => nextOrder(o, m, new Date()));
        // hello에 대한 답에는 지금 떠 있는 카드가 붙어 온다(끊긴 동안 놓친 카드)
        if (m.gate !== undefined) {
          setGate(m.gate);
          cardRef.current = m.gate;
        }
        if (m.busy && m.steps && m.label) setTrail((t) => (m.step === 1 && t.at(-1)?.screen !== m.screen ? [m] : t.at(-1)?.screen === m.screen ? t : [...t, m]));
      }
      // KIBO가 대답한 언어로 언어 칩을 맞춘다(휴대폰 설정과 다른 언어로 말했을 때)
      if (m.type === "reply" || m.type === "done") {
        const code = m.replyLanguage.toLowerCase().slice(0, 2);
        const l = langs.find((x) => x.tts.toLowerCase().startsWith(code));
        if (l && !(m.type === "reply" && m.result === "busy")) setLang(l);
      }
      // 같은 room의 다른 휴대폰(나란히 비교의 내장 휴대폰과 실제 휴대폰)이 한 말도 대화에 보인다
      if (m.type === "utterance") {
        setTurns((t) => [...t, { who: "you", text: m.text }]);
        setThinking(true);
      }
      // 해석이 8초를 넘기면 한 번 오는 '아직 생각 중'
      if (m.type === "slow") {
        setTurns((t) => [...t, { who: "kibo", text: m.say }]);
        speak(m.say, m.replyLanguage);
      }
      // 대답(reply)은 말마다 한 번, 완료(done)는 재생이 끝난 뒤. 관문 카드와 결제 안내는 완료에만 온다
      if (m.type === "reply") {
        setThinking(false);
        if (m.say) setTurns((t) => [...t, { who: "kibo", text: m.say, kind: m.result === "clarify" ? "ask" : m.result === "error" ? "error" : undefined }]);
        if (m.result !== "busy") {
          setHandoff(null);
          setGate(null);
          cardRef.current = null;
        }
        speak(m.say, m.replyLanguage);
      }
      if (m.type === "done") {
        if (m.say) setTurns((t) => [...t, { who: "kibo", text: m.say }]);
        setHandoff(m.paymentHandoff ? (m.payButton ?? "") : null);
        setGate(m.gate);
        cardRef.current = m.gate;
        speak([m.say, m.gate?.text].filter(Boolean).join(" "), m.replyLanguage);
      }
    });
    // (다시) 연결될 때마다, 그리고 휴대폰 화면을 다시 켤 때마다 hello로 키오스크의 지금 상태를 받는다
    const offJoin = link.onJoin(() => link.send({ type: "hello" }));
    const onVisible = () => document.visibilityState === "visible" && link.send({ type: "hello" });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      offJoin();
      document.removeEventListener("visibilitychange", onVisible);
      link.close();
    };
  }, [room, roomProp]);

  function send(text: string) {
    if (!text.trim() || guideOnly) return;
    setTurns((t) => [...t, { who: "you", text }]);
    // 키오스크와 이어져 있을 때만 대답을 기다린다
    if (status) setThinking(true);
    // 새로 말하면 떠 있던 관문 카드는 낡는다(답이 바뀔 수 있다). 새 카드가 오면 다시 뜬다
    setGate(null);
    const card = cardRef.current;
    linkRef.current?.send({ type: "utterance", id: crypto.randomUUID(), text, lang: lang.bias, ...(card?.kind === "ack" && card.id && { gateId: card.id }) });
  }

  // 뗀 뒤 녹음본을 받아쓰기로 보낸다
  async function onTake({ blob }: Take) {
    // 소리가 거의 담기지 않은 녹음은 풀 수 없다. 다시 누르게 한다
    const decoded = await decodeBlob(blob).catch(() => null);
    if (!decoded) return setNotice(tx.tooShort);
    const wav = await wavAt(decoded, PHONE_WAV_RATE);
    // 네트워크가 끊기면 응답이 없다. 오류 코드 대신 다시 말해 달라는 고정 문구를 보인다
    const body = await fetch(`/api/transcribe?lang=${encodeURIComponent(lang.bias)}&kiosk=${status?.kioskId ?? "fastfood"}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav as BodyInit })
      .then((res) => res.json() as Promise<{ transcript?: string; say?: string }>)
      .catch(() => ({}) as { transcript?: string; say?: string });
    // 안내 모드에서는 말한 것이 사진에 대한 질문이 된다
    if (body.transcript && guideOnly) setTyped(body.transcript);
    else if (body.transcript) send(body.transcript);
    // 한도·크기 초과·받아쓰기 실패는 서버가 휴대폰 언어로 만든 고정 문구(say)를 보낸다. 없으면(빈 받아쓰기, 400) 휴대폰 문구
    else setTurns((t) => [...t, { who: "kibo", text: body.say ?? tx.retry, kind: "error" }]);
  }

  const { phase, bind } = useHoldToTalk({
    onPress: () => {
      unlockSpeech();
      setNotice(null);
      // 말하기 시작하면 관문 카드를 숨긴다. 말하는 동안 옛 카드를 누르지 않게
      setGate(null);
    },
    onRecording: () => linkRef.current?.send({ type: "listening" }),
    onTake,
    onTooShort: () => setNotice(tx.tooShort),
    onBlocked: () => setNotice(tx.micBlocked),
  });

  function confirmGate(g: LinkGate) {
    setTurns((t) => [...t, { who: "you", text: `✔ ${g.button}` }]);
    setGate(null);
    linkRef.current?.send({ type: "ack", what: g.what, gateId: g.id });
  }



  // 품목 이름은 원자료(cart)가 있으면 휴대폰 언어로(키오스크가 영어여도 한국어 휴대폰엔 한국어)
  const cardLines = (status?.lines?.length ? orderLinesIn(status, lang.tts) : orderLinesIn(order, lang.tts)) ?? [];
  // 영수증: 결제 완료 중이면 그 번호의 영수증. 키오스크가 첫 화면으로 돌아가 결제 완료가 사라져도, 새 주문이 시작되기 전까지(nextOrder가 지우기 전까지) 그대로 보인다
  const receipt = order.receipt && (orderCard === "paid" ? order.receipt.no === status?.paid : !orderCard) ? order.receipt : null;
  const receiptLines = (receipt && orderLinesIn(receipt, lang.tts)) ?? [];
  const waiting = !guideOnly && (phase === "sending" || thinking);
  const last = turns.at(-1);
  const asking = !waiting && !operating && last?.who === "kibo" && last.kind === "ask";
  // 언어 격자는 대화가 없고 키오스크가 첫 화면일 때만 펼친다. 그 밖에는 머리의 언어 버튼으로 연다
  // 영수증이 떠 있으면 펼치지 않는다(영수증이 맨 위에 오게)
  const showLangs = langOpen ?? (turns.length === 0 && !receipt && (!status || status.screen === "idle"));
  const empty = turns.length === 0 && !gate && !orderCard && !receipt && handoff === null && !waiting;
  const hint =
    phase === "recording" ? tx.listening : waiting ? tx.thinking : (notice ?? (operating ? tx.operating : orderCard === "paid" ? tx.pickup : orderCard === "paying" ? tx.paying : asking ? tx.answer : tx.hold));
  const won = (n: number) => `₩${n.toLocaleString("en-US")}`;
  const pay = (button?: string) => {
    // 키오스크가 결제 방법 화면이면 [결제하기] 대신 "결제 방법을 고르고 카드를 넣어 주세요"
    const p = payStep(lang.tts, status?.screen ?? "", button, status?.kioskLang);
    // 버튼처럼 보이지 않는 안내 줄(채운 상자·그림자 없음). KIBO는 결제하지 않는다
    return (
      <div className="flex items-start gap-3 py-1" data-pay-note>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[var(--k-orange)]">
          <TapIcon />
        </span>
        <div>
          <div className="text-lg leading-snug font-bold">{p.tap}</div>
          <div className="mt-0.5 text-sm text-[var(--k-muted)]">{p.never}</div>
        </div>
      </div>
    );
  };
  const orderLines = (lines: typeof cardLines) => (
    <ul className="space-y-2 text-left">
      {lines.map((l, i) => (
        <li key={i} className="flex gap-2">
          <div className="flex-1">
            <div className="text-lg leading-snug font-bold">{l.name}</div>
            {l.detail && <div className="text-sm text-[#475569]">{l.detail}</div>}
          </div>
          <div className="text-lg font-bold tabular-nums">×{l.qty}</div>
        </li>
      ))}
    </ul>
  );
  const totalRow = (n: number) => (
    <div className="flex items-baseline justify-between">
      <span className="text-base font-bold">{tx.total}</span>
      <span className="text-[22px] font-extrabold tabular-nums">{won(n)}</span>
    </div>
  );
  const dashed = <div className="my-3 border-t-2 border-dashed border-[#CBD5E1]" />;

  // 단독 화면은 main·h1. 나란히 비교에 넣으면 바깥 화면의 랜드마크·제목과 겹치지 않게 div·span
  const Root = embedded ? "div" : "main";
  const Title = embedded ? "span" : "h1";
  return (
    <Root
      lang={lang.tts}
      // 글꼴은 키오스크와 같은 시스템 한글 고딕 목록(내려받는 글꼴 없음. next/font Noto Sans KR은 차단 CSS·한글 조각으로 LCP를 늦췄다)
      style={{ ...phoneVars, fontFamily: krFont }}
      // 한국어는 낱말 중간에서 줄을 바꾸지 않는다(keep-all). 일본어·중국어는 keep-all이면 줄이 안 나뉘므로 한국어만
      className={`${lang.tts.startsWith("ko") ? "break-keep [overflow-wrap:break-word]" : ""} ${
        embedded
          ? "relative flex h-[880px] w-[400px] flex-col overflow-hidden max-xl:w-full rounded-[40px] border-[10px] border-neutral-800 bg-[var(--k-bg)] text-[var(--k-text)] shadow-2xl"
          : "relative mx-auto flex h-dvh w-full max-w-md flex-col bg-[var(--k-bg)] text-[var(--k-text)]"
      }`}
      data-phone
    >
      <header className="flex h-14 shrink-0 items-center gap-2 px-4">
        <KiboMark />
        <Title className="text-xl font-black">KIBO</Title>
        <span role="status" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-[var(--k-muted)]">
          <span className={`h-2 w-2 shrink-0 rounded-full ${status ? "bg-[var(--k-teal)]" : "bg-[var(--k-warn)]"}`} aria-hidden />
          <span className="truncate">{status ? (status.kiosk ?? "Bridge Burger") : guideOnly ? tx.guideTitle : tx.notConnected}</span>
        </span>
        <button type="button" onClick={() => setLangOpen(!showLangs)} aria-expanded={showLangs} className="min-h-11 shrink-0 rounded-full border border-[var(--k-line)] px-3 text-sm">
          {lang.label} ▾
        </button>
        <button
          type="button"
          onClick={() => {
            unlockSpeech();
            setSound(!sound);
          }}
          aria-pressed={sound}
          aria-label={tx.sound}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full"
        >
          <SpeakerIcon on={sound} />
        </button>
      </header>

      {showLangs && (
        <div className="grid shrink-0 grid-cols-3 gap-2 px-4 pb-3">
          {langs.map((l) => (
            <button
              key={l.bias}
              type="button"
              onClick={() => {
                unlockSpeech();
                setLang(l);
                saveLang(l.tts.slice(0, 2));
                setLangOpen(null);
              }}
              aria-pressed={l.bias === lang.bias}
              className={`min-h-11 rounded-full border px-2 text-sm ${l.bias === lang.bias ? "border-[var(--k-teal)] bg-[var(--k-teal)] font-bold text-[var(--k-ink)]" : "border-[var(--k-line)]"}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      {/* 키오스크가 첫 화면이고 비어 있으면 띠를 그리지 않는다("첫 화면"만 남는 띠) */}
      {status && !guideOnly && !bandHidden(status) && (
        <div className={`mx-4 shrink-0 rounded-2xl bg-[var(--k-surface)] p-3 ${embedded ? "text-[22px] leading-snug" : "text-base"}`} aria-live="polite">
          {operating ? (
            <>
              <div className="font-bold">{tx.tapping(status.step ?? 0, status.steps ?? 0)}</div>
              <ul className="mt-1.5 space-y-0.5">
                {trail.slice(-3).map((st, i, shown) => {
                  const now = i === shown.length - 1;
                  const l = statusLine(st, lang.tts).label;
                  return (
                    <li key={`${trail.length - shown.length + i}-${l}`} className={`kibo-line flex items-center gap-2 ${now ? "font-semibold" : "text-[var(--k-muted)]"}`}>
                      {now ? (
                        <span className="h-3 w-3 shrink-0 rounded-full bg-[var(--k-teal)] motion-safe:animate-pulse" aria-hidden />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                          <path d="M2 7.5 5.5 11 12 3.5" fill="none" stroke="var(--k-teal)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="kibo-tick" />
                        </svg>
                      )}
                      {l}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 h-1 rounded-full bg-[var(--k-surface2)]">
                <div className="h-1 rounded-full bg-[var(--k-teal)] motion-safe:transition-all" style={{ width: `${(100 * (status.step ?? 0)) / (status.steps ?? 1)}%` }} />
              </div>
              {/* 조작 중에도 담는 품목 이름을 보인다(다른 버거로 바뀌면 사람이 바로 알아채게) */}
              {line?.summary && <div className={`mt-1.5 text-[var(--k-muted)] ${embedded ? "" : "text-sm"}`}>{line.summary}</div>}
            </>
          ) : (
            <div>
              <b>{line?.label}</b>
              {/* 주문 카드·영수증이 떠 있으면 같은 품목·합계를 위에 다시 쓰지 않는다 */}
              {!orderCard && line?.summary && <span className="text-[var(--k-muted)]"> · {line.summary}</span>}
            </div>
          )}
        </div>
      )}

      {/* 위쪽 8px은 감추고 32px까지 흐려 사라지게 한다. 스크롤된 말풍선 윗부분이 위 띠 밑에서 잘려 보이지 않게. 멈춰 있을 때는 위 여백(32px)이라 가려지는 글이 없다 */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 pt-8 pb-4 [mask-image:linear-gradient(to_bottom,transparent,transparent_8px,#000_32px)]" aria-live="polite">
        {empty && (
          <div>
            <p className="text-[28px] leading-tight font-extrabold">{tx.hello}</p>
            <p className="mt-2 text-lg text-[var(--k-muted)]">{guideOnly ? tx.guideHello : tx.helloSub}</p>
            {guideOnly ? (
              // 안내 모드: 사진 찍기와 KIBO 키오스크 QR로 잇기, 두 갈래를 그림과 함께
              <ul className="mt-6 space-y-4 text-lg leading-snug">
                {[
                  [<CameraIcon key="c" />, lang.guide],
                  [<TapIcon key="t" />, lang.pair],
                ].map(([icon, text], i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--k-surface)] text-[var(--k-teal)]">{icon}</span>
                    {text}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-5 space-y-3 text-lg leading-snug text-[var(--k-muted)]">
                {welcomeExamples(status?.kioskId, lang.tts).map((e) => (
                  <li key={e}>“{e}”</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {turns.map((t, i) =>
          t.who === "you" ? (
            <div key={i} className="ml-auto w-fit max-w-[85%] rounded-[20px] bg-[var(--k-teal)] px-4 py-3 text-lg leading-snug text-[var(--k-ink)]">
              {t.text}
            </div>
          ) : (
            <div
              key={i}
              className={`flex w-fit max-w-[85%] gap-2 rounded-[20px] bg-[var(--k-surface)] px-4 py-3 text-lg leading-snug ${t.kind === "ask" ? "border-l-4 border-[var(--k-orange)] font-bold" : t.kind === "error" ? "border-l-4 border-[#F87171]" : ""}`}
              data-turn={t.kind}
            >
              {t.kind === "error" && (
                <span className="mt-0.5 shrink-0 text-[#FCA5A5]">
                  <AlertIcon />
                </span>
              )}
              <span>{t.text}</span>
            </div>
          ),
        )}
        {/* 뗀 뒤 받아쓰기 전에는 내 말풍선을 '…'로 먼저 띄우고, 대답을 기다리는 동안 KIBO 쪽에 청록 점 3개 */}
        {!guideOnly && phase === "sending" && <div className="ml-auto w-fit rounded-[20px] bg-[var(--k-teal)] px-4 py-3 text-lg text-[var(--k-ink)]">…</div>}
        {waiting && (
          <div className="flex w-fit gap-1.5 rounded-[20px] bg-[var(--k-surface)] px-4 py-4" data-thinking>
            {[0, 1, 2].map((d) => (
              <span key={d} className="h-2.5 w-2.5 rounded-full bg-[var(--k-teal)] motion-safe:animate-pulse" style={{ animationDelay: `${d * 200}ms` }} aria-hidden />
            ))}
            <span className="sr-only">{tx.thinking}</span>
          </div>
        )}
        {gate && (
          <div data-gate={gate.what} className={`rounded-2xl border-t-4 bg-[var(--k-paper)] p-4 text-lg leading-snug text-[var(--k-ink)] ${gate.kind === "done" ? "border-[var(--k-teal)]" : "border-[var(--k-orange)]"}`}>
            <div className="mb-2">{gate.kind === "done" ? <CheckIcon size={28} /> : <TapIcon size={28} />}</div>
            <div>{gate.text}</div>
            {gate.kind === "ack" && gate.button && (
              // 카드 글이 길어도 버튼은 화면 아래에 붙어 보이게 한다
              <button
                type="button"
                onClick={() => confirmGate(gate)}
                className="sticky bottom-0 mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--k-orange)] py-4 text-xl font-extrabold text-[var(--k-ink)] shadow-[0_-8px_16px_rgba(248,250,252,0.9)]"
              >
                <CheckIcon /> {gate.button}
              </button>
            )}
          </div>
        )}
        {(orderCard === "review" || orderCard === "paying") && cardLines.length > 0 && (
          <div data-order-card className="rounded-2xl border-t-4 border-[var(--k-orange)] bg-[var(--k-paper)] p-4 text-[var(--k-ink)]">
            <div className="mb-2 text-sm font-bold">{tx.orderTitle}</div>
            {orderLines(cardLines)}
            {dashed}
            {totalRow(status!.total)}
          </div>
        )}
        {(orderCard === "review" || orderCard === "paying") && pay(handoff ?? undefined)}
        {receipt && (
          <div data-order-done className="pt-1">
            <div className="relative z-10 mx-auto -mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--k-teal)] text-[var(--k-ink)]">
              <CheckIcon size={20} />
            </div>
            <div className="rounded-t-2xl bg-[var(--k-paper)] px-5 pt-6 pb-8 text-center text-[var(--k-ink)]" style={zigzag}>
              <p className="sr-only">{tx.paid(receipt.no)}</p>
              <div className="text-sm text-[#475569]">Bridge Burger</div>
              <div className="mt-2 text-sm font-bold">{tx.orderNo}</div>
              <div className="text-[64px] leading-none font-black tabular-nums">{receipt.no}</div>
              {receiptLines.length > 0 && (
                <>
                  {dashed}
                  {orderLines(receiptLines)}
                </>
              )}
              {dashed}
              {totalRow(receipt.total)}
              <div className="mt-2 text-sm text-[#475569] tabular-nums">{tx.paidAt(receipt.at)}</div>
            </div>
          </div>
        )}
        {handoff !== null && !orderCard && pay(handoff)}
        <div ref={endRef} />
      </div>

      <div className="flex shrink-0 flex-col items-center gap-3 px-4 pt-3 pb-6">
        <div className="relative">
          {/* 듣는 동안 청록 물결. 움직임 줄이기 설정이면 멈춘 고리 하나 */}
          {phase === "recording" &&
            [0, 1, 2].map((d) => (
              <span
                key={d}
                className={`pointer-events-none absolute inset-0 rounded-full border-2 border-[var(--k-teal)] motion-safe:animate-ping ${d ? "motion-reduce:hidden" : "motion-reduce:scale-125"}`}
                style={{ animationDelay: `${d * 330}ms` }}
                aria-hidden
              />
            ))}
          {/* 누르는 동안 녹음, 떼면 보냄. 길게 누를 때 메뉴·글자 선택·스크롤이 끼어들지 않게 막는다 */}
          <button
            type="button"
            {...bind}
            data-mic={phase}
            aria-label={phase === "recording" ? tx.listening : phase === "sending" ? tx.sending : tx.hold}
            className={`relative flex h-28 w-28 items-center justify-center rounded-full shadow-lg ${HOLD_CLASS} ${
              phase === "recording"
                ? "scale-105 bg-[var(--k-teal)] text-[var(--k-ink)]"
                : waiting
                  ? "bg-[var(--k-surface2)] text-[var(--k-muted)]"
                  : `bg-[var(--k-orange)] text-[var(--k-ink)] ${asking ? "ring-4 ring-[var(--k-orange)]/40 ring-offset-4 ring-offset-[var(--k-bg)]" : ""}`
            }`}
          >
            <MicIcon size={44} />
          </button>
        </div>
        <div className={`text-center text-base ${phase === "recording" || asking ? "font-bold" : notice ? "font-bold text-[#FCA5A5]" : "text-[var(--k-muted)]"}`} data-phone-hint aria-live="polite">
          {hint}
        </div>
        <form
          className="flex w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(typed);
            setTyped("");
          }}
        >
          {/* 안내 모드: KIBO가 조작할 수 없는 키오스크는 화면을 찍으면 누를 버튼을 알려 준다. 입력 칸의 글을 질문으로 쓴다 */}
          <GuideCamera question={typed} language={lang.bias} tts={lang.tts} onAsked={() => setTyped("")} />
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            maxLength={500}
            placeholder={tx.typeIt}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--k-line)] bg-transparent px-3 py-2 text-base placeholder:text-[var(--k-muted)]"
          />
          {!guideOnly && (
            <button type="submit" className="min-h-11 rounded-xl bg-[var(--k-surface2)] px-4 font-bold text-white">
              {tx.send}
            </button>
          )}
        </form>
      </div>
    </Root>
  );
}
