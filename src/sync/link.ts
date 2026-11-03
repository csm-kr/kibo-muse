// 휴대폰과 키오스크를 잇는 통로. 늘 같은 브라우저 안 길(BroadcastChannel)로 보내고, Supabase 키가 있으면
// 다른 기기 길(Realtime broadcast, 채널 kibo:<room>, DB 테이블은 쓰지 않음)로도 함께 보낸다(bothLink).
// 그래서 나란히 비교·영상 화면의 키오스크는 내장 휴대폰과 실제 휴대폰을 함께 받는다.
import { RealtimeClient } from "@supabase/realtime-js";
import type { CartLine, Draft } from "@/kiosks/fastfood/machine";

export type LinkMsg =
  // 휴대폰 → 키오스크: 사용자가 한 말(전사문). id로 같은 메시지가 두 번 와도 한 번만 처리한다
  // gateId: 말할 때 휴대폰에 떠 있던 관문 카드의 id('예'는 이 카드에만 동의로 쓰인다)
  | { type: "utterance"; id?: string; text: string; lang: string; gateId?: string }
  // 휴대폰 → 키오스크: 막 연결했으니 지금 상태를 알려 달라
  | { type: "hello" }
  // 휴대폰 → 키오스크: 마이크를 눌렀다(나란히 비교의 시작 시각)
  | { type: "listening" }
  // 휴대폰 → 키오스크: 사람만 할 수 있는 확인(위험물 동의, 체크인 확정)을 휴대폰 버튼으로 했다. gateId = 그 카드의 id
  | { type: "ack"; what: string; gateId?: string }
  // 키오스크 → 휴대폰: 말 한 번에 정확히 한 번 오는 대답. re = 그 말의 id. plan이면 고정 문구, clarify면 Spark의 질문
  | { type: "reply"; re: string; say: string; replyLanguage: string; result: "plan" | "clarify" | "reject" | "error" | "busy"; taps?: number; }
  // 키오스크 → 휴대폰: 해석이 오래 걸린다(고정 문구 '아직 생각 중'). 대답(reply)은 그 뒤에 따로 온다
  | { type: "slow"; re: string; say: string; replyLanguage: string }
  // 키오스크 → 휴대폰: 재생이 끝난 뒤의 결과. gate는 사람이 해야 할 다음 일(고정 안내문). 재생이 성공해야 보낸다
  | { type: "done"; re: string; ok: boolean; say: string; replyLanguage: string; gate: LinkGate | null; paymentHandoff?: boolean; payButton?: string; }
  // 키오스크 → 휴대폰: 지금 화면과 조작 진행. kiosk·summary는 공항처럼 장바구니가 없는 키오스크용.
  // gate는 hello에 답할 때만 붙는다(지금 떠 있는 카드, 없으면 null). 다시 연결한 휴대폰이 카드를 잃지 않게
  // lines: 주문 확인·결제 화면의 품목 줄(휴대폰 주문 확인 카드). paid: 사람이 결제를 마친 뒤의 주문번호(시연용 모의 결제)
  | { type: "status"; screen: string; busy: boolean; step?: number; steps?: number; items: number; total: number; kiosk?: string; kioskId?: string; summary?: string; label?: string; gate?: LinkGate | null; lines?: { name: string; detail: string; qty: number }[]; paid?: number; air?: TripAir; rail?: TripRail; cart?: CartLine[]; draft?: Draft | null; kioskLang?: "en" | "ko"; };

// 공항·기차 상태의 데이터. 휴대폰이 이것으로 자기 언어 요약을 만든다(없으면, 즉 옛 키오스크면 summary 글을 쓴다)
export interface TripAir {
  airline: string | null;
  passports: number;
  seats: string[];
}
export interface TripRail {
  from: string;
  to: string | null;
  people: number;
  // "7-1A" 꼴(호차-좌석)
  seats: string[];
}

export interface LinkGate {
  kind: "ack" | "device" | "done";
  what: string;
  text: string;
  button?: string;
  // 카드마다 새로 붙는 id. 확인(ack)은 이 id로 그 카드에 묶인다
  id?: string;
}

export interface Link {
  send(msg: LinkMsg): void;
  subscribe(fn: (msg: LinkMsg) => void): () => void;
  // 통로가 열릴 때마다(다시 연결 포함) 부른다. 휴대폰은 여기서 hello를 보내 키오스크 상태를 다시 받는다
  onJoin(fn: () => void): () => void;
  close(): void;
}

export function localLink(room: string): Link {
  const ch = new BroadcastChannel(`kibo:${room}`);
  const fns = new Set<(m: LinkMsg) => void>();
  ch.onmessage = (e: MessageEvent<LinkMsg>) => fns.forEach((f) => f(e.data));
  return {
    send: (m) => ch.postMessage(m),
    subscribe: (f) => {
      fns.add(f);
      return () => fns.delete(f);
    },
    // BroadcastChannel은 늘 열려 있다. 호출한 쪽이 구독을 마친 뒤 한 번 부른다
    onJoin: (f) => {
      let live = true;
      queueMicrotask(() => live && f());
      return () => {
        live = false;
      };
    },
    close: () => ch.close(),
  };
}

