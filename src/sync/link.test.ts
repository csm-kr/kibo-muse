import { afterEach, describe, expect, it, vi } from "vitest";
import { bothLink, openLink, supabaseLink, type Link, type LinkMsg, type RealtimeChannelLike, type RealtimeLike } from "./link";

describe("로컬 연결", () => {
  it("Supabase 키가 없으면 같은 페이지 길만 쓴다: 같은 방의 상대에게만 메시지를 전하고, 자기 자신이나 다른 방에는 전하지 않는다", async () => {
    const phone = openLink("room-a");
    const kiosk = openLink("room-a");
    const other = openLink("room-b");
    const got: { kiosk: LinkMsg[]; phone: LinkMsg[]; other: LinkMsg[] } = { kiosk: [], phone: [], other: [] };
    kiosk.subscribe((m) => got.kiosk.push(m));
    phone.subscribe((m) => got.phone.push(m));
    other.subscribe((m) => got.other.push(m));

    phone.send({ type: "utterance", text: "치즈버거 세트", lang: "Korean" });
    await new Promise((r) => setTimeout(r, 30));

    expect(got).toEqual({ kiosk: [{ type: "utterance", text: "치즈버거 세트", lang: "Korean" }], phone: [], other: [] });
    [phone, kiosk, other].forEach((l) => l.close());
  });
});

// 가짜 Supabase Realtime: 기기(클라이언트)마다 하나. 같은 채널 이름의 다른 기기에만 broadcast를 전한다(self:false).
// join()을 부르기 전에는 접속 전이라 보낸 것이 전달되지 않는다(실제로는 REST로 새거나 버려진다)
function fakeServer() {
  const joined = new Set<{ name: string; owner: object; deliver: (p: unknown) => void }>();
  const sentBeforeJoin: unknown[] = [];
  function device(): RealtimeLike & { join(): void; drop(): void; removed: number } {
    const me = {};
    const mine: { join(): void; drop(): void }[] = [];
    const d = {
      removed: 0,
      channel(name: string, opts: { config: { broadcast: { self: boolean } } }): RealtimeChannelLike {
        expect(opts.config.broadcast.self).toBe(false);
        let handler: ((p: { payload: unknown }) => void) | null = null;
        let status: ((s: string) => void) | null = null;
        const entry = { name, owner: me, deliver: (payload: unknown) => handler?.({ payload }) };
        let isJoined = false;
        mine.push({
          join: () => {
            isJoined = true;
            joined.add(entry);
            status?.("SUBSCRIBED");
          },
          drop: () => {
            isJoined = false;
            joined.delete(entry);
            status?.("CHANNEL_ERROR");
          },
        });
        const ch: RealtimeChannelLike = {
          on: (_t, filter, cb) => {
            expect(filter.event).toBe("msg");
            handler = cb;
            return ch;
          },
          subscribe: (cb) => {
            status = cb ?? null;
            return ch;
          },
          send: async ({ payload }) => {
            if (!isJoined) sentBeforeJoin.push(payload);
            else for (const e of joined) if (e.name === name && e.owner !== me) e.deliver(payload);
            return "ok";
          },
        };
        return ch;
      },
      removeChannel: () => {
        d.removed++;
        mine.forEach((c) => c.drop());
      },
      join: () => mine.forEach((c) => c.join()),
      drop: () => mine.forEach((c) => c.drop()),
    };
    return d;
  }
  return { device, sentBeforeJoin };
}

