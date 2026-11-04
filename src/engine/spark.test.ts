import { afterEach, describe, expect, it, vi } from "vitest";
import { sparkJson } from "./spark";

// 가짜 Spark: i번째 요청은 specs[i].ms 뒤에 specs[i].status로 답한다({v: i}). 끊기면(abort) 적어 둔다
function fakeSpark(specs: { ms: number; status?: number }[]) {
  const seen = { calls: 0, aborted: [] as number[] };
  const fetch = (_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const i = seen.calls++;
      const { ms, status = 200 } = specs[i];
      const body = status === 200 ? JSON.stringify({ choices: [{ message: { content: JSON.stringify({ v: i }) } }] }) : "upstream error";
      const timer = setTimeout(() => resolve(new Response(body, { status })), ms);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        seen.aborted.push(i);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  return { seen, fetch };
}

describe("Spark 호출 — 같은 요청 3개 중 먼저 온 답(꼬리 지연 줄이기)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("글 요청(해석)은 같은 요청 3개를 동시에 보내 먼저 끝난 답을 쓰고, 진 쪽은 끊는다. 로그에는 이긴 쪽만 남긴다", async () => {
    // 11/4 밤 측정: 요청의 약 1/3이 상태와 상관없이 4~5초 더 걸린다(같은 요청 3.9초·9.1초). 2개 중 먼저는 p90 8.5초, 3개 중 먼저는 4.6초(다시 뽑기)
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const s = fakeSpark([{ ms: 80 }, { ms: 5 }, { ms: 60 }]);
    const r = await sparkJson<{ v: number }>("sys", "말", "X", {}, { apiKey: "test", fetch: s.fetch });
    expect([r.json.v, s.seen.calls, s.seen.aborted]).toEqual([1, 3, [0, 2]]);
    expect(info.mock.calls).toEqual([["spark hedge won 1"]]);
  });

  it("일부가 실패하면 남은 답을 쓰고, 모두 실패하면 오류를 낸다. 사진 요청(내용 배열)은 하나만 보낸다", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const one = fakeSpark([{ ms: 5, status: 500 }, { ms: 30 }, { ms: 50, status: 502 }]);
    expect((await sparkJson<{ v: number }>("sys", "말", "X", {}, { apiKey: "test", fetch: one.fetch })).json.v).toBe(1);
    const both = fakeSpark([{ ms: 5, status: 500 }, { ms: 10, status: 503 }, { ms: 15, status: 502 }]);
    await expect(sparkJson("sys", "말", "X", {}, { apiKey: "test", fetch: both.fetch })).rejects.toThrow(/Spark HTTP 50/);
    const photo = fakeSpark([{ ms: 5 }]);
    await sparkJson("sys", [{ type: "text", text: "?" }], "X", {}, { apiKey: "test", fetch: photo.fetch });
    expect(photo.seen.calls).toBe(1);
  });
});
