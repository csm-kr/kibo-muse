import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addOns, allItems, burgers } from "../menu";
import { mealPhoto, photo, PHOTOS } from "./photos";

const files = readdirSync(new URL("../../../../public/menu", import.meta.url)).filter((f) => f.endsWith(".webp"));

describe("메뉴 사진 대응표", () => {
  it("모든 상품·추가 재료·세트에 사진이 있고, 미리 불러오기 목록은 public/menu의 33장과 정확히 같다", () => {
    for (const id of [...allItems.map((i) => i.id), ...addOns.map((a) => a.id)]) expect(files, id).toContain(photo(id).replace("/menu/", ""));
    for (const b of burgers) expect(files, b.id).toContain(mealPhoto(b.id).replace("/menu/", ""));
    expect([...PHOTOS].sort()).toEqual(files.map((f) => `/menu/${f}`).sort());
    expect(PHOTOS).toHaveLength(33);
  });
});