describe("Supabase Realtime 연결", () => {
  const hi: LinkMsg = { type: "utterance", id: "u1", text: "치즈버거 세트", lang: "Korean" };

  it("kibo:<room> 채널로 같은 방의 다른 기기에만 전하고, 접속 전에 보낸 것은 접속하면 보낸다. close 뒤에는 받지 않는다", () => {
    const server = fakeServer();
    const [pd, kd, od] = [server.device(), server.device(), server.device()];
    const phone = supabaseLink("482913", pd);
    const kiosk = supabaseLink("482913", kd);
    const other = supabaseLink("111111", od);
    const got: { phone: LinkMsg[]; kiosk: LinkMsg[]; other: LinkMsg[] } = { phone: [], kiosk: [], other: [] };
    phone.subscribe((m) => got.phone.push(m));
    kiosk.subscribe((m) => got.kiosk.push(m));
    other.subscribe((m) => got.other.push(m));

    kd.join();
    od.join();
    phone.send(hi);
    expect(got.kiosk).toEqual([]);
    pd.join();
    expect(server.sentBeforeJoin).toEqual([]);
    expect(got).toEqual({ phone: [], kiosk: [hi], other: [] });

    kiosk.close();
    expect(kd.removed).toBe(1);
    phone.send({ type: "hello" });
    expect(got.kiosk).toEqual([hi]);
  });

  it("(다시) 접속할 때마다 onJoin을 부른다. 휴대폰은 그때 hello를 보내 키오스크 상태를 다시 받는다", () => {
    const server = fakeServer();
    const [pd, kd] = [server.device(), server.device()];
    const phone = supabaseLink("482913", pd);
    const kiosk = supabaseLink("482913", kd);
    const got: LinkMsg[] = [];
    kiosk.subscribe((m) => got.push(m));
    phone.onJoin(() => phone.send({ type: "hello" }));
    kd.join();
    pd.join();
    pd.drop();
    phone.send(hi);
    pd.join();
    expect(got).toEqual([{ type: "hello" }, hi, { type: "hello" }]);
  });

  it("연결됨·끊김을 알린다: 원격 길이 끊기면 false, 다시 붙으면 true. 같은 페이지 길은 늘 연결돼 있어 함께 쓸 때는 원격 길을 따른다", async () => {
    const server = fakeServer();
    const pd = server.device();
    const remote = supabaseLink("482913", pd);
    const both = bothLink([openLink("482913-live"), remote]);
    const seen: boolean[] = [];
    both.onLive((v) => seen.push(v));
    await Promise.resolve();
    pd.join();
    pd.drop();
    pd.join();
    expect(seen).toEqual([false, true, false, true]);
    const local: boolean[] = [];
    openLink("482913-local").onLive((v) => local.push(v));
    await Promise.resolve();
    expect(local).toEqual([true]);
  });

  it("인터넷이 돌아오면(online) 끊긴 원격 길을 백오프(최대 10초) 없이 바로 다시 붙인다. 붙어 있으면 건드리지 않고, 닫은 뒤에는 듣지 않는다", () => {
    const server = fakeServer();
    const pd = Object.assign(server.device(), { kicks: 0, reconnectNow() { this.kicks++; } });
    let fire = () => {};
    let off = 0;
    const link = supabaseLink("482913", pd, (f) => {
      fire = f;
      return () => void off++;
    });
    pd.join();
    fire();
    expect(pd.kicks).toBe(0);
    pd.drop();
    fire();
    expect(pd.kicks).toBe(1);
    link.close();
    expect(off).toBe(1);
  });

  it("인터넷이 끊기면(offline) 채널 heartbeat(약 30초)를 기다리지 않고 바로 끊김으로 알린다. 돌아오면(online) 채널이 아직 붙어 있으면 바로 연결됨으로 알리고 onJoin을 다시 불러(휴대폰은 hello) 끊긴 사이 놓친 상태를 새로 받는다", async () => {
    const server = fakeServer();
    const pd = server.device();
    let online = () => {};
    let offline = () => {};
    const link = supabaseLink("482913", pd, (f) => ((online = f), () => {}), (f) => ((offline = f), () => {}));
    const seen: boolean[] = [];
    link.onLive((v) => seen.push(v));
    let joins = 0;
    link.onJoin(() => joins++);
    await Promise.resolve();
    pd.join();
    expect(joins).toBe(1);
    offline();
    online();
    expect(seen).toEqual([false, true, false, true]);
    expect(joins).toBe(2);
  });

  afterEach(() => vi.useRealTimers());

  it("끊긴 동안 15초 넘게 대기열에 있던 말(utterance)과 확인(ack)은 다시 접속해도 보내지 않는다. 15초 안의 것과 그 밖의 메시지는 보낸다", () => {
    vi.useFakeTimers();
    const server = fakeServer();
    const [pd, kd] = [server.device(), server.device()];
    const phone = supabaseLink("482913", pd);
    const kiosk = supabaseLink("482913", kd);
    const got: LinkMsg[] = [];
    kiosk.subscribe((m) => got.push(m));
    kd.join();
    phone.send(hi);
    phone.send({ type: "ack", what: "dangerous_goods", gateId: "s-g1" });
    phone.send({ type: "hello" });
    vi.advanceTimersByTime(15_001);
    const fresh: LinkMsg = { ...hi, id: "u2" };
    phone.send(fresh);
    pd.join();
    expect(got).toEqual([{ type: "hello" }, fresh]);
  });
});

