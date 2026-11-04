import { afterEach, describe, expect, it, vi } from "vitest";
import { initialState, step, type KioskState } from "@/kiosks/airport/machine";
import { plan } from "@/kiosks/airport/planner";
import { POST } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/api/airport/interpret", () => {
  it("그만하고 처음으로 가고 싶다는 말(exit)은 계획하지 않고 거절한다. 관문 카드도 보내지 않는다", async () => {
    let schema: { properties: Record<string, unknown> } | undefined;
    vi.stubEnv("MODEL_API_KEY", "test");
    vi.stubGlobal("fetch", async (_u: string, init?: RequestInit) => {
      schema = JSON.parse(String(init?.body)).response_format.json_schema.schema;
      const content = JSON.stringify({ airline: "bridge_air", travelers: 2, seats: "none", bags: 1, exit: true, replyLanguage: "ko", say: "처음으로 갈게요." });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    const res = await POST(new Request("http://x/api/airport/interpret", { method: "POST", body: JSON.stringify({ utterance: "체크인 그만할래요. 처음으로 가 주세요.", state: initialState(), pending: { airline: "bridge_air", travelers: 2, bags: 1 } }) }));
    const body = await res.json();
    expect(schema!.properties.exit).toMatchObject({ type: "boolean" });
    expect(body.plan).toEqual({ kind: "reject", reason: "exit" });
    expect(body.gate).toBeNull();
    // Spark 문장("처음으로 갈게요.")은 하지 않은 일이라 쓰지 않고 휴대폰과 같은 고정 문구로 덮는다
    expect(body.say).toBe("처음으로 가려면 화면 아래 [Exit]를 눌러 주세요. 체크인은 확정되지 않았어요.");
  });

  it("되묻기 Spark 문장이 다른 언어 문자를 섞으면 알아들은 항공사와 빠진 칸으로 만든 고정 문구로 바꾼다", async () => {
    vi.stubEnv("MODEL_API_KEY", "test");
    vi.stubGlobal("fetch", async () => {
      const content = JSON.stringify({ airline: "nova_wings", travelers: -1, seats: "none", bags: -1, exit: false, replyLanguage: "ko", say: "노바윙스ですね. 몇 분이세요?" });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    const res = await POST(new Request("http://x/api/airport/interpret", { method: "POST", body: JSON.stringify({ utterance: "노바윙스예요.", state: initialState() }) }));
    const body = await res.json();
    expect(body.plan.kind).toBe("clarify");
    expect(body.say).toBe("노바윙스 체크인을 도와드릴게요. 알려 주세요: 체크인할 인원, 부치는 짐 개수.");
  });

  it("Spark 문장이 항공사 한국어 이름을 한 글자 틀리면 바른 이름으로 고친다(11/5 실제 음성: '하님스카이')", async () => {
    vi.stubEnv("MODEL_API_KEY", "test");
    vi.stubGlobal("fetch", async () => {
      const content = JSON.stringify({ airline: "haneul_sky", travelers: 1, seats: "none", bags: -1, exit: false, replyLanguage: "ko", say: "하님스카이 1명으로 알겠어요. 위탁하실 짐은 몇 개인가요?" });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    const body = await (await POST(new Request("http://x/api/airport/interpret", { method: "POST", body: JSON.stringify({ utterance: "그럼 하늘스카이요 한 명이요", state: initialState() }) }))).json();
    expect(body.plan.kind).toBe("clarify");
    expect(body.say).toBe("하늘스카이 1명으로 알겠어요. 위탁하실 짐은 몇 개인가요?");
  });

  it("휴대폰 언어(?lang)가 대답 언어다: Spark가 영어로 되물어도 한국어 휴대폰에는 한국어 고정 되묻기로 답한다", async () => {
    vi.stubEnv("MODEL_API_KEY", "test");
    vi.stubGlobal("fetch", async () => {
      const content = JSON.stringify({ airline: "nova_wings", travelers: -1, seats: "none", bags: -1, exit: false, replyLanguage: "en", say: "Nova Wings, got it. How many travelers?" });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    const res = await POST(new Request("http://x/api/airport/interpret?lang=ko", { method: "POST", body: JSON.stringify({ utterance: "Nova Wings 체크인이요", state: initialState() }) }));
    const body = await res.json();
    expect(body.say).toBe("노바윙스 체크인을 도와드릴게요. 알려 주세요: 체크인할 인원, 부치는 짐 개수.");
    expect(body.replyLanguage).toBe("ko");
  });

  it("한국어 휴대폰에 순수 영어 문장이면 영어로 답하고 followSpoken을 붙인다(항공사 이름은 판정에서 뺀다)", async () => {
    vi.stubEnv("MODEL_API_KEY", "test");
    vi.stubGlobal("fetch", async () => {
      const content = JSON.stringify({ airline: "nova_wings", travelers: -1, seats: "none", bags: -1, exit: false, replyLanguage: "en", say: "Nova Wings, got it. How many travelers?" });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    const body = await (await POST(new Request("http://x/api/airport/interpret?lang=ko", { method: "POST", body: JSON.stringify({ utterance: "I want to check in with Nova Wings please", state: initialState() }) }))).json();
    expect(body.replyLanguage).toBe("en");
    expect(body.followSpoken).toBe(true);
  });

  it("거절 문구 속 버튼 이름은 키오스크 화면 글자다(나가기 = 화면 아래 [나가기]·[Exit]). 휴대폰 언어로 옮기지 않는다", async () => {
    vi.stubEnv("MODEL_API_KEY", "test");
    vi.stubGlobal("fetch", async () => {
      const content = JSON.stringify({ airline: "none", travelers: -1, seats: "none", bags: -1, exit: true, replyLanguage: "en", say: "Okay." });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    const post = async (lang: "ko" | "en", q: string) => (await POST(new Request(`http://x/api/airport/interpret${q}`, { method: "POST", body: JSON.stringify({ utterance: "stop", state: initialState(lang) }) }))).json();
    const vn = await post("ko", "?lang=vi");
    expect(vn.say).toContain("[나가기]");
    expect(vn.say).not.toContain("[Về đầu]");
    expect((await post("en", "?lang=ko")).say).toContain("[Exit]");
  });
  it("계획 앞에 알아들은 내용을 말하고(lead), 관문에서 인원·짐을 고쳐도 받은 값을 먼저 말한다. 프롬프트에 편·탑승구·짐·보조배터리·좌석 사실을 싣는다", async () => {
    let prompt = "";
    const spark = (o: object) => {
      vi.stubEnv("MODEL_API_KEY", "test");
      vi.stubGlobal("fetch", async (_u: string, init?: RequestInit) => {
        prompt = JSON.parse(String(init?.body)).messages[0].content;
        const content = JSON.stringify({ airline: "none", travelers: -1, seats: "none", bags: -1, exit: false, replyLanguage: "ko", say: "네.", ...o });
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
      });
    };
    const post = async (state: KioskState, pending?: object) => (await POST(new Request("http://x/api/airport/interpret?lang=Korean", { method: "POST", body: JSON.stringify({ utterance: "말", state, pending }) }))).json();
    spark({ airline: "bridge_air", travelers: 1, bags: 0 });
    const first = await post(initialState());
    expect(first.lead).toBe("브리지항공, 1명, 부치는 짐 없음.");
    expect(first.say.startsWith("브리지항공, 1명, 부치는 짐 없음. ")).toBe(true);
    for (const f of ["09:40", "gate 23", "Power banks", "Paid seats", "Exit row", "A different destination", "Never ask for passports", "If they ask how or where to scan", "write no Korean (Hangul) at all", "names from AIRLINES in replyLanguage", "₩100,000 per bag over the allowance", "then invite them to check in", "screen=complete", "딸이랑 같이", "never \"today\" or \"tomorrow\"", "spoken date (Korean \"11월 5일\""]) expect(prompt).toContain(f);
    // 위험물 관문에서 "아 아니 두 명이요": 누를 것은 없어도 고친 인원을 먼저 말한다
    const p = plan(initialState(), { airline: "bridge_air", travelers: 1, bags: 0 });
    if (p.kind !== "plan") throw new Error(p.kind);
    const atGate = p.events.reduce((x, e) => (step(x, e) as { state: KioskState }).state, initialState());
    spark({ travelers: 2 });
    const fixed = await post(atGate, { airline: "bridge_air", travelers: 1, bags: 0 });
    expect(fixed.plan.events).toEqual([]);
    expect(fixed.say.startsWith("브리지항공, 2명, 부치는 짐 없음. ")).toBe(true);
    // 관문에서 질문만 하면(값 없음) Spark 답 뒤에 확인 방법을 붙여 휴대폰에 answer로 보낸다(11/4 판정: 질문에 확인 방법만)
    spark({ say: "보조배터리는 1인당 2개까지 기내에 가져갈 수 있어요." });
    const q = await post(atGate, { airline: "bridge_air", travelers: 1, bags: 0 });
    expect(q.answer).toBe(q.say);
    expect(q.say.startsWith("보조배터리는 1인당 2개까지 기내에 가져갈 수 있어요. ")).toBe(true);
    expect(q.say).toContain("[확인했어요]");
  });
});
