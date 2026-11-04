# KIBO — Kiosk Intelligence Bridge & Operator

Say one sentence on your phone. KIBO works the kiosk's own screens for you, one visible tap at a time, and stops wherever a person must act. Muse Spark only proposes what you asked for; our server turns it into taps and checks every tap against the kiosk's own state machine; paying, consenting and scanning documents stay with the person. It is for the people kiosks leave behind: older adults, people with low vision, and travelers who can't read the screen.

> **Not an official Meta product.** KIBO is an independent entry to the Meta Global AI Developer Hackathon 2026, hosted by Meta and Cerebral Valley (Indie Developer track). It uses Meta models through the Meta Model API. It is not built, endorsed or reviewed by Meta.

- Demo video: https://youtu.be/yN6VwokL_bA
- Live demo: https://kibo-muse.vercel.app. **No phone needed:** start with "Touch vs KIBO" (`/compare`) and type a sentence into the phone panel on the right.

## Built during the hackathon

- All code in this repository was written during the hackathon (Oct 26 – Nov 4, 2026, US Eastern). The first commit, `f64758a` (Create Next App scaffold, 2026-11-02 15:33 KST), and every commit after it are in `git log`.
- Third-party code is limited to the packages listed in `package.json` (Next.js, React, Tailwind CSS, Supabase Realtime client, qrcode, sharp, Vitest, fast-check and others).
- **AI coding tools.** Most of the code in this repository was written with an AI coding assistant (Claude Code) during the event, under the author's direction. The author chose the design and the safety rules, reviewed the changes, and ran the tests, evaluations and user checks reported below.

## How it works

```
Phone (tap once and talk, or type; 6 languages)
  ├─ 16 kHz mono WAV ─▶ /api/transcribe ─▶ Muse Voice Transcribe 1.0 (file API, PUSH_TO_TALK)
  └─ transcript ─────▶ /api/fastfood/interpret, /api/airport/interpret or /api/train/interpret
                          ├─ Muse Spark 1.3, structured output → intent (or one clarifying question)
                          │    sent three times at once; the first complete answer wins, the rest are cancelled
                          ├─ deterministic planner: intent → the exact taps
                          └─ kiosk state machine: every tap checked (same path as touch input)
Kiosk screen ◀── taps replayed with a visible pointer: first tap 160 ms after the plan arrives, then 480 ms per step
Phone        ◀── step list, fixed gate cards, short spoken replies (Gemini TTS streamed by /api/speak; device voice as fallback)

Guide mode (any kiosk, no connection needed)
Phone camera photo + question ─▶ /api/guide
  ├─ Muse Spark 1.3: which button
  ├─ SAM 3.1: the button's outline (Spark chooses the button; SAM makes the drawing fit it)
  └─ check: Spark reads the cropped outline again; if the label does not match, nothing is drawn
```

Phone ↔ kiosk messages go through `src/sync/link.ts`. In one browser they use a BroadcastChannel. When Supabase keys are set, the same messages also go over Supabase Realtime broadcast (no database tables), so a real phone pairs by scanning the QR code on the kiosk screen.

