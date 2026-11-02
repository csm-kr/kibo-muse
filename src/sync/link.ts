// 휴대폰과 키오스크를 잇는 통로. 오늘은 같은 브라우저 안의 BroadcastChannel, 배포 때는 Supabase Realtime으로 바꾼다.

export type LinkMsg =
  // 휴대폰 → 키오스크: 사용자가 한 말(전사문)
  | { type: "utterance"; text: string; lang: string }
  // 휴대폰 → 키오스크: 막 연결했으니 지금 상태를 알려 달라
  | { type: "hello" }
  // 휴대폰 → 키오스크: 마이크를 눌렀다(나란히 비교의 시작 시각)
  | { type: "listening" }
  // 키오스크 → 휴대폰: KIBO의 대답과 결과
  | { type: "reply"; say: string; replyLanguage: string; result: "plan" | "clarify" | "reject" | "error"; taps?: number; paymentHandoff?: boolean }
  // 키오스크 → 휴대폰: 지금 화면과 조작 진행
  | { type: "status"; screen: string; busy: boolean; step?: number; steps?: number; items: number; total: number };

export interface Link {
  send(msg: LinkMsg): void;
  subscribe(fn: (msg: LinkMsg) => void): () => void;
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
    close: () => ch.close(),
  };
}
