// 메뉴 id → 생성 사진(public/menu/*.webp, Muse Image) 경로와 미리 불러오기.
// 사진 고른 이유와 프롬프트: critic-demo menu-images.md. 글자·로고가 없는 것만 골랐다.
import { addOns, allItems, burgers } from "../menu";

export const photo = (id: string) => `/menu/${id}.webp`;
// 세트 구성 사진(버거·감자튀김·음료)
export const mealPhoto = (burgerId: string) => photo(`meal_${burgerId}`);

export const PHOTOS: string[] = [
  ...allItems.map((i) => photo(i.id)),
  ...addOns.map((a) => photo(a.id)),
  ...burgers.map((b) => mealPhoto(b.id)),
  photo("meal_sides"),
  photo("promo_spicy"),
  photo("promo_meal"),
];

// KIBO는 한 단계 480ms라, 화면이 바뀔 때 사진이 아직 없으면 빈 칸이 영상에 찍힌다. 33장(약 1.2MB)을 한 번 불러 둔다.
// 첫 화면(창에 맞춰 보이기 전까지 숨김)이 그려진 뒤에 시작한다. load 직후에 시작하면 첫 그림(LCP, 관측 153ms)보다 앞서
// Lighthouse 모바일 모의 측정이 33장을 LCP 경로에 넣어 LCP 3.8초가 된다. 사람이 첫 화면을 보고 말하기까지 2초는 넘게 걸린다
let started = false;
export function preloadPhotos() {
  if (started || typeof Image === "undefined") return;
  started = true;
  const later = () => setTimeout(() => {
    for (const src of PHOTOS) new Image().src = src;
  }, 2000);
  if (document.readyState === "complete") later();
  else window.addEventListener("load", later, { once: true });
}
