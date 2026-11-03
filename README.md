# KIBO — Kiosk Intelligence Bridge & Operator

Say one sentence on your phone. KIBO works the kiosk's own screens for you, one visible tap at a time, and stops wherever a person must act. Muse Spark only proposes what you asked for; our server turns it into taps and checks every tap against the kiosk's own state machine; paying, consenting and scanning documents stay with the person. It is for the people kiosks leave behind: older adults, people with low vision, and travelers who can't read the screen.

> **Not an official Meta product.** KIBO is an independent entry to the Meta Global AI Developer Hackathon 2026, hosted by Meta and Cerebral Valley (Indie Developer track). It uses Meta models through the Meta Model API. It is not built, endorsed or reviewed by Meta.

- Demo video: ⟦VIDEO_URL⟧
- Live demo: https://kibo-muse.vercel.app. **No phone needed:** start with "Touch vs KIBO" (`/compare`) and type a sentence into the phone panel on the right.

## Built during the hackathon

- All code in this repository was written during the hackathon (Oct 26 – Nov 4, 2026, US Eastern). The first commit, `f64758a` (Create Next App scaffold, 2026-11-02 15:33 KST), and every commit after it are in `git log`.
- **An earlier prototype exists, and none of it is used here.** Before the event, the author built a separate prototype also called KIBO, using Google Gemini (repository `csm-kr/kibo`; an earlier demo video is public on YouTube: ⟦OLD_VIDEO_URL⟧). This project shares the name and the idea, not the implementation. No code, prompts, assets or data from that prototype were copied into this repository. The kiosks, planners, state machines, phone app, safety rules and evaluation here are new. If you have seen the earlier video: that is the Gemini prototype, not this submission.
- Third-party code is limited to the packages listed in `package.json` (Next.js, React, Tailwind CSS, Supabase Realtime client, qrcode, sharp, Vitest, fast-check and others).
- ⟦AI_TOOLS: Code in this repository was written with AI coding assistants during the event.⟧

## How it works

```
Phone (hold to talk or type, 6 languages)
  ├─ 16 kHz mono WAV ─▶ /api/transcribe ─▶ Muse Voice Transcribe 1.0 (file API, PUSH_TO_TALK)
  └─ transcript ─────▶ /api/fastfood/interpret, /api/airport/interpret or /api/train/interpret
                          ├─ Muse Spark 1.3, structured output → intent (or one clarifying question)
                          │    sent twice at once; the first complete answer wins, the other is cancelled
                          ├─ deterministic planner: intent → the exact taps
                          └─ kiosk state machine: every tap checked (same path as touch input)
Kiosk screen ◀── taps replayed with a visible pointer: first tap 160 ms after the plan arrives, then 640 ms per step
Phone        ◀── step list, fixed gate cards, short spoken replies (browser speech synthesis)

Guide mode (any kiosk, no connection needed)
Phone camera photo + question ─▶ /api/guide
  ├─ Muse Spark 1.3: which button
  ├─ SAM 3.1: the button's exact outline
  └─ check: Spark reads the cropped outline again; if the label does not match, nothing is drawn
```

Phone ↔ kiosk messages go through `src/sync/link.ts`. In one browser they use a BroadcastChannel. When Supabase keys are set, the same messages also go over Supabase Realtime broadcast (no database tables), so a real phone pairs by scanning the QR code on the kiosk screen.

KIBO answers in the language the phone is set to. If Spark writes a follow-up question in another language, the server replaces it with a fixed question in the phone's language. When a step fails (for example the kiosk stops answering or the phone goes offline), the phone shows a fixed message in its language and reads it aloud. The kiosks themselves show Korean or English, one at a time, and a test walks every screen of all three kiosks to check that no untranslated text is left (`src/kiosks/i18n.test.ts`).

| Page | What it is |
|---|---|
| `/kiosk/fastfood` | Bridge Burger fast-food kiosk (fictional). `?view=kiosk` shows the kiosk alone with a pairing QR; `&qr=0` hides it |
| `/kiosk/airport` | Bridge Air self check-in kiosk (fictional). Same options |
| `/kiosk/train` | Bridge Rail reserved-ticket machine (fictional). Same options |
| `/phone?room=…` | The phone app: hold to talk or type, six languages, step list, gate cards, guide mode |
| `/compare` | Touch and KIBO side by side, with live counters for screens, taps and time |
| `/show/airport` | Airport kiosk with the phone beside it, used for the demo video |
| `/film/*` | Title and number cards used in the demo video. Numbers come only from `src/app/film/numbers.ts` |

