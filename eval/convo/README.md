# Conversation scenarios

The interpretation and train evaluations check what KIBO *does* (the planned taps). This one checks what KIBO *says*: whether a reply answers what was asked, uses only facts the kiosk has, never claims a tap it did not make, names what is not on the menu instead of swapping it, and does not repeat itself.

## Sets

179 short conversations (230 typed turns), written from the kiosks' own data files (`src/kiosks/fastfood/menu.ts`, `src/kiosks/airport/booking.ts`, `src/kiosks/train/rail.ts`) before any of the fixes below. Most turns are Korean (188), the rest English (31), Japanese (6) and Vietnamese (3). Each turn has the expected behavior in words and, where it can be checked by code, required patterns (`must`), items that do not exist (`notAvail`) and expected intent fields.

| Kiosk | Development | Held out |
|---|---|---|
| Fast food | 48 conversations, 60 turns | 12, 14 |
| Airport | 47, 65 | 11, 13 |
| Train | 49, 63 | 12, 15 |

About 20% of each kiosk's conversations were held out at random before the first run. Fixes were made only from development-set failures, with one exception noted under Results.

## How a run works

`run.cjs` opens the kiosk page of a running dev or production server in a headless browser, types each turn into the kiosk's developer console, waits for the reply and the taps, and records the reply, the plan, the kiosk screen and the API response. Turns that start with `@click:` press a console button instead (for example a passport scan). Every turn calls Muse Spark.

`judge.mts` scores the replies. Automatic checks, computed from the same data files the kiosks use:

| Check | Fails when |
|---|---|
| (a) answer | a required fact (`must`) is missing from the reply |
| (b) facts | a price, time, travel time, flight number, gate or seat in the reply does not match the data, a station name is misspelled, or something that does not exist (an item in `notAvail`, an invented menu item or station) is spoken of as available |
| (c) false action | the reply claims payment, or claims something was added or done on a turn with no taps |
| (d) language | the reply is not in the language of the turn |
| (e) repetition | the reply is the same as the previous turn's, or a question gets only a fixed template or only a request for missing details |
| (f) length | more than 3 sentences, or a sentence too long to listen to |

A rubric pass then reads each reply against the expected behavior. It was done blind (no build or time shown) by a separate model instance (Claude), using the sheet printed by `judge.mts --sheet`, and labels each failure by layer: speech recognition, Spark, or server policy.

## Run it

```bash
npm i --no-save playwright-core && npx playwright-core install chromium
npx next dev -p 3100          # with the Meta Model API key on the server
cd eval/convo
node run.cjs fastfood fastfood.dev.json results/fastfood.dev.json
cd ../.. && npx tsx eval/convo/judge.mts fastfood eval/convo/fastfood.dev.json eval/convo/results/fastfood.dev.json --fails
```

Runs are resumable: conversations already in the output file are skipped.

## Results

"Before" is build 22 (Nov 4, before any of these fixes). "Final" is build 23: fast food and train from the third run, airport from the fifth (two more airport prompt changes). Rubric = share of turns judged right; conversations = all turns right. Spark = median Spark time per turn on the dev server, three requests sent at once.

| Set | Auto checks clean | Rubric | Conversations | Spark median |
|---|---|---|---|---|
| Fast food, development | 83% → 100% | 65% → 95% | 29 → 45 of 48 | 3.9 s → 2.6 s |
| Fast food, held out | 79% → 100% | 79% → 100% | 9 → 12 of 12 | 4.0 s → 2.3 s |
| Airport, development | 56% → 100% | 43% → 98% | 12 → 46 of 47 | 4.2 s → 3.5 s |
| Airport, held out | 58% → 100% | 33% → 83% | 3 → 9 of 11 | 4.6 s → 3.8 s |
| Train, development | 97% → 97% | 95% → 98% | 46 → 48 of 49 | 4.9 s → 4.6 s |
| Train, held out | 100% → 93% | 100% → 93% | 12 → 11 of 12 | 4.6 s → 4.4 s |

In every final run: fact errors (b) 0, claimed actions or payments that did not happen (c) 0, the same reply twice in a row 0. The two automatic (e) hits on train development turns are the fixed refusal for discounts, which the rubric judged correct.

**Held-out caveat.** The second run (r2) showed two facts missing from the prompts on held-out turns: points via the app barcode (fast food) and the excess-bag fee (airport). We added both, so the final held-out numbers are not fully blind. The r2 held-out rubric, before those two facts: fast food 86%, airport 75%, train 100% (`results/*.holdout.r2.*`).

**What still fails (final runs).**
- Fast food: "포장이요" as the first words gets the eat-in/take-out tap but no question about what to eat in the console (the phone's done message asks it); "불고기로요" after "버거 세트 하나" asks set or single again; one run left out that mobile vouchers are accepted.
- Airport: after check-in the kiosk returns to its first screen after 20 s, so "one more bag" starts a new check-in; two held-out questions ask about facts the kiosk shows but the prompt does not carry.
- Train: a round-trip request gets the fixed one-way-only refusal without offering the one-way ticket; one held-out fare question in Japanese got only the follow-up question, because the language guard dropped Spark's answer (the same turn passed in r2).

Files: `results/<kiosk>.<set>.{before,final}.json` (replies), `….rubric.json` (rubric labels: PASS/FAIL, reason, layer).
