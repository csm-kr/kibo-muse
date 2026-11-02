// 카드 글의 ⟦자리⟧를 numbers.ts 값으로 채운다. 값이 없으면(null·없는 이름) TBD 조각으로 남겨 빨갛게 그린다.

export type Value = string | number | null;
export interface Part {
  text: string;
  tbd: boolean;
}

export function fill(template: string, values: Record<string, Value>): Part[] {
  return template
    .split(/(⟦[A-Z0-9_]+⟧)/)
    .filter((s) => s !== "")
    .map((s) => {
      const key = /^⟦([A-Z0-9_]+)⟧$/.exec(s)?.[1];
      if (key === undefined) return { text: s, tbd: false };
      const v = values[key];
      return v === null || v === undefined ? { text: "TBD", tbd: true } : { text: String(v), tbd: false };
    });
}
