// Bridge Burger 색 토큰과 글꼴 목록. 키오스크 루트에만 건다(앱 전체 layout과 휴대폰은 그대로).
// 색: 주요 버거 브랜드 색(빨강·노랑·주황·갈색)과 KIBO 표시 색(주황 고리 #F97316, 청록 점)을 피해 남색·코발트를 쓴다.
// 남색은 주황 고리와 보색이라 KIBO가 누르는 자리가 가장 잘 보인다. 대비 값은 critic-demo kiosk-spec.md §2.
// next/font를 부르지 않는다: 이 모듈을 가져오는 페이지에 Noto Sans KR @font-face 125개(차단 CSS 27KB)가 붙어
// Lighthouse 모바일 FCP 0.8→1.4초, LCP +0.3초가 됐다(재디자인 전 같은 로컬 조건 기준선과 비교).
import type { CSSProperties } from "react";

export const bbVars = {
  "--bb-navy": "#16264A", // 브랜드 글자·선택 표시·안내 띠. 흰 바탕 14.9
  "--bb-ink": "#141B2B", // 본문. 흰 바탕 17.2
  "--bb-cobalt": "#2E5BDB", // 주 버튼 바탕(흰 글자 5.78)·선택 테두리·단계 ✓
  "--bb-cobalt-press": "#2149B8", // 누름 상태(흰 글자 7.75)
  "--bb-tint": "#E7EDFB", // 포인트 상자·선택된 카드 바탕(남색 글자 12.7)
  "--bb-cream": "#F6F3EE", // 레일·대기 화면 아래 바탕
  "--bb-photo": "#ECE8E2", // 사진 자리 바탕(생성 사진 배경 평균 #E8E4DF)
  "--bb-line": "#D9D4CB", // 카드 테두리(장식)
  "--bb-muted": "#5B6270", // kcal·보조 글. 흰 바탕 6.13
  "--bb-berry": "#B3125F", // NEW·뺌·카드 투입 알약(흰 글자 6.63)
} as CSSProperties;

// 한글 고딕을 앞에 둔다(Geist에는 한글이 없어 글자마다 대체 글꼴이 섞인다). 키오스크가 내려받는 글꼴은 없다.
// "Noto Sans KR"은 휴대폰이 next/font로 등록한 화면(/compare)에서만 쓰여 두 화면 글꼴이 같아진다(이것을 빼도 /compare 성능은 같았다).
// 없으면 리눅스 Noto Sans CJK KR(같은 디자인), 맥 Apple SD Gothic Neo, 윈도 맑은 고딕
export const krFont = '"Noto Sans KR", "Noto Sans CJK KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
