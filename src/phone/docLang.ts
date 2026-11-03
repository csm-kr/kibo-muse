// html lang을 화면 언어로 맞춘다(WCAG 3.1.1). layout.tsx는 모든 화면에 lang="en"을 고정으로 낸다
import { useEffect } from "react";

// 바꾸고, 원래 값으로 되돌리는 함수를 돌려준다
export function applyDocLang(root: { lang: string }, code: string) {
  const before = root.lang;
  root.lang = code;
  return () => {
    root.lang = before;
  };
}

// on=false면 건드리지 않는다(다른 화면 안에 넣은 휴대폰)
export function useDocLang(code: string, on = true) {
  useEffect(() => {
    if (on) return applyDocLang(document.documentElement, code);
  }, [code, on]);
}
