// Bridge Air 색 토큰. 키오스크 루트에만 건다.
// 보라 계열(색상각 약 267°): KIBO 청록·주황, Bridge Burger 코발트, 국내 항공사 대표색(하늘색·주황·연두·빨강)과 겹치지 않게 골랐다.
// 대비(흰 바탕 또는 흰 글자): plum 13.9, violet 9.4, press 11.6, muted 6.9, berry 7.4, violet/tint 7.9. KIBO 주황 고리와 violet 사이 3.3
import type { CSSProperties } from "react";

export const airVars = {
  "--ba-plum": "#3B1D5A", // 머리 띠·제목 탭·제목 글자
  "--ba-violet": "#5B2E91", // 주 버튼·현재 좌석·선택 테두리
  "--ba-press": "#4A2477", // 누름 상태
  "--ba-tint": "#F0EAF8", // 고른 칸 바탕·안내 띠
  "--ba-lilac": "#D9CCEC", // 고를 수 있는 좌석
  "--ba-line": "#DCD5E5", // 카드 테두리(장식)
  "--ba-muted": "#5D5670", // 보조 글
  "--ba-ink": "#1C1726", // 본문
  "--ba-berry": "#A3195B", // 일행 좌석
} as CSSProperties;
