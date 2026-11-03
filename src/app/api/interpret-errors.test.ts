import { afterEach, describe, expect, it, vi } from "vitest";
import { initialState as airportStart } from "@/kiosks/airport/machine";
import { initialState as fastfoodStart } from "@/kiosks/fastfood/machine";
import { initialState as trainStart } from "@/kiosks/train/machine";
import { POST as airport } from "./airport/interpret/route";
import { POST as fastfood } from "./fastfood/interpret/route";
import { POST as train } from "./train/interpret/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const post = (route: (req: Request) => Promise<Response>, body: string) => route(new Request("http://x/api/k/interpret", { method: "POST", body }));

describe.each([
  ["fastfood", fastfood, fastfoodStart()],
  ["train", train, trainStart()],
  ["airport", airport, airportStart()],
] as const)("/api/%s/interpret 오류 응답", (_name, route, state) => {
  it("내부 예외 문장(모델 API 오류 본문 포함)은 응답에 넣지 않고 서버 로그에만 남긴다. 응답은 고정 값이다", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("MODEL_API_KEY", "test");
    vi.stubGlobal("fetch", async () => new Response("upstream secret detail sk-abc", { status: 500 }));
    const res = await post(route, JSON.stringify({ utterance: "x", state }));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "interpret_failed" });
    expect(text).not.toContain("secret");
    expect(String(logged.mock.calls.flat().join(" "))).toContain("secret");
    // 모양이 틀린 상태로 생긴 TypeError 문장도 내보내지 않는다
    const broken = await post(route, JSON.stringify({ utterance: "x", state: {} }));
    expect(await broken.json()).toEqual({ error: "interpret_failed" });

    // 잘못된 JSON·빠진 칸은 400과 고정 값(빈 본문 500이 아니다)
    for (const bad of ["{", JSON.stringify({ state: {} }), "null"]) {
      const r = await post(route, bad);
      expect(r.status, bad).toBe(400);
      expect(await r.json(), bad).toEqual({ error: "bad_request" });
    }
  });
});
