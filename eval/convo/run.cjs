// 시나리오 대화를 개발 콘솔(http://localhost:3100/kiosk/<kiosk>)에 하나씩 차례로 넣고 결과를 JSON으로 남긴다(실제 Spark, 병렬 없음)
// 실행: node run.cjs <kiosk> <scenario.json> <out.json> [base]
// "@click:글자" 턴은 그 글자를 담은 콘솔 버튼을 누른다(여권 스캔 등)
const { chromium } = require("playwright-core");
const fs = require("fs");
const [kiosk, scenFile, out, base = "http://localhost:3100"] = process.argv.slice(2);
const convos = JSON.parse(fs.readFileSync(scenFile, "utf8"));
const panel = () => document.querySelector("main > div:last-child")?.innerText ?? "";
const read = (page) => page.evaluate((src) => {
  const t = (0, eval)(src)();
  const g = (k) => (t.match(new RegExp(`${k}[^\\n]*`)) || [""])[0];
  return { say: g("say \\("), intent: g("intent:"), plan: g("plan:"), timing: g("timing:"), screen: g("screen:"), panel: t.slice(0, 2500) };
}, `(${panel})`);
const YES = /^(네|예|yes|はい|có|vâng)\b/i;
(async () => {
  const browser = await chromium.launch();
  // 이어 하기: 출력 파일에 이미 있는 대화는 건너뛴다
  const res = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};
  const t0 = Date.now();
  for (const [id, turns] of Object.entries(convos)) {
    if (res[id]?.length === turns.length) continue;
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.goto(`${base}/kiosk/${kiosk}`, { waitUntil: "networkidle" });
    res[id] = [];
    // 해석 API 응답(의도·계획·unknownItems)도 남긴다(패스트푸드 콘솔에는 intent 줄이 없다)
    let api = null;
    page.on("response", async (resp) => { if (/\/api\/[a-z]+\/interpret/.test(resp.url())) { try { const j = await resp.json(); api = { intent: j.intent, plan: j.plan && { kind: j.plan.kind, missing: j.plan.missing, reason: j.plan.reason, taps: j.plan.events?.length }, unknownItems: j.unknownItems, replyLanguage: j.replyLanguage, say: j.say }; } catch {} } });
    for (const [ti, turn] of turns.entries()) {
      api = null;
      const u = turn.u;
      const before = await read(page);
      if (u.startsWith("@click:")) {
        await page.locator("button", { hasText: u.slice(7) }).first().click().catch((e) => console.log("click fail", u, e.message));
      } else {
        await page.locator("textarea").fill(u);
        await page.getByRole("button", { name: "Say it", exact: true }).click();
      }
      const quick = u.startsWith("@") || YES.test(u.trim());
      await page.waitForFunction(([b, s]) => { const t = document.querySelector("main > div:last-child")?.innerText ?? ""; const m = t.match(/timing:[^\n]*/); const y = t.match(/say \([^\n]*/); return (m && m[0] !== b) || (y && y[0] !== s); }, [before.timing, before.say], { timeout: quick ? 12000 : 40000 }).catch(() => {});
      // 다시 누르기가 끝날 때까지(화면 줄이 2초 동안 그대로)
      // 대화의 마지막 턴은 다시 누르기를 기다리지 않는다(콘솔 say·plan 줄은 해석 응답에서 바로 나온다)
      let last = "", same = 0;
      if (ti === turns.length - 1) { await page.waitForTimeout(300); same = 4; }
      for (let i = 0; i < 60 && same < 4; i++) { await page.waitForTimeout(500); const s = (await read(page)).screen; same = s === last ? same + 1 : 0; last = s; }
      const r = await read(page);
      const stale = r.timing === before.timing && r.say === before.say;
      res[id].push({ u, ...r, stale, api });
      console.log(`${id} ▶ ${u}\n   ${r.say}\n   ${r.plan.slice(0, 160)}\n   ${r.intent.slice(0, 200)}\n   ${r.screen} | ${r.timing}${stale ? " | STALE" : ""}`);
    }
    await page.close();
    fs.writeFileSync(out, JSON.stringify(res, null, 1));
  }
  await browser.close();
  console.log(`done ${kiosk} ${Object.keys(res).length} convos in ${Math.round((Date.now() - t0) / 1000)} s`);
})();