KIBO answers in the language the phone is set to, unless the person clearly spoke another language (three or more words, none in the phone's own script). Then it answers in the spoken language and the phone offers a one-tap switch back. Replayed over the 468 saved evaluation sentences: the scorer's requests (no phone language) changed 0; with a Korean phone, 273 of 276 non-Korean sentences switched (the 3 misses were "はい？") and 0 of 192 Korean ones did, even when the rule was told that Spark had misread the language. If Spark writes a follow-up question in a language other than the reply language, the server replaces it with a fixed question. When a step fails (for example the kiosk stops answering or the phone goes offline), the phone shows a fixed message in its language and reads it aloud. The kiosks themselves show Korean or English, one at a time, and a test walks every screen of all three kiosks to check that no untranslated text is left (`src/kiosks/i18n.test.ts`).

On the first tap after pairing, KIBO says which kiosk the phone is connected to, what to tell it, and that you can ask it anything (for example, at the burger kiosk: "Hello! You're connected to the Bridge Burger kiosk. Just tell me what you'd like to eat. If you have any questions, just ask."). The same greeting shows on the phone as soon as it pairs. One tap on the mic is enough for a whole conversation: the phone sends what you said 1.5 s after you stop talking, and it listens again as soon as the kiosk has finished tapping, even while KIBO is still speaking. If you start talking over KIBO, KIBO stops speaking and only your words are sent: while KIBO speaks, the phone measures how loud KIBO's own voice comes back into the mic and treats only a clearly louder sound lasting 0.3 s as you. We tested this with a simulated mic in Chromium, not yet on a real phone. It stops after 8 s without speech, when it is your turn at the kiosk (for example to pay), at the receipt, or when the page is hidden, and it waits while a confirmation card is open. Holding the button still works as push-to-talk. With a screen reader, a double tap is that one tap. While KIBO taps 14 times, the progress band is announced 2 times instead of 27. We checked this with simulated screen-reader clicks in Chromium, not yet with VoiceOver or TalkBack on a real phone.

| Page | What it is |
|---|---|
| `/kiosk/fastfood` | Bridge Burger fast-food kiosk (fictional). `?view=kiosk` shows the kiosk alone with a pairing QR; `&qr=0` hides it |
| `/kiosk/airport` | Bridge Air self check-in kiosk (fictional). Same options |
| `/kiosk/train` | Bridge Rail reserved-ticket machine (fictional). Same options |
| `/phone?room=…` | The phone app: tap once and talk (it keeps listening) or type, six languages, step list, gate cards, guide mode |
| `/compare` | Touch and KIBO side by side, with live counters for screens, taps and time |
| `/show/airport` | Airport kiosk with the phone beside it, used for the demo video |
| `/film/*` | Title and number cards used in the demo video. Numbers come only from `src/app/film/numbers.ts` |

## Safety boundaries

1. **Payment stays with the person.** The fast-food and train state machines reject Pay unless it comes from touch. KIBO stops before payment and tells the user which button to tap. Inserting a card is a device event KIBO cannot produce.
2. **Consent stays with the person.** The airport's dangerous-goods declaration, the final check-in confirmation and a train that leaves more than an hour after the requested time need the person's confirmation. Only the phone can give it, by its button or by a "yes" from a fixed six-language list (`src/engine/yes.ts`) matched without calling the model. Spark's schemas have no consent fields.
3. **Documents stay with the person.** Passport scans are device events. KIBO cannot produce them; it waits (`src/kiosks/airport/machine.ts`).
4. **The model proposes, the kiosk decides.** Spark returns an intent only. A deterministic planner turns it into taps, the kiosk's state machine checks each tap, and the API rejects any plan containing events not attributed to KIBO (`src/app/api/*/interpret/route.ts`). Missing required details get one question, not a guess. Before it taps, KIBO reads back what it understood ("Bridge Classic without pickles, take out."); that read-back is built by the server from the planned kiosk state, not written by Spark, and it names anything that is not on the menu first. When there is nothing to tap (a question about prices, calories, a flight's gate, a fare, or an item the kiosk doesn't have), KIBO answers with Spark's short reply, written from the facts given in the prompt (menu, prices, calories and payment methods; the flight, gate and bag rules; the timetable and fares) and replaced by fixed text if it is in the wrong language. Unsupported requests and out-of-range values are refused with fixed, hand-written text in six languages.
5. **Guide mode only points.** It never taps. A wrong outline is worse than none, so an outline is drawn only after a second check.
6. **Cost limits.** A production build limits each IP to 20 interpretation, 20 transcription, 6 guide and 40 speech requests per minute, and caps request sizes (`src/server/guard.ts`).

Audio and photos are sent to Meta models for that one request and are not stored by this app. KIBO's own short replies (not what the user said) are sent to Google's Gemini TTS to be read aloud, and are not stored by this app either.

## Evaluation

Details, definitions and commands to reproduce: [`eval/README.md`](eval/README.md).

- **Tests:** `npm test` runs 310 unit and property tests in 75 files (Vitest, fast-check). The property tests take random walks over kiosk events. The fast-food and airport walks run 60 times each in `npm test`, and the fast-food walk also passed 1,000 walks in a separate run (`PROP_RUNS=1000`). They check that KIBO alone can never pay, never pass a consent gate without the person, and never create passport, card or consent events.
- **Interpretation, held-out set:** 50 typed requests for the fast-food and airport kiosks (40 everyday, 10 attack; Korean, English, Japanese and Vietnamese, 10 everyday each). The evaluator wrote them after development and fixed the expected answers before the run. Each response is scored by replaying the planned taps through the state machine and comparing the final kiosk state with the expected one. Exact on everyday requests in all 3 runs: 39 of 40. Unsafe requests blocked: 30/30 (10 × 3 runs). Unsafe actions: 0.
- **Interpretation, development set:** 82 typed requests (62 everyday, 20 attack) from 16 kiosk start states, also used to find and fix failures during development. Exact: 61 of 62. Blocked: 60/60. One of the passes, ff-a2 ("A cheeseburger combo, please"), only checks the follow-up question, not which burger was chosen; in the final run it chose Bridge Classic twice and Double Cheeseburger once.
- **Train eval set (development set):** 22 typed requests (17 everyday including 2 for features the machine does not have, 5 attack), also used for fixes. Exact on everyday requests in all 3 runs: 15 of 15. Both missing-feature requests answered honestly. Attacks blocked: 15/15. Unsafe actions: 0.
- **Conversation scenarios (what KIBO says, Nov 5):** 179 short conversations (230 typed turns, mostly Korean, some English, Japanese and Vietnamese), written from the kiosks' data files, 20% held out. Each reply is checked by code against the data (missing answer, wrong price, time, gate or fare, something that doesn't exist spoken of as available, a tap or payment claimed that didn't happen, wrong language, repetition, length), then read blind against the expected behavior by a separate model (Claude). Replies judged right on the development sets, before → after the changes below: fast food 65% → 95%, airport 43% → 98%, train 95% → 98%. Held out: 79% → 100%, 33% → 83%, 100% → 100%. Fact errors, claimed actions that didn't happen and the same reply twice in a row: 0 in every final run. Two facts (points via the app barcode, the excess-bag fee) were added after an earlier held-out run showed them missing, so the final held-out numbers are not fully blind; that earlier run gave 86%, 75% and 100%. Details: [`eval/convo/README.md`](eval/convo/README.md).
- **Guide mode:** 22 cases, one run each: 15 right · 1 wrong · 6 not sure (nothing drawn). The one wrong outline is A4, an adversarial photo with a fake "pay by QR" sticker. On the 12 real kiosk photos: 8 right · 0 wrong · 4 not sure. This photo set was also used to set the verification rules. On 10 unseen real photos (Wikimedia Commons, one run, fixed before running): 5 right · 1 wrong · 4 not sure, with the button's name given in all 10. The wrong outline covered the right button plus the empty screen next to it. Median time 17 s. Details in [`eval/README.md`](eval/README.md#unseen-real-photos-held-out).
- **What SAM 3.1 adds (paired test):** SAM 3.1 does not choose the button. We ran the same 32 photos twice with and without SAM, with pass criteria fixed before running. SAM did not change how often the right button was outlined (29 of 64 both ways; wrong outlines 2 with SAM, 1 without). More of the drawn area landed on the button (88% vs 74%), and the median time rose by 1.3 s. That is below the 15-point gain we had set as the bar, so we count SAM as a display improvement, not an accuracy gain. Details in [`eval/README.md`](eval/README.md#what-sam-31-adds-paired-test).
- **Change after evaluation: two Spark requests at once.** Spark's time for the same sentence varies widely (3.2 s, 3.9 s and 23.1 s for one sentence), so the server sent each interpretation request twice and used the first complete answer (three times from build 17, below). Re-run with both answers recorded: held-out set 119/120 everyday runs exact and 30/30 blocked, the same as before; development sets 307/312 hedged against 307 and 309 for the two single answers. Details in [`eval/README.md`](eval/README.md#change-after-evaluation-hedged-requests).
- **Latency, typed request → plan** (speech transcription and replay not included, before the change above): p50 2.2 s, p95 4.8 s (n=234, development set). Held-out set: p50 2.3 s, p95 4.4 s (n=165). Train: p50 3.0 s, p95 4.7 s (n=69).
- **Latency, end to end (Nov 4, build 17):** 10 conversation turns with a synthetic Korean voice on the live site, phone and kiosk in separate browser sessions paired over Supabase. From the moment the phone sends the recording (1.5 s after the speaker stops) to KIBO's reply: p50 5.8 s, p90 7.4 s (range 4.7–8.2 s). Transcription took p50 1.5 s and Muse Spark p50 3.6 s, p90 4.5 s. KIBO's voice starts about 0.7 s after the reply, so from the end of speech to KIBO's voice it was p50 8.0 s. Our target was p95 under 4 s from sending to reply, and we did not meet it. Since then, as soon as the transcript comes back, the phone plays a short pre-recorded acknowledgement in the user's language that fits what was said: a question gets "Let me check", a request "Sure, on it", a short answer "Okay" (three variants of each, rotated, so it does not repeat). The wait is not silent, and the real reply cuts it off. We kept the 1.5 s end-of-speech wait: on 16 slow, hesitant synthetic orders (Korean, English, Japanese, Vietnamese; two voices), a 1.0 s wait cut 5 of them off mid-sentence and 1.5 s cut none.
- **Change after evaluation: faster Spark.** About a third of Spark requests took 4–5 s longer than the rest, whatever the conversation state. Build 17 sends each interpretation request three times instead of two and drops two always-empty fields from the fast-food schema when nothing is being configured. In a same-hour A/B (20 calls each) Spark went from p50 6.0 s, p90 10.5 s to p50 4.65 s, p90 6.2 s. Re-run after the change: held-out 39/40 everyday and 10/10 blocked, development set 61/62 and 20/20, train 15/15 and 5/5, unsafe actions 0. Measured an hour earlier on build 16, the same live conversation test gave Spark p50 8.8 s and sending → reply p50 11.0 s (7 turns).
- **Change after evaluation: answers from the kiosk's own facts (Nov 5, build 23).** The prompts now carry the facts each kiosk shows (calories, new and recommended items, payment, points; flight times, gate, bag allowance and fee, power banks, paid seats; timetable and fares), and before tapping KIBO reads back what it understood (server text built from the planned kiosk state). Re-run on the final prompts (the airport items of the held-out and attack sets again after the last airport prompt change): held-out set 119/120 everyday runs exact and 30/30 blocked; development set 60 of 62 exact in all 3 runs and 60/60 blocked; train 15/15 and 5/5; unsafe actions 0. The two development misses: ap-g2 (a known trade-off, "Yes, I understand" is not taken as consent) and ff-a2, where "A cheeseburger combo" now gets "Which cheeseburger, Bridge Classic or Double Cheeseburger?" instead of a guess, which the fixed expectation counts as wrong. Spark p50 on the held-out set: 3.5 s in both the first and the final run of this round. Build 24 (same day) adds three prompt rules found by the conversation scenarios: quote each item's price exactly instead of generalizing one, never say something was added or changed while still asking, and keep Hangul out of non-Korean replies (a mixed reply was being replaced by a fixed fallback). Re-run on build 24: held-out set 120/120 exact and 30/30 blocked, development set 60 of 62 (the same two) and 60/60 blocked, unsafe actions 0; held-out Spark p50 3.6 s. A real-voice run on build 24 (10 conversations) showed three more reply faults, fixed in build 25 with a test each: "I'll make the 1 taps" (English and Spanish now say "the tap"), a train reply that gave a wrong departure minute when the asked-for window seat was already booked (the server now says the booked seat instead of Spark's sentence), and a misspelled airline name in a Spark question (one-letter Korean misspellings of the four airline names are corrected; 0 of 455 saved airport replies changed). The next real-voice run, on build 25, counted "할머니랑 저 둘이" (me and my grandmother) as two adults; build 26 tells Spark that a grandparent is a senior (5 of 5 probes right; train evaluation 45/45 and 15/15 after the change). On build 26 all 10 real-voice conversations ended as expected (two of them were re-run because a request was lost to a network drop on the test machine).

## Run locally

Requires Node.js (developed on 24.x) and a Meta Model API key.

```bash
npm ci
# Create .env.local in the repository root (server only; never commit it) with:
#   MODEL_API_KEY                   Meta Model API key (required)
#   GEMINI_API_KEY                  optional: Google AI Studio key for spoken replies (without it the phone uses its built-in voice)
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

- On an English or Spanish phone, switching to the spoken language relies on Spark's language label alone, because those languages have no script of their own to check.
- Speed: about 5.8 s (p50) from sending the recording to KIBO's reply in live conversations, of which Muse Spark takes about 3.6 s, against our 4 s target (see Evaluation).
- Fast food: changing or removing items already in the cart, cancelling the whole order, and leaving midway are not supported yet.
- Train: one-way reserved tickets only. Round trips, refunds, changes and discounts other than adult, child and senior are refused.
- Pairing trusts whoever can see the kiosk screen: the QR carries a random 22-character room token, and a spoken "yes" only counts for the confirmation card currently on screen. There is no user account or device authentication.
- The rate limit is kept in each server instance's memory. On a platform that runs several instances, each counts separately. We saw this on Vercel: in one burst of 30 requests, requests 23–24 got 429 and 25–30 passed again.
- A partial menu name can be read as a nearby item instead of being refused. In our checks before build 23, Korean "치즈버거 세트" (cheeseburger set) became Double Cheeseburger in 4 of 4 runs, and English "cheeseburger" became Bridge Classic in 2 of 3. In build 23, English "A cheeseburger combo" got a question naming two burgers in 3 of 3 runs; we did not re-check the Korean case. Names that are not on the menu at all were refused in 18 of 18 runs.
- Spark's answer to the same question varies between runs: in one run it left out that mobile vouchers are accepted. After airport check-in the kiosk returns to its first screen after 20 s, and KIBO does not remember that check-in, so "one more bag" then starts a new check-in instead of pointing to the baggage counter.
- The kiosks are our own replicas modeled on real fast-food, airport check-in and train ticket flows, not vendor kiosks. A real kiosk would have to accept KIBO's taps the way ours do, and we have not connected one.
- KIBO is an assistive tool for the person at the kiosk. It does not make a kiosk compliant with accessibility law.

## License

Code: MIT, see [LICENSE](LICENSE). The guide-mode evaluation photos are not in this repository; their sources, authors and licenses are listed in `eval/guide/cases-unseen.json`.
