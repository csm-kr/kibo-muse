import { useSyncExternalStore } from "react";

// 개발 콘솔 예시 문장의 순서. 각 키오스크 목록은 한국어 문장을 먼저 쓴다.
// 브라우저 언어가 한국어가 아니면 영어 문장(ASCII만으로 된 첫 문장)을 맨 앞(입력란 기본값)에 둔다
export function samplesFor(list: readonly string[], browserLang: string): string[] {
  if (browserLang.toLowerCase().startsWith("ko")) return [...list];
  const en = list.find((s) => /^[\x20-\x7E]+$/.test(s));
  return en ? [en, ...list.filter((s) => s !== en)] : [...list];
}

// 브라우저 언어는 렌더 중에 바로 읽지 않는다(서버 렌더와 어긋나지 않게). 서버 렌더와 첫 그리기는 영어 먼저
const noop = () => () => {};
export const useSamples = (list: readonly string[]) => samplesFor(list, useSyncExternalStore(noop, () => navigator.language, () => ""));