// Supabase Realtime에서 쓰는 만큼의 모양. 테스트는 가짜 서버를 넣는다
export interface RealtimeChannelLike {
  on(type: "broadcast", filter: { event: string }, cb: (p: { payload: unknown }) => void): RealtimeChannelLike;
  subscribe(cb?: (status: string) => void): RealtimeChannelLike;
  send(m: { type: "broadcast"; event: string; payload: unknown }): Promise<unknown>;
}
export interface RealtimeLike {
  channel(name: string, opts: { config: { broadcast: { self: boolean } } }): RealtimeChannelLike;
  removeChannel(ch: RealtimeChannelLike): unknown;
  disconnect?(): unknown;
}

// 접속 전·끊긴 동안 보낸 것은 모았다가 (다시) 접속하면 보낸다. 오래 끊기면 오래된 것부터 버린다
const MAX_QUEUED = 50;
// 말과 확인은 15초 넘게 묵으면 버린다(다시 연결된 순간 그때 떠 있는 다른 카드에 닿지 않게)
const STALE_MS = 15_000;
const expires = (m: LinkMsg) => m.type === "utterance" || m.type === "ack";

// 한 클라이언트 안에서 같은 이름의 채널은 하나로 합쳐진다(Supabase가 같은 채널을 돌려주고, self:false라 서로 못 받는다).
// 그래서 같은 화면 안 연결은 localLink를 쓰고, openLink는 연결마다 클라이언트를 따로 만든다(닫는 중인 채널을 다시 받지 않게)
export function supabaseLink(room: string, client: RealtimeLike): Link {
  const fns = new Set<(m: LinkMsg) => void>();
  const joins = new Set<() => void>();
  let queue: { m: LinkMsg; at: number }[] = [];
  let joined = false;
  let closed = false;
  const push = (m: LinkMsg) => void ch.send({ type: "broadcast", event: "msg", payload: m });
  const ch = client.channel(`kibo:${room}`, { config: { broadcast: { self: false } } }).on("broadcast", { event: "msg" }, ({ payload }) => {
    if (!closed) fns.forEach((f) => f(payload as LinkMsg));
  });
  // 이미 접속된 채널이면 subscribe가 콜백을 바로 부른다. ch를 먼저 만든 뒤 구독한다
  ch.subscribe((status) => {
    joined = status === "SUBSCRIBED";
    if (!joined || closed) return;
    const pending = queue;
    queue = [];
    const now = Date.now();
    pending.forEach(({ m, at }) => (!expires(m) || now - at <= STALE_MS) && push(m));
    joins.forEach((f) => f());
  });
  return {
    send: (m) => {
      if (closed) return;
      if (joined) push(m);
      else queue = [...queue, { m, at: Date.now() }].slice(-MAX_QUEUED);
    },
    subscribe: (f) => {
      fns.add(f);
      return () => fns.delete(f);
    },
    onJoin: (f) => {
      joins.add(f);
      if (joined) queueMicrotask(() => joins.has(f) && f());
      return () => joins.delete(f);
    },
    close: () => {
      closed = true;
      fns.clear();
      joins.clear();
      void Promise.resolve(client.removeChannel(ch)).then(() => client.disconnect?.());
    },
  };
}

// 여러 길로 함께 보낸다. 메시지마다 eid(메시지 id)와 from(이 연결의 id)을 붙여, 받는 쪽은 자기가 보낸 것과
// 두 길로 겹쳐 온 것(최근 eid SEEN_MAX개)을 버리고 eid·from을 뗀 메시지만 넘긴다
type Wire = LinkMsg & { eid?: string; from?: string };
const SEEN_MAX = 200;

export function bothLink(paths: Link[], from: string = crypto.randomUUID()): Link {
  const fns = new Set<(m: LinkMsg) => void>();
  const seen = new Set<string>();
  const receive = (w: Wire) => {
    if (w.from === from) return;
    if (w.eid) {
      if (seen.has(w.eid)) return;
      seen.add(w.eid);
      // Set은 넣은 순서를 지키므로 첫 값이 가장 오래된 eid다
      if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value!);
    }
    const m: Wire = { ...w };
    delete m.eid;
    delete m.from;
    fns.forEach((f) => f(m));
  };
  const offs = paths.map((p) => p.subscribe(receive));
  return {
    send: (m) => {
      const w: Wire = { ...m, eid: crypto.randomUUID(), from };
      paths.forEach((p) => p.send(w));
    },
    subscribe: (f) => {
      fns.add(f);
      return () => fns.delete(f);
    },
    onJoin: (f) => {
      const offJoins = paths.map((p) => p.onJoin(f));
      return () => offJoins.forEach((o) => o());
    },
    close: () => {
      offs.forEach((o) => o());
      fns.clear();
      paths.forEach((p) => p.close());
    },
  };
}

// Supabase 키가 있어 다른 기기(실제 휴대폰)와 이어질 수 있는가.
// NEXT_PUBLIC_ 변수는 빌드 때 글자 그대로 들어가므로 이 이름 그대로 읽는다
export const remoteEnabled = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// 같은 브라우저 안 길은 늘 쓰고, 키가 있으면 다른 기기 길도 함께 쓴다
export function openLink(room: string): Link {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const paths = [localLink(room)];
  // 연결마다 클라이언트를 따로 만든다(같은 페이지의 키오스크·내장 휴대폰이 한 채널로 합쳐져 서로 못 받는 일이 없게)
  if (url && key) paths.push(supabaseLink(room, new RealtimeClient(`${url}/realtime/v1`, { params: { apikey: key } }) as unknown as RealtimeLike));
  return bothLink(paths);
}