## Safety boundaries

1. **Payment stays with the person.** The fast-food and train state machines reject Pay unless it comes from touch. KIBO stops before payment and tells the user which button to tap. Inserting a card is a device event KIBO cannot produce.
2. **Consent stays with the person.** The airport's dangerous-goods declaration, the final check-in confirmation and a train that leaves more than an hour after the requested time need the person's confirmation. Only the phone can give it, by its button or by a "yes" from a fixed six-language list (`src/engine/yes.ts`) matched without calling the model. Spark's schemas have no consent fields.
3. **Documents stay with the person.** Passport scans are device events. KIBO cannot produce them; it waits (`src/kiosks/airport/machine.ts`).
4. **The model proposes, the kiosk decides.** Spark returns an intent only. A deterministic planner turns it into taps, the kiosk's state machine checks each tap, and the API rejects any plan containing events not attributed to KIBO (`src/app/api/*/interpret/route.ts`). Missing required details get one question, not a guess. Unknown items, unknown stations, unsupported requests and out-of-range values are refused with fixed, hand-written text in six languages, not generated text.
5. **Guide mode only points.** It never taps. A wrong outline is worse than none, so an outline is drawn only after a second check.
6. **Cost limits.** A production build limits each IP to 20 interpretation, 20 transcription and 6 guide requests per minute, and caps request sizes (`src/server/guard.ts`).

Audio and photos are sent to Meta models for that one request and are not stored by this app.

## Evaluation

Details, definitions and commands to reproduce: [`eval/README.md`](eval/README.md).

- **Tests:** `npm test` runs 219 unit and property tests in 66 files (Vitest, fast-check). The property tests take random walks over kiosk events. The fast-food and airport walks run 60 times each in `npm test`, and the fast-food walk also passed ⟦PROP_RUNS⟧ walks in a separate run (`PROP_RUNS=1000`). They check that KIBO alone can never pay, never pass a consent gate without the person, and never create passport, card or consent events.
- **Interpretation, held-out set:** 50 typed requests for the fast-food and airport kiosks (40 everyday, 10 attack; Korean, English, Japanese and Vietnamese, 10 everyday each). The evaluator wrote them after development and fixed the expected answers before the run. Each response is scored by replaying the planned taps through the state machine and comparing the final kiosk state with the expected one. Exact on everyday requests in all 3 runs: 39 of 40. Unsafe requests blocked: 30/30 (10 × 3 runs). Unsafe actions: 0.
- **Interpretation, development set:** 82 typed requests (62 everyday, 20 attack) from 16 kiosk start states, also used to find and fix failures during development. Exact: 61 of 62. Blocked: 60/60. One of the passes, ff-a2 ("A cheeseburger combo, please"), only checks the follow-up question, not which burger was chosen; in the final run it chose Bridge Classic twice and Double Cheeseburger once.
- **Train eval set (development set):** 22 typed requests (17 everyday including 2 for features the machine does not have, 5 attack), also used for fixes. Exact on everyday requests in all 3 runs: 15 of 15. Both missing-feature requests answered honestly. Attacks blocked: 15/15. Unsafe actions: 0.
- **Guide mode:** 22 cases, one run each: 15 right · 1 wrong · 6 not sure (nothing drawn). The one wrong outline is A4, an adversarial photo with a fake "pay by QR" sticker. On the 12 real kiosk photos: 8 right · 0 wrong · 4 not sure. This photo set was also used to set the verification rules.
- **Change after evaluation: two Spark requests at once.** Spark's time for the same sentence varies widely (3.2 s, 3.9 s and 23.1 s for one sentence), so the server now sends each interpretation request twice and uses the first complete answer. Re-run with both answers recorded: held-out set 119/120 everyday runs exact and 30/30 blocked, the same as before; development sets 307/312 hedged against 307 and 309 for the two single answers. Details in [`eval/README.md`](eval/README.md#change-after-evaluation-hedged-requests).
- **Latency, typed request → plan** (speech transcription and replay not included, before the change above): p50 2.2 s, p95 4.8 s (n=234, development set). Held-out set: p50 2.3 s, p95 4.4 s (n=165). Train: p50 3.0 s, p95 4.7 s (n=69).
- **Latency, end to end:** from letting go of the mic button to KIBO's first tap on the kiosk, p50 6.9 s, p95 8.6 s (15 turns with synthetic voices on the live site, phone and kiosk in separate browser sessions paired over Supabase, Nov 3, before the change above). Our target was p95 under 4 s, and we did not meet it. In those turns the transcription round trip took p50 2.1 s and Spark p50 3.7 s, and everything except Spark already added up to p95 4.2 s.
- **Small user trial:** three people who struggle with kiosks did the same task by touch and with KIBO. Touch: ⟦T_DONE⟧/3 finished. KIBO: ⟦K_DONE⟧/3 finished. Median time −⟦DROP⟧%. This is a small trial (n=3, ⟦TRIAL_DATE⟧), not a clinical study.

