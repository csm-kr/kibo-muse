"use client";

// 사용자의 휴대폰 화면. 말하면 전사해서 키오스크로 보내고, KIBO의 대답을 사용자의 언어로 읽어 준다.

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { krFont } from "@/kiosks/fastfood/ui/tokens";
import { openLink, type Answer, type Answers, type Link, type LinkGate, type LinkMsg } from "@/sync/link";
import { AnswerChips, type ChipPick } from "./AnswerChips";
import { decodeBlob, PHONE_WAV_RATE, wavAt } from "./audio";
import { useDocLang } from "./docLang";
import { GuideCamera } from "./Guide";
import { AlertIcon, CameraIcon, CheckIcon, KiboMark, MicIcon, SpeakerIcon, TapIcon } from "./icons";
import { followLang, pickLang, saveLang, savedLang, type PhoneLangCode } from "./lang";
import { payStep } from "./pay";
import { nextOrder, type OrderMemo } from "./receipt";
import { unlockAudio } from "./silence";
import { ack, preloadAck, setSound, soundOn, speak, speechBusy, subscribeSound, unlockSpeech } from "./speak";
import { autoListen, bandHidden, bridgeTimeout, expireAsk, linkChip, orderLinesIn, phoneHint, statusLine, tapBridge } from "./status";
import { failLine, phoneText } from "./text";
import { KioskCard } from "./KioskCard";
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
// switched: 이 대답을 받으며 말한 언어를 따라 휴대폰 언어를 바꿨다(대답 위에 한 줄과 되돌리기)
type Turn = { who: "you" | "kibo"; text: string; kind?: "ask" | "error"; switched?: { from: PhoneLangCode; to: PhoneLangCode }; answers?: Answers };
type Status = Extract<LinkMsg, { type: "status" }>;

