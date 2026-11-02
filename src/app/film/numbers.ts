// 영상(FILM.md) 카드의 숫자는 모두 여기서만 읽는다. 아직 재지 않은 값은 null로 두면 카드에 빨간 TBD로 그린다.
// 값을 채울 때는 출처를 옆 주석에 남긴다.

import type { Value } from "./fill";

export const numbers: Record<string, Value> = {
  // 장면 6 통계 카드. 문구·출처는 FILM.md 4절(critic-demo 조사)
  STAT1: "5 / 5",
  STAT2: "2.2 billion",
  STAT3: "June 28, 2025",
  // 장면 4. 터치 경로 탭 수(사용자 시험 P1 값이 나오면 바꾼다), 화면 수는 /compare RunBar 실측
  TAPS_TOUCH: 14,
  SCREENS: 13,
  // 장면 11. 확정값(11/3), FILM.md 1절. 정확도·차단은 보류 세트 H(set-H.json sha1 f9683b998e, 실행 전 고정, 실행 뒤 정답 수정 0),
  // 동결 후보 1 빌드 f4076fabbd에서 --repeat 3. 개발 세트(82 / 61 of 62 / 60/60)는 README에만 쓴다
  // N_UTT = 서로 다른 요청 수(일반 40 + 위험 10), N_LANG = ko·en·ja·vi 각 10개
  N_UTT: 50,
  // EXACT의 분모: 일반 요청 40개(위험 10개는 BLOCK)
  N_OK: 40,
  N_LANG: 4,
  // "spoken"은 Transcribe를 거친 실제 사람 녹음 평가를 돌린 경우만. 이번 평가는 글 입력(음성 0)
  UTT_KIND: "typed",
  // 40개 중 3회 모두 맞은 수(실행 단위 119/120). 카드에 "39 of 40"으로 쓰고 백분율로 바꾸지 않는다(97.5를 98로 올리지 않기)
  EXACT: 39,
  EVAL_DATE: "Nov 3, 2026",
  // 위험 요청 10개 × 3회 = 30/30 차단, 위험 동작 0, 거짓 수락 0
  BLOCK: 100,
  // 패스트푸드 planner.test.ts 걷기 속성 테스트를 PROP_RUNS=1000으로 따로 돌린 실측(11/3, 1000회 모두 통과, 주문 확인 도달률 0.599).
  // 한 번에 150–250걸음, 걷는 내내 KIBO 결제를 찔러 보고 모두 막힘. 기본 테스트는 60회
  // 자막과 같게 천 단위 쉼표를 넣은 글자로 둔다
  PROP_RUNS: "1,000",
  // 글 요청 → 계획 준비까지(Spark 해석 + 계획). 규칙대로 지연은 개발 세트 최종 3회 값(f4076fabbd). 참고: 보류 세트 2.3 / 4.4, n=165
  LAT_P95: 4.8,
  LAT_P50: 2.2,
  // 지연 측정 수(개발 세트 최종 평가에서 계획까지 잰 요청 수)
  N_LAT: 234,
  // 장면 10. 안내 모드(동결 후보 1 f4076fabbd, 22케이스 1회차 중 실제 사진 12장, critic-tech 정답). 22케이스 전체(15·1·6)는 README에
  GUIDE_HIT: "12 real kiosk photos: 8 right · 0 wrong · 4 not sure",
  // 장면 12. 사용자 시험
  TRIAL_DATE: null,
  // 장면 13
  REPO: null,
};

// 장면 12 표. done: 끝냈는가(null = 아직 모름), time: "2:41" 같은 영상 기준 시간, seq: 사후 설문 SEQ(1–7)
export interface PersonRow {
  name: string;
  touchDone: boolean | null;
  touchTime: string | null;
  kiboDone: boolean | null;
  kiboTime: string | null;
  seqTouch: number | null;
  seqKibo: number | null;
}

// 그룹 표시("70s", "Low vision")는 동의서에서 그 항목에 동의한 경우만 이름 뒤에 붙인다(건강 정보)
export const people: PersonRow[] = [1, 2, 3].map((i) => ({
  name: `Participant ${i}`,
  touchDone: null,
  touchTime: null,
  kiboDone: null,
  kiboTime: null,
  seqTouch: null,
  seqKibo: null,
}));
