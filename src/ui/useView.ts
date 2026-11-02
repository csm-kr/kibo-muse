"use client";

// 주소의 ?view= 값. 서버 렌더와 첫 하이드레이션에서는 null(개발 화면), 그 뒤 브라우저 값으로 바뀐다
import { useSyncExternalStore } from "react";

const noop = () => () => {};
export const useView = () =>
  useSyncExternalStore(
    noop,
    () => new URLSearchParams(location.search).get("view"),
    () => null,
  );
