// 실험: 실제 Spark로 패스트푸드 해석의 정확도와 지연을 effort별로 잰다.
// 실행: npx tsx --env-file=.env.local scripts/exp-interpret.ts
import { initialState } from "@/kiosks/fastfood/machine";
import { interpret } from "@/kiosks/fastfood/interpret";
import { plan } from "@/kiosks/fastfood/planner";

const utterances: [string, string][] = [
  ["ko", "더블 치즈버거 라지 세트, 음료는 제로 콜라로, 피클 빼고, 먹고 갈게요"],
  ["en", "Can I get a large double cheeseburger meal with a Coke Zero, no pickles, for here?"],
  ["ja", "ダブルチーズバーガーのLセット、ドリンクはコーラゼロで、ピクルス抜き、店内で。"],
  ["vi", "Cho tôi một phần combo burger phô mai đôi cỡ lớn, nước là cola không đường, bỏ dưa chua, ăn tại đây."],
  ["mix", "Bulgogi burger 세트 하나 medium으로, side는 fries, drink는 iced tea, take out이요"],
  ["missing", "치즈버거 세트 하나요"],
  ["unknown", "빅맥 하나 주세요, 포장이요"],
  ["pay", "더블 치즈버거 하나 단품으로, 포장. 그거면 됐어요, 결제도 해 주세요"],
];

for (const effort of ["minimal", "minimal"] as const) {
  console.log(`\n=== effort=${effort} ===`);
  const times: number[] = [];
  for (const [tag, u] of utterances) {
    try {
      const r = await interpret(u, initialState(), { effort });
      times.push(r.ms);
      const p = plan(initialState(), r.intent);
      const summary = p.kind === "plan" ? `plan ${p.events.length} taps → ${p.final.cart.map((l) => `${l.qty}x${l.menuId}/${l.mode}/${l.size ?? "-"}/${l.side ?? "-"}/${l.drink ?? "-"}/rm:${l.remove.join("+")}`).join(", ")} handoff=${p.paymentHandoff}` : JSON.stringify(p);
      const usage = r.usage as { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; completion_tokens_details?: { reasoning_tokens?: number } } | undefined;
      console.log(`[${tag}] ${r.ms}ms in=${usage?.prompt_tokens} cached=${usage?.prompt_tokens_details?.cached_tokens ?? "?"} out=${usage?.completion_tokens} reason=${usage?.completion_tokens_details?.reasoning_tokens ?? "?"}\n   intent=${JSON.stringify(r.intent)} unknown=${JSON.stringify(r.unknownItems)} lang=${r.replyLanguage}\n   ${summary}\n   say=${r.say}`);
    } catch (e) {
      console.log(`[${tag}] ERROR ${(e as Error).message}`);
    }
  }
  times.sort((a, b) => a - b);
  console.log(`effort=${effort} ms: min ${times[0]} median ${times[Math.floor(times.length / 2)]} max ${times[times.length - 1]}`);
}
