import { describe, expect, it } from "vitest";
import { BARGE_MS, NO_VOICE_MS, SILENCE_MS, speechEnd, trimSilence } from "./silence";

// 100ms마다 소리 크기를 넣는다. 말이 끝나 SILENCE_MS 동안 조용하면 그때 한 번 "end"
const feed = (end: (rms: number) => string | null, rms: number, ms: number, want = "end") => {
  const hits: number[] = [];
  for (let i = 0; i < ms / 100; i++) if (end(rms) === want) hits.push(i);
  return hits;
};

describe("speechEnd: 탭 모드에서 말이 끝났는지", () => {
  it("말소리를 들은 뒤 SILENCE_MS 동안 조용하면 한 번 끝낸다. 그보다 짧게 쉬면 끝내지 않는다", () => {
    const end = speechEnd();
    expect(feed(end, 0.004, 800)).toEqual([]);
    expect(feed(end, 0.12, 1500)).toEqual([]);
    expect(feed(end, 0.004, SILENCE_MS - 300)).toEqual([]);
    expect(feed(end, 0.1, 600)).toEqual([]);
    expect(feed(end, 0.004, SILENCE_MS + 1000)).toEqual([SILENCE_MS / 100 - 1]);
  });

  it("말소리를 NO_VOICE_MS 동안 한 번도 못 들으면(말하지 않음, 0만 오는 마이크, 고른 잡음) 보내지 않고 한 번 'none'을 낸다. 말을 들었으면 내지 않는다", () => {
    expect(NO_VOICE_MS).toBe(8000);
    expect(feed(speechEnd(), 0, 10_000)).toEqual([]);
    expect(feed(speechEnd(), 0, 10_000, "none")).toEqual([NO_VOICE_MS / 100 - 1]);
    expect(feed(speechEnd(), 0.015, 10_000, "none")).toEqual([NO_VOICE_MS / 100 - 1]);
    const heard = speechEnd();
    feed(heard, 0.004, 3000);
    feed(heard, 0.12, 1000);
    expect(feed(heard, 0.12, 10_000, "none")).toEqual([]);
  });
});

describe("speechEnd 끼어들기: KIBO가 말하는 동안(talking)", () => {
  // 0이 아닌 결과를 [몇 번째, 결과]로 모은다
  const run = (end: (rms: number) => string | null, rms: number, ms: number) => {
    const out: [number, string][] = [];
    for (let i = 0; i < ms / 100; i++) {
      const r = end(rms);
      if (r) out.push([i, r]);
    }
    return out;
  };

  it("메아리는 말소리로 치지 않고 말없음 시간도 세지 않는다. 메아리보다 훨씬 큰 소리가 BARGE_MS 이어지면 한 번 'barge', 그 뒤 조용하면 보통처럼 끝낸다", () => {
    let talking = true;
    const end = speechEnd(100, () => talking);
    // 반향 제거된 메아리 0.01이 10초: 끝도 말없음도 아니다
    expect(run(end, 0.01, 10_000)).toEqual([]);
    expect(run(end, 0.2, 600)).toEqual([[BARGE_MS / 100 - 1, "barge"]]);
    talking = false; // 휴대폰이 KIBO 읽기를 멈춘다
    expect(run(end, 0.004, SILENCE_MS + 500)).toEqual([[SILENCE_MS / 100 - 1, "end"]]);
  });

  it("사람이 이미 말하는 중에 KIBO 소리가 시작되면(인사가 늦게 시작) 바로 'overlap': KIBO가 비켜 주고 녹음은 자르지 않는다. 잡음 한 번(100ms)으로는 아니다", () => {
    let talking = false;
    const blip = speechEnd(100, () => talking);
    run(blip, 0.004, 1000);
    run(blip, 0.04, 100);
    talking = true;
    expect(run(blip, 0.01, 100)).toEqual([]);
    talking = false;
    const end = speechEnd(100, () => talking);
    expect(run(end, 0.004, 1000)).toEqual([]);
    expect(run(end, 0.2, 200)).toEqual([]);
    talking = true;
    expect(run(end, 0.2, 100)).toEqual([[0, "overlap"]]);
    talking = false;
    expect(run(end, 0.2, 1000)).toEqual([]);
    expect(run(end, 0.004, SILENCE_MS)).toEqual([[SILENCE_MS / 100 - 1, "end"]]);
  });

  it("반향 제거가 약해 메아리가 커도(0.1) 끼어들기가 아니다. KIBO가 스스로 말을 마치면 한 번 'free', 말없음은 그때부터 센다", () => {
    let talking = true;
    const end = speechEnd(100, () => talking);
    expect(run(end, 0.1, 5000)).toEqual([]);
    expect(run(end, 0.5, 400)).toEqual([[BARGE_MS / 100 - 1, "barge"]]);
    const quiet = speechEnd(100, () => talking);
    talking = true;
    expect(run(quiet, 0.1, 3000)).toEqual([]);
    talking = false;
    expect(run(quiet, 0, NO_VOICE_MS + 100)).toEqual([[0, "free"], [NO_VOICE_MS / 100, "none"]]);
  });
});