## Run locally

Requires Node.js (developed on 24.x) and a Meta Model API key.

```bash
npm ci
# Create .env.local in the repository root (server only; never commit it) with:
#   MODEL_API_KEY                   Meta Model API key (required)
#   NEXT_PUBLIC_SUPABASE_URL        optional: pair a real phone through Supabase Realtime
#   NEXT_PUBLIC_SUPABASE_ANON_KEY   optional: same
npm run dev
```

Open http://localhost:3000/kiosk/fastfood (or `/kiosk/airport`, `/kiosk/train`). The page adds a random room to its address. Then either:
- open `/phone?room=<the same room>` in the same browser, or
- with the Supabase keys set, scan the QR code on the kiosk screen with a phone.

The microphone and camera need `localhost` or HTTPS. For recording or judging, use a production build: `npm run build && npm start`. The production build always applies the rate limits above.

To check the Supabase connection once the keys are set:

```bash
node --env-file=.env.local --import tsx scripts/realtime-smoke.mts
```

It prints PASS/FAIL and milliseconds only.

## Repository layout

```
src/
  engine/       spark.ts (Muse Spark), transcribe.ts (Muse Voice Transcribe), turn.ts (one conversational turn),
                yes.ts (fixed confirmation list), wav.ts, idle.ts, run.ts, trialLog.ts
  kiosks/
    fastfood/   menu, state machine, planner, Spark schema and prompt, screens
    airport/    booking, state machine, planner, Spark schema and prompt, gate texts, screens
    train/      stations and timetable, state machine, planner, Spark schema and prompt, gate texts, screens
    keywords.ts Transcribe keyword hints per kiosk
  guide/        guide mode: locate (Spark), sam (SAM 3.1), verify, geometry, speech
  phone/        phone app and guide mode screen
  server/       rate and size limits
  sync/         phone ↔ kiosk messages and room codes
  ui/           KIBO band and pointer
  app/          pages and API routes
eval/           evaluation sets, scorers and results (see eval/README.md)
scripts/        experiments and the Realtime connection check
DEPLOY.md       deployment checklist
```

## Fictional brands and synthetic data

Bridge Burger, Bridge Air, Bridge Rail, Haneul Sky, Nova Wings and Seabird Air are invented. So are all menus, prices, flight and train numbers, stations, timetables, bookings, passenger names and passport numbers. Bridge Air (purple) and Bridge Rail (graphite and wine) use colors picked to avoid those of real Korean airlines and rail operators. Any resemblance to real companies or people is coincidental. Airport codes (ICN, NRT) are used only as place names. This repository contains no real person's voice, photo or document. The guide-mode evaluation photos are not included (see `eval/README.md`). Demo voices are either consenting participants or synthetic, and synthetic voices are labelled in the video.

## Limitations

- Speed: about 7 s (p50) from letting go of the mic button to the first tap, against our 4 s target (see Evaluation).
- Fast food: changing or removing items already in the cart, cancelling the whole order, and leaving midway are not supported yet.
- Train: one-way reserved tickets only. Round trips, refunds, changes and discounts other than adult, child and senior are refused.
- Pairing trusts whoever can see the kiosk screen: the QR carries a random 22-character room token, and a spoken "yes" only counts for the confirmation card currently on screen. There is no user account or device authentication. ⟦SECURITY⟧
- The rate limit is kept in each server instance's memory. On a platform that runs several instances, each counts separately. We saw this on Vercel: in one burst of 30 requests, requests 23–24 got 429 and 25–30 passed again.
- A partial menu name can be read as a nearby item instead of being refused. In our checks, Korean "치즈버거 세트" (cheeseburger set) became Double Cheeseburger in 4 of 4 runs, and English "cheeseburger" became Bridge Classic in 2 of 3. Names that are not on the menu at all were refused in 18 of 18 runs.
- The kiosks are our own replicas modeled on real fast-food, airport check-in and train ticket flows, not vendor kiosks. A real kiosk would have to accept KIBO's taps the way ours do, and we have not connected one.
- KIBO is an assistive tool for the person at the kiosk. It does not make a kiosk compliant with accessibility law.

## License

⟦LICENSE⟧