// embedded: 나란히 비교 화면(/compare) 안에 휴대폰 모양으로 넣는다
export function Phone({ room: roomProp, embedded = false }: { room?: string; embedded?: boolean } = {}) {
  // 기본 언어: 주소 ?lang= → 칩으로 고른 값(저장) → 브라우저 언어. 서버 렌더에서는 English
  const initialCode = useSyncExternalStore(noop, () => pickLang([new URLSearchParams(location.search).get("lang"), savedLang(), ...navigator.languages]), () => "en");
  const [picked, setLang] = useState<(typeof langs)[number] | null>(null);
  const lang = picked ?? langs.find((l) => l.tts.startsWith(initialCode))!;
  // 지금 휴대폰 언어(링크 구독 안에서 읽는다)와, 이번 화면에서 사람이 언어 칩·되돌리기로 직접 골랐는가(골랐으면 말한 언어를 따라 바꾸지 않는다)
  const langRef = useRef(lang);
  const userPickedRef = useRef(false);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  const pickByHand = (code: PhoneLangCode) => {
    userPickedRef.current = true;
    setLang(langs.find((x) => x.tts.startsWith(code))!);
    saveLang(code);
  };
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
  // 마지막으로 받은 키오스크 화면(첫 화면으로 돌아간 순간을 알아보려고)
  const screenRef = useRef<string | null>(null);
  // 마이크 아래 한 줄 안내(너무 짧게 누름, 마이크 막힘)
  const [notice, setNotice] = useState<string | null>(null);
  // 화면 읽기: 두 번 탭으로 녹음을 시작하면 한 번 알린다(녹음 중에만 둔다)
  const [toggleNote, setToggleNote] = useState<string | null>(null);
  // 이어 듣기: 탭으로 한 번 말을 시작하면, 대답을 다 읽은 뒤 누르지 않아도 다시 듣는다. 못 알아들음이 이어진 횟수
  const [convo, setConvo] = useState(false);
  const [fails, setFails] = useState(0);
  // 지금 시작하는 녹음이 이어 듣기인가(사람의 누름이 아님)
  const autoRef = useRef(false);
  // 대답이 'KIBO가 누른다'였고 키오스크의 조작 중 상태가 아직 오지 않은 동안(tapBridge)
  const [willTap, setWillTap] = useState(false);
  useEffect(() => {
    return bridgeTimeout(willTap, () => setWillTap(false));
  }, [willTap]);
  // 키오스크와의 길: 지금 연결됐는가(모르면 null), 한 번이라도 연결됐는가
  const [conn, setConn] = useState<{ live: boolean | null; was: boolean }>({ live: null, was: false });
  const endRef = useRef<HTMLDivElement>(null);
  // 마이크가 화면 밖인가(페이지가 스크롤되는 작은 화면에서 영수증을 보는 중). 그러면 아래에 작은 '말하기'를 띄운다
  const micRef = useRef<HTMLDivElement>(null);
  const [micAway, setMicAway] = useState(false);
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
    if (!box) return;
    // 높이 460px 이하에서는 페이지가 스크롤된다: 창을 맨 아래로 내려 새 말과 마이크가 보이게
    if (getComputedStyle(box).overflowY === "visible") scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    else box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [turns, handoff, gate, orderCard, thinking]);

  // 결제를 마쳐 영수증이 새로 뜨면 대화 칸을 영수증으로 올린다. 글씨를 키운 작은 화면에서 맨 아래로 내리면 주문번호가 위로 잘린다.
  // 영수증 맨 위부터 번호 끝까지가 칸에 들어가면 영수증 맨 위로, 아니면 '주문 번호' 줄로. 위의 '맨 아래로' 효과보다 뒤에 있어야 같은 렌더에서 이것이 이긴다
  const receiptNo = order.receipt?.no;
  useEffect(() => {
    const box = endRef.current?.parentElement;
    const card = box?.querySelector<HTMLElement>("[data-order-done]");
    const no = card?.querySelector<HTMLElement>("[data-order-no]");
    if (!box || !card || !no) return;
    // 높이 460px 이하에서는 칸 대신 페이지가 스크롤된다: 창을 영수증으로 옮긴다
    const pageScroll = getComputedStyle(box).overflowY === "visible";
    const view = pageScroll ? innerHeight : box.clientHeight;
    const fits = no.getBoundingClientRect().bottom - card.getBoundingClientRect().top <= view;
    const el = fits ? card : no;
    if (pageScroll) scrollTo({ top: el.getBoundingClientRect().top + scrollY, behavior: "smooth" });
    else box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop, behavior: "smooth" });
  }, [receiptNo]);

  // 키오스크가 대답하지 않으면(닫힘 등) 생각 중 표시를 오래 두지 않는다. 말없이 끝내지 않고, 왜 멈췄는지 휴대폰 언어로 보이고 읽어 준다
  useEffect(() => {
    if (!thinking) return;
    const t = setTimeout(() => {
      setThinking(false);
      const say = failLine(tx, navigator.onLine, tx.noAnswer);
      setTurns((x) => [...x, { who: "kibo", text: say, kind: "error" }]);
      speak(say, lang.tts);
    }, 25000);
    return () => clearTimeout(t);
  }, [thinking, tx, lang.tts]);

  useEffect(() => {
    if (!room) return;
    // 같은 브라우저 안(나란히 비교의 내장 휴대폰)과, Supabase 키가 있으면 다른 기기의 키오스크를 함께 잇는다
    const link = openLink(room);
    linkRef.current = link;
    const off = link.subscribe((m) => {
      setWillTap((w) => tapBridge(w, m));
      if (m.type === "status") {
        // 되물은 뒤 키오스크가 첫 화면으로 돌아갔으면(시간 초과) 남은 물음을 지우고 한 번 알린다
        const prev = screenRef.current;
        const resetLine = phoneText(langRef.current.tts).kioskReset;
        screenRef.current = m.screen;
        setTurns((t) => expireAsk(t, prev, m.screen, resetLine));
        setStatus(m);
        if (m.kioskId === "fastfood") setOrder((o) => nextOrder(o, m, new Date()));
        // hello에 대한 답에는 지금 떠 있는 카드가 붙어 온다(끊긴 동안 놓친 카드)
        if (m.gate !== undefined) {
          setGate(m.gate);
          cardRef.current = m.gate;
        }
        if (m.busy && m.steps && m.label) setTrail((t) => (m.step === 1 && t.at(-1)?.screen !== m.screen ? [m] : t.at(-1)?.screen === m.screen ? t : [...t, m]));
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
        setNotice(null);
        // 휴대폰 언어와 분명히 다른 언어로 말해 그 언어로 답했으면(followSpoken) 휴대폰도 그 언어로 바꾸고 대답 위에 한 줄로 알린다.
        // 이번 화면에서 사람이 직접 고른 언어는 바꾸지 않는다. 바꾼 언어는 저장하지 않는다(빌려준 휴대폰의 다음 사람)
        const from = langRef.current.tts.slice(0, 2) as PhoneLangCode;
        const to = followLang(m, from, userPickedRef.current);
        if (to) {
          langRef.current = langs.find((x) => x.tts.startsWith(to))!;
          setLang(langRef.current);
        }
        if (m.say) setTurns((t) => [...t, { who: "kibo", text: m.say, kind: m.result === "clarify" ? "ask" : m.result === "error" ? "error" : undefined, ...(to && { switched: { from, to } }), ...(m.answers && { answers: m.answers }) }]);
        if (m.result !== "busy") {
          setHandoff(null);
          setGate(null);
          cardRef.current = null;
        }
        speak(m.say, m.replyLanguage);
      }
      if (m.type === "done") {
        if (m.say) setTurns((t) => [...t, { who: "kibo", text: m.say, ...(m.answers && { answers: m.answers }) }]);
        setHandoff(m.paymentHandoff ? (m.payButton ?? "") : null);
        setGate(m.gate);
        cardRef.current = m.gate;
        // 앞 대답('N번 누를게요')을 끊지 않고 다 읽은 뒤 읽는다(Gemini 목소리는 0.75초 늦게 시작해 탭이 짧으면 끊겼다)
        speak([m.say, m.gate?.text].filter(Boolean).join(" "), m.replyLanguage, { after: true });
      }
    });
    // (다시) 연결될 때마다, 그리고 휴대폰 화면을 다시 켤 때마다 hello로 키오스크의 지금 상태를 받는다
    const offJoin = link.onJoin(() => link.send({ type: "hello" }));
    const offLive = link.onLive((live) => setConn((c) => ({ live, was: c.was || live })));
    const onVisible = () => document.visibilityState === "visible" && link.send({ type: "hello" });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      offJoin();
      offLive();
      document.removeEventListener("visibilitychange", onVisible);
      link.close();
    };
  }, [room, roomProp]);

  // 답 칩: 키오스크로 보내거나, 보낼 일이 없으면(더 주문할게요) 내 말과 KIBO 고정 턴을 바로 붙이고 읽어 준다
  function pickChip(c: ChipPick) {
    // 이어 듣기 중에 답 칩을 누르면 듣던 것은 보내지 않고 멈춘다
    cancel();
    if ("send" in c) return send(c.send, c.answer);
    setTurns((t) => [...t, { who: "you", text: c.local }, { who: "kibo", text: c.reply }]);
    speak(c.reply, lang.tts);
  }

  // answer: 되묻기 답 칩의 정해진 답(키오스크가 Spark 없이 바로 계획한다)
  function send(text: string, answer?: Answer) {
    if (!text.trim() || guideOnly) return;
    // 지난 오류 안내가 남아 되묻기·조작 중·결제 안내를 덮지 않게
    setNotice(null);
    setWillTap(false);
    setTurns((t) => [...t, { who: "you", text }]);
    // 키오스크와 이어져 있을 때만 대답을 기다린다
    if (status) setThinking(true);
    // 새로 말하면 떠 있던 관문 카드는 낡는다(답이 바뀔 수 있다). 새 카드가 오면 다시 뜬다
    setGate(null);
    const card = cardRef.current;
    linkRef.current?.send({ type: "utterance", id: crypto.randomUUID(), text, lang: lang.bias, ...(card?.kind === "ack" && card.id && { gateId: card.id }), ...(answer && { answer }) });
  }

  // 뗀 뒤 녹음본을 받아쓰기로 보낸다
  async function onTake({ blob }: Take) {
    // 보내는 순간 "네, 잠시만요"를 바로 들려준다(대답까지 조용히 기다리지 않게). 안내 모드는 말이 곧장 보내지지 않는다
    if (!guideOnly) void ack(lang.tts);
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
    else if (body.transcript) {
      setFails(0);
      send(body.transcript);
    }
    // 한도·크기 초과·받아쓰기 실패는 서버가 휴대폰 언어로 만든 고정 문구(say)를 보낸다. 없으면(빈 받아쓰기, 400) 휴대폰 문구.
    // 글을 읽기 어려운 사람도 알 수 있게 대답처럼 읽어 준다
    else {
      setFails((f) => f + 1);
      const say = failLine(tx, navigator.onLine, body.say ?? tx.retry);
      setTurns((t) => [...t, { who: "kibo", text: say, kind: "error" }]);
      speak(say, lang.tts);
    }
  }

  // 반 넘게 가려지면 화면 밖으로 본다. /compare 안의 휴대폰은 페이지와 함께 스크롤되므로 보지 않는다
  useEffect(() => {
    const el = micRef.current;
    if (!el || embedded || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setMicAway(e.intersectionRatio < 0.5), { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, [embedded]);

  const hearingRef = useRef(false);
  const { phase, bind, listen, cancel } = useHoldToTalk({
    onPress: () => {
      const auto = autoRef.current;
      autoRef.current = false;
      setNotice(null);
      setToggleNote(null);
      setWillTap(false);
      // 이어 듣기는 사람의 누름이 아니다: 소리 잠금은 이미 풀렸고, 되묻기 답 칩은 그대로 둔다(말 대신 눌러도 된다)
      if (auto) return;
      unlockSpeech();
      // 말 끝을 재는 오디오 처리기를 누르는 동안 깨운다(iOS). 이어 듣기에서도 이것을 쓴다
      unlockAudio();
      setFails(0);
      // 말하기 시작하면 관문 카드를 숨긴다. 말하는 동안 옛 카드를 누르지 않게
      setGate(null);
      // 되묻기 답 칩도 거둔다(말로 답하기로 했다)
      setTurns((t) => (t.at(-1)?.answers ? t.map((x) => ({ ...x, answers: undefined })) : t));
    },
    onRecording: () => {
      hearingRef.current = true;
      preloadAck(lang.tts);
      linkRef.current?.send({ type: "listening" });
    },
    onTake,
    onTooShort: () => setNotice(tx.tooShort),
    onBlocked: () => {
      setConvo(false);
      setNotice(tx.micBlocked);
    },
    onFailed: () => {
      setFails((f) => f + 1);
      setNotice(tx.retry);
    },
    onAllowRetry: () => setNotice(tx.allowRetry),
    onTooLong: () => setNotice(tx.tooLong),
    onToggleOn: () => {
      setToggleNote(tx.toggleOn);
      if (!guideOnly) setConvo(true);
    },
    // 말소리를 8초 동안 못 들었다: 이어 듣기를 끝내고 다시 누르기를 기다린다
    onNoSpeech: () => {
      setConvo(false);
      setNotice(tx.noSpeech);
    },
  });
  // 말을 보내지 않고 쉬는 상태로 돌아오면(빈 받아쓰기·실패) 키오스크의 'Listening' 띠를 끈다. 말을 보냈으면 키오스크가 이미 껐다
  useEffect(() => {
    // 손을 떼고 받아쓰는 동안은 키오스크 띠를 'Understanding'으로 바꾼다
    if (phase === "sending" && hearingRef.current) linkRef.current?.send({ type: "listening", heard: true });
    if (phase !== "idle" || !hearingRef.current) return;
    hearingRef.current = false;
    linkRef.current?.send({ type: "listening", end: true });
  }, [phase]);

  function confirmGate(g: LinkGate) {
    cancel();
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
  // 보낸 뒤 3초가 지나도 대답이 없으면 안내 줄을 '주문을 이해하는 중이에요 · 보통 5–10초'로 바꾼다(소리·알림은 더하지 않는다)
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    const stop = bridgeTimeout(waiting, () => setLongWait(true), 3000);
    return () => {
      stop?.();
      setLongWait(false);
    };
  }, [waiting]);
  // 이어 듣기: 결제 안내·영수증이 뜨면(주문 끝) 끝낸다. 화면을 숨기면(잠금·앱 전환) 끝낸다
  useEffect(() => {
    if (handoff !== null || receipt) setConvo(false);
  }, [handoff, receipt]);
  useEffect(() => {
    const off = () => document.visibilityState === "hidden" && setConvo(false);
    document.addEventListener("visibilitychange", off);
    return () => document.removeEventListener("visibilitychange", off);
  }, []);
  // 대답을 다 읽고 키오스크가 다 누른 뒤 다시 듣는다. 읽는 중이면 끝날 때까지 기다린다(자기 목소리를 듣지 않게)
  const relisten = autoListen({ convo, idle: phase === "idle", waiting, operating: !!operating || willTap, handoff: handoff !== null, receipt: !!receipt, gate: !!gate, fails });
  useEffect(() => {
    if (!relisten) return;
    let t = setTimeout(function tick() {
      if (speechBusy()) {
        t = setTimeout(tick, 250);
        return;
      }
      // 마이크는 listen() 안에서 바로 onPress를 부른다. 시작하지 못했어도 다음 사람 누름이 이어 듣기로 보이지 않게 되돌린다
      autoRef.current = true;
      listen();
      autoRef.current = false;
    }, 600);
    return () => clearTimeout(t);
  }, [relisten, listen]);
  const last = turns.at(-1);
  const asking = !waiting && !operating && last?.who === "kibo" && last.kind === "ask";
  // 언어 격자는 대화가 없고 키오스크가 첫 화면일 때만 펼친다. 그 밖에는 머리의 언어 버튼으로 연다
  // 영수증이 떠 있으면 펼치지 않는다(영수증이 맨 위에 오게)
  const chip = linkChip(!!status, conn.live, conn.was);
  const showLangs = langOpen ?? (turns.length === 0 && !receipt && (!status || status.screen === "idle"));
  const empty = turns.length === 0 && !gate && !orderCard && !receipt && handoff === null && !waiting;
  const hint = phoneHint(tx, { recording: phase === "recording", toggled: toggleNote !== null, waiting, longWait: waiting && longWait, notice, operating: !!operating || (willTap && chip === "kiosk"), asking, orderCard });
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
          : "relative mx-auto flex h-dvh w-full max-w-md flex-col bg-[var(--k-bg)] text-[var(--k-text)] [@media(max-height:460px)]:h-auto [@media(max-height:460px)]:min-h-dvh"
      }`}
      data-phone
    >
      {/* 글씨 200%처럼 아주 좁으면(240px 이하) 표식을 숨기고 KIBO 글자는 화면 읽기용으로만 두며, 언어 단추는 줄어든다. 한 줄을 지켜 가로로 넘치지 않게 */}
      <header className="flex h-14 shrink-0 items-center gap-2 px-4 max-[240px]:gap-1 max-[240px]:px-2">
        <span className="contents max-[240px]:hidden">
          <KiboMark />
        </span>
        <Title className="text-xl font-black max-[240px]:sr-only">KIBO</Title>
        <span role="status" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-[var(--k-muted)]">
          <span className={`h-2 w-2 shrink-0 rounded-full ${chip === "kiosk" ? "bg-[var(--k-teal)]" : "bg-[var(--k-warn)]"}`} aria-hidden />
          <span className="truncate">{chip === "kiosk" ? (status?.kiosk ?? "Bridge Burger") : chip === "reconnecting" ? tx.reconnecting : guideOnly ? tx.guideTitle : tx.notConnected}</span>
        </span>
        <button type="button" onClick={() => setLangOpen(!showLangs)} aria-expanded={showLangs} aria-label={`${tx.language}: ${lang.label}`} className="min-h-11 min-w-0 truncate rounded-full border border-[var(--k-line)] px-3 text-sm max-[240px]:px-2">
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

      {/* 실시간 키오스크 카드: 짝지은 휴대폰에만. 지금 화면과 담은 것(누르면 펼침). KIBO가 누를 때도 사람이 만질 때도 status로 바뀐다 */}
      {status && !guideOnly && <KioskCard status={status} language={lang.tts} />}

      {showLangs && (
        <div className="grid shrink-0 grid-cols-3 gap-2 px-4 pb-3 max-[300px]:grid-cols-2">
          {langs.map((l) => (
            <button
              key={l.bias}
              type="button"
              onClick={() => {
                unlockSpeech();
                pickByHand(l.tts.slice(0, 2) as PhoneLangCode);
                setLangOpen(null);
              }}
              aria-pressed={l.bias === lang.bias}
              className={`min-h-11 rounded-full border px-2 text-sm break-keep ${l.bias === lang.bias ? "border-[var(--k-teal)] bg-[var(--k-teal)] font-bold text-[var(--k-ink)]" : "border-[var(--k-line)]"}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      {/* 키오스크가 첫 화면이고 비어 있으면 띠를 그리지 않는다("첫 화면"만 남는 띠) */}
      {status && !guideOnly && !bandHidden(status) && (
        // KIBO가 누르지 않을 때 보이는 정보(화면 이름·요약)는 위 키오스크 카드가 보인다. 띠는 화면 읽기용(role=status)으로만 남긴다
        <div className={operating ? `mx-4 shrink-0 rounded-2xl bg-[var(--k-surface)] p-3 ${embedded ? "text-[22px] leading-snug" : "text-base"}` : "sr-only"}>
          {/* 화면 읽기에는 띠를 탭마다 읽히지 않는다(14번 누르면 27번 읽혀 대답·'결제는 직접'이 묻혔다). 누르기 시작('14번 누릅니다')과 끝난 화면만 한 번씩 */}
          <p className="sr-only" role="status">
            {operating ? tx.tapStart(status.steps ?? 0) : `${line?.label ?? ""}${!orderCard && line?.summary ? ` · ${line.summary}` : ""}`}
          </p>
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
          ) : null}
        </div>
      )}

      {/* 위쪽 8px은 감추고 32px까지 흐려 사라지게 한다. 스크롤된 말풍선 윗부분이 위 띠 밑에서 잘려 보이지 않게. 멈춰 있을 때는 위 여백(32px)이라 가려지는 글이 없다 */}
      {/* 높이 460px 이하(글씨를 크게 키운 휴대폰)에서는 이 칸만이 아니라 페이지 전체가 스크롤된다. 영수증 번호까지 늘 닿게. 입력 줄이 두 줄이 되는 SE 150%(445px)·iPhone 13 200%(422px)도 넣는다 */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 pt-8 pb-4 [mask-image:linear-gradient(to_bottom,transparent,transparent_8px,#000_32px)] [@media(max-height:460px)]:overflow-visible [@media(max-height:460px)]:[mask-image:none]" aria-live="polite" role="log" tabIndex={0} aria-label={tx.chat}>
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
              {/* 말한 사람은 색·정렬로만 보이므로 화면 읽기에는 글로 */}
              <span className="sr-only">{tx.me} </span>
              {t.text}
            </div>
          ) : (
            <Fragment key={i}>
              {/* 말한 언어를 따라 휴대폰 언어를 바꿨으면 대답 위에 한 줄(바뀐 언어로). 마지막으로 바꾼 줄에만, 아직 그 언어일 때 되돌리기(원래 언어 이름) */}
              {t.switched && (
                <div className="flex flex-wrap items-center gap-x-2 text-sm text-[var(--k-muted)]" data-lang-switch>
                  <span>{phoneText(t.switched.to).switched}</span>
                  {i === turns.findLastIndex((x) => x.switched) && lang.tts.startsWith(t.switched.to) && (
                    <>
                      <span aria-hidden>·</span>
                      <button type="button" onClick={() => pickByHand(t.switched!.from)} aria-label={phoneText(t.switched.from).switchBack} className="min-h-11 rounded-full border border-[var(--k-line)] px-3 font-bold text-[var(--k-text)]">
                        ↩ {langs.find((x) => x.tts.startsWith(t.switched!.from))?.label}
                      </button>
                    </>
                  )}
                </div>
              )}
              <div
                className={`flex w-fit max-w-[85%] gap-2 rounded-[20px] bg-[var(--k-surface)] px-4 py-3 text-lg leading-snug ${t.kind === "ask" ? "border-l-4 border-[var(--k-orange)] font-bold" : t.kind === "error" ? "border-l-4 border-[#F87171]" : ""}`}
                data-turn={t.kind}
              >
                {t.kind === "error" && (
                  <span className="mt-0.5 shrink-0 text-[#FCA5A5]">
                    <AlertIcon />
                  </span>
                )}
                <span>
                  <span className="sr-only">KIBO: </span>
                  {t.text}
                </span>
              </div>
              {/* 되묻기 답 칩은 마지막 대답에만. 새 말·대답이 오면(마지막이 아니면) 사라진다 */}
              {t.answers && i === turns.length - 1 && <AnswerChips kind={t.answers} language={lang.tts} onPick={pickChip} />}
            </Fragment>
          ),
        )}
        {/* 뗀 뒤 받아쓰기 전에는 내 말풍선을 '…'로 먼저 띄우고, 대답을 기다리는 동안 KIBO 쪽에 청록 점 3개 */}
        {!guideOnly && phase === "sending" && (
          <div className="ml-auto w-fit rounded-[20px] bg-[var(--k-teal)] px-4 py-3 text-lg text-[var(--k-ink)]" aria-hidden>
            …
          </div>
        )}
        {waiting && (
          <div className="flex w-fit gap-1.5 rounded-[20px] bg-[var(--k-surface)] px-4 py-4" data-thinking>
            {[0, 1, 2].map((d) => (
              <span key={d} className="h-2.5 w-2.5 rounded-full bg-[var(--k-teal)] motion-safe:animate-pulse" style={{ animationDelay: `${d * 200}ms` }} aria-hidden />
            ))}
            {/* '생각하고 있어요'는 마이크 아래 안내 줄이 한 번 알린다(여기서도 읽으면 턴마다 두 번) */}
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
              <div data-order-no>
                <div className="mt-2 text-sm font-bold">{tx.orderNo}</div>
                <div className="text-[64px] leading-none font-black tabular-nums [@media(max-height:400px)]:text-[44px]">{receipt.no}</div>
              </div>
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
        <div ref={micRef} className="relative">
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
            aria-label={phase === "recording" ? (toggleNote ? tx.toggleOn : tx.listening) : phase === "sending" ? tx.sending : tx.hold}
            className={`relative flex h-28 w-28 items-center justify-center rounded-full shadow-lg [@media(max-height:600px)]:h-20 [@media(max-height:600px)]:w-20 [@media(max-height:400px)]:h-16! [@media(max-height:400px)]:w-16! forced-colors:border-2 ${HOLD_CLASS} ${
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
        <div className={`text-center text-base ${phase === "recording" || asking ? "font-bold" : notice ? "font-bold text-[#FCA5A5]" : "text-[var(--k-muted)]"}`} data-phone-hint aria-live={phase === "recording" ? undefined : "polite"}>
          {/* 기다리는 동안은 화면 읽기에 '생각하고 있어요'만 한 번 알린다. 보이는 두 글은 미리 그려 두고 3초 뒤에는 class만 바꾼다(글자가 바뀌지 않아 알림이 늘지 않는다) */}
          {waiting ? (
            <>
              {[tx.thinking, tx.waitLong].map((s) => (
                <span key={s} aria-hidden className={s === hint ? undefined : "hidden"}>
                  {s}
                </span>
              ))}
              <span className="sr-only">{tx.thinking}</span>
            </>
          ) : (
            hint
          )}
        </div>
        {/* 녹음 중에는 위 안내 줄을 알리지 않는다(화면 읽기 음성이 녹음에 섞이지 않게). 두 번 탭으로 시작했을 때만 한 번 */}
        <p className="sr-only" role="status">
          {phase === "recording" ? toggleNote : null}
        </p>
        {/* 좁으면(글씨를 키운 휴대폰) 입력 칸을 윗줄 전체로, 카메라·보내기는 아랫줄로 */}
        <form
          className="flex w-full gap-2 max-[340px]:flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            // 글로만 보내는 사람도 iPhone에서 대답을 들을 수 있게(소리 잠금은 사용자 동작 안에서만 풀린다)
            unlockSpeech();
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
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--k-line)] bg-transparent px-3 py-2 text-base placeholder:text-[var(--k-muted)] max-[340px]:order-first max-[340px]:basis-full"
          />
          {!guideOnly && (
            <button type="submit" className="min-h-11 rounded-xl bg-[var(--k-surface2)] px-4 font-bold text-white forced-colors:border-2 max-[340px]:flex-1">
              {tx.send}
            </button>
          )}
        </form>
      </div>
      {/* 페이지가 스크롤되는 작은 화면(높이 460px 이하)에서 마이크가 화면 밖이면 오른쪽 아래의 작은 누르고 말하기. 마이크와 같은 동작 */}
      {!embedded && (
        <button
          type="button"
          {...bind}
          data-mic-shortcut
          className={`fixed right-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 hidden min-h-11 items-center gap-1.5 rounded-full px-4 font-bold shadow-lg [@media(max-height:460px)]:flex ${HOLD_CLASS} ${micAway ? "" : "invisible"} ${
            phase === "recording" ? "bg-[var(--k-teal)] text-[var(--k-ink)]" : waiting ? "bg-[var(--k-surface2)] text-[var(--k-muted)]" : "bg-[var(--k-orange)] text-[var(--k-ink)]"
          }`}
        >
          <MicIcon size={20} />
          {tx.talk}
        </button>
      )}
    </Root>
  );
}