describe("speechEnd 끼어들기 리뷰 반영", () => {
  const run = (end: (rms: number) => string | null, rms: number, ms: number) => {
    const out: [number, string][] = [];
    for (let i = 0; i < ms / 100; i++) {
      const r = end(rms);
      if (r) out.push([i, r]);
    }
    return out;
  };

  it("소리가 나기 직전(재생 예약 0.1초·기기 목소리 준비)의 조용함을 메아리로 재지 않는다: 메아리 0.06에 스스로 끊기지 않는다", () => {
    const end = speechEnd(100, () => true);
    expect(run(end, 0, 300)).toEqual([]);
    expect(run(end, 0.06, 3000)).toEqual([]);
    expect(run(end, 0.3, 400)).toEqual([[BARGE_MS / 100 - 1, "barge"]]);
  });

  it("반향 제거가 잘 돼 메아리가 거의 없으면 0.4초 안에 재기를 마친다: KIBO가 말을 시작하고 0.5초 뒤 끼어들어도 알아챈다. 메아리를 잘못 재도(사람 목소리) 기준은 0.12를 넘지 않는다(11/5 시험 목소리 0.1초 크기 중간값 0.123, 0.3을 넘는 칸 없음)", () => {
    const end = speechEnd(100, () => true);
    expect(run(end, 0.004, 500)).toEqual([]);
    expect(run(end, 0.2, 400)).toEqual([[BARGE_MS / 100 - 1, "barge"]]);
    const loud = speechEnd(100, () => true);
    expect(run(loud, 0.2, 300)).toEqual([]);
    expect(run(loud, 0.13, 400)).toEqual([[BARGE_MS / 100 - 1, "barge"]]);
  });

  it("음절 사이 0.1초 틈은 봐준다: 0.4초 가운데 0.3초가 크면 끼어들기, 그 말 처음부터 남긴다. 0.2초 넘게 조용하면 처음부터 다시 센다", () => {
    const end = speechEnd(100, () => true);
    run(end, 0.01, 1000);
    expect([0.2, 0.01, 0.2, 0.2].map((x) => end(x))).toEqual([null, null, null, "barge"]);
    expect(end.lead).toBe(400 + 400);
    const gap2 = speechEnd(100, () => true);
    run(gap2, 0.01, 1000);
    expect([0.2, 0.01, 0.01, 0.2, 0.2].map((x) => gap2(x))).toEqual([null, null, null, null, null]);
  });

  it("KIBO 말끝에 겹친 짧은 말('네', 0.2초)은 끼어들기 기준에 못 미쳐도 버리지 않는다: 'free' 뒤 조용하면 보낸다. 그 말 앞부터 남긴다(lead)", () => {
    let talking = true;
    const end = speechEnd(100, () => talking);
    run(end, 0.01, 1500);
    expect(run(end, 0.2, 200)).toEqual([]);
    talking = false;
    expect(run(end, 0.004, 1700)).toEqual([[0, "free"], [SILENCE_MS / 100, "end"]]);
    // 0.2초 말 + 앞 0.4초
    expect(end.lead).toBe(200 + 400);
  });
});

describe("trimSilence: 받아쓰기로 보내기 전에 앞뒤 빈 소리를 자른다", () => {
  // rate 1000(1표본 = 1ms)으로 [조용 a ms][말 b ms][조용 c ms]를 만든다
  const clip = (a: number, b: number, c: number, quiet = 0.003) => Float32Array.from({ length: a + b + c }, (_, i) => (i >= a && i < a + b ? (i % 2 ? 0.2 : -0.2) : i % 2 ? quiet : -quiet));

  it("이어 듣기로 말하기 전 3초·말한 뒤 1.75초 빈 소리는 말 앞 0.4초·뒤 0.5초만 남기고 자른다(소리가 짧을수록 받아쓰기가 빠르다)", () => {
    const out = trimSilence(clip(3000, 2000, 1750), 1000);
    expect(out.length).toBe(400 + 2000 + 500);
    expect(Math.abs(out[400])).toBeCloseTo(0.2);
  });

  it("skipMs만큼 앞(끼어들기 전 KIBO 목소리 메아리)을 버린 뒤 자른다", () => {
    // [메아리 1초][조용 1초][말 2초][조용 1초]에서 앞 1.5초를 버린다
    const all = new Float32Array(5000);
    all.set(Float32Array.from({ length: 1000 }, (_, i) => (i % 2 ? 0.2 : -0.2)));
    all.set(clip(1000, 2000, 1000), 1000);
    const out = trimSilence(all, 1000, 1500);
    expect(out.length).toBe(400 + 2000 + 500);
    expect(Math.abs(out[400])).toBeCloseTo(0.2);
  });

  it("말소리가 없거나 잘라도 별로 줄지 않으면 그대로 둔다", () => {
    const silent = clip(5000, 0, 0);
    expect(trimSilence(silent, 1000)).toBe(silent);
    const tight = clip(300, 2000, 400);
    expect(trimSilence(tight, 1000)).toBe(tight);
  });
});
