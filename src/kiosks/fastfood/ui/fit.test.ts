import { createElement, type FC } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AirportStation } from "../../airport/ui/Station";
import { TrainStation } from "../../train/ui/Station";
import { FastfoodStation } from "./Station";
import ComparePage from "../../../app/compare/page";

// 기본값 = {}인 선택 인자라 createElement가 props 타입을 못 읽는다
const Fast: FC<NonNullable<Parameters<typeof FastfoodStation>[0]>> = FastfoodStation;

describe("키오스크 첫 화면", () => {
  // 서버 렌더는 창 크기를 모른다. 맞추기 전 크기로 그렸다가 바꾸면 화면이 밀린다(CLS 0.408). 맞출 때까지 숨긴다
  it("서버 렌더(창에 맞추기 전)는 main 랜드마크를 숨긴 채로 낸다", () => {
    for (const Station of [FastfoodStation, AirportStation, TrainStation] as FC[]) {
      // React 19는 사진(img)의 미리 불러오기 <link>를 앞에 낸다(Next에서는 <head>로 올라간다). 그 뒤 첫 요소가 숨긴 main이어야 한다
      expect(renderToStaticMarkup(createElement(Station)).replace(/^(<link [^>]*>)+/, "")).toMatch(/^<main [^>]*style="visibility:hidden"/);
    }
  });

  // axe page-has-heading-one. 비교 화면은 키오스크가 둘이라 키오스크가 아니라 페이지가 h1을 하나 갖는다
  it("h1은 보기마다 하나다", () => {
    const h1s = (el: Parameters<typeof renderToStaticMarkup>[0]) => (renderToStaticMarkup(el).match(/<h1[ >]/g) ?? []).length;
    expect(h1s(createElement(Fast, { variant: "kiosk" }))).toBe(1);
    expect(h1s(createElement(Fast, { variant: "dev" }))).toBe(1);
    expect(h1s(createElement(Fast, { variant: "compare", room: null, title: "Touch" }))).toBe(0);
    expect(h1s(createElement(ComparePage))).toBe(1);
  });

  it("기본 보기의 개발 콘솔 입력칸에는 이름이 있다(axe label)", () => {
    expect(renderToStaticMarkup(createElement(Fast, { variant: "dev" }))).toMatch(/<textarea [^>]*aria-label="[^"]+"/);
  });
});
