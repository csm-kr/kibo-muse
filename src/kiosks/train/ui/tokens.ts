// Bridge Rail 색 토큰. 키오스크 루트에만 건다.
// 흑연 + 와인(색상각 약 340°): KIBO 청록·주황, Bridge Burger 코발트, Bridge Air 보라, KTX 남색·파랑과 겹치지 않게 골랐다.
// 대비(흰 바탕 또는 흰 글자): graphite 15.8, wine 10.1, wine/rose 8.7, muted 7.0. KIBO 주황 고리와 wine 사이 3.6
import type { CSSProperties } from "react";

export const railVars = {
  "--br-graphite": "#1F2328", // 머리 띠·첫 화면·발급 화면
  "--br-wine": "#7A1E3C", // 주 버튼·고른 칸
  "--br-press": "#631830", // 누름 상태
  "--br-rose": "#F8EAF0", // 고른 운임 칸·창가 좌석 바탕
  "--br-line": "#D9D3D6", // 카드 테두리(장식)
  "--br-muted": "#5D585B", // 보조 글
  "--br-ink": "#1B1A1C", // 본문
} as CSSProperties;
