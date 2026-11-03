import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));

describe("effect 반환값", () => {
  // Chrome 153부터 scrollIntoView가 Promise를 돌려준다. 식 본문 effect가 그것을 돌려주면 React가 정리 함수로 부르다 'destroy is not a function'으로 화면이 죽는다
  it("useEffect·useLayoutEffect를 식 본문으로 쓰지 않는다(정리 함수를 돌려주는 () => () => 꼴만 허용)", () => {
    const bad = files("src").flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .flatMap((line, i) => (/use(Layout)?Effect\(\s*\(\)\s*=>\s*(?![{\s]|\(\)\s*=>)/.test(line) ? [`${f}:${i + 1}`] : [])),
    );
    expect(bad).toEqual([]);
  });
});