// 가짜 같은 페이지 버스(BroadcastChannel 대신). echo면 보낸 쪽에게도 돌려준다(자기 메시지를 버리는지 보려고)
function fakeBus(echo = false) {
  const members = new Set<(m: LinkMsg) => void>();
  return (): Link => {
    const fns = new Set<(m: LinkMsg) => void>();
    const me = (m: LinkMsg) => fns.forEach((f) => f(m));
    members.add(me);
    return {
      send: (m) => members.forEach((f) => (echo || f !== me) && f(structuredClone(m))),
      subscribe: (f) => (fns.add(f), () => fns.delete(f)),
      onJoin: () => () => {},
      onLive: () => () => {},
      close: () => members.delete(me),
    };
  };
}

describe("같은 페이지 + 원격 통로", () => {
  const hi: LinkMsg = { type: "utterance", id: "u1", text: "치즈버거 세트", lang: "Korean" };

  it("같은 메시지가 두 길(같은 페이지·원격)로 와도 한 번만 전하고, eid·from은 떼고 넘긴다", () => {
    const server = fakeServer();
    const page = fakeBus();
    const [kd, pd] = [server.device(), server.device()];
    const kiosk = bothLink([page(), supabaseLink("r", kd)]);
    const phone = bothLink([page(), supabaseLink("r", pd)]);
    const got: LinkMsg[] = [];
    kiosk.subscribe((m) => got.push(m));
    kd.join();
    pd.join();
    phone.send(hi);
    phone.send({ type: "hello" });
    expect(got).toEqual([hi, { type: "hello" }]);
  });

  it("자기가 보낸 메시지는 되돌아와도 받지 않는다", () => {
    const page = fakeBus(true);
    const kiosk = bothLink([page()]);
    const phone = bothLink([page()]);
    const got: { kiosk: LinkMsg[]; phone: LinkMsg[] } = { kiosk: [], phone: [] };
    kiosk.subscribe((m) => got.kiosk.push(m));
    phone.subscribe((m) => got.phone.push(m));
    phone.send(hi);
    expect(got).toEqual({ kiosk: [hi], phone: [] });
  });

  it("다른 기기(실제 휴대폰)가 원격으로 보낸 말은 같은 페이지의 키오스크와 내장 휴대폰 모두에 한 번씩 간다", () => {
    const server = fakeServer();
    const page = fakeBus();
    const [kd, ed, rd] = [server.device(), server.device(), server.device()];
    const kiosk = bothLink([page(), supabaseLink("r", kd)]);
    const embedded = bothLink([page(), supabaseLink("r", ed)]);
    const real = bothLink([fakeBus()(), supabaseLink("r", rd)]);
    const got: { kiosk: LinkMsg[]; embedded: LinkMsg[] } = { kiosk: [], embedded: [] };
    kiosk.subscribe((m) => got.kiosk.push(m));
    embedded.subscribe((m) => got.embedded.push(m));
    [kd, ed, rd].forEach((d) => d.join());
    real.send(hi);
    expect(got).toEqual({ kiosk: [hi], embedded: [hi] });
  });
});
