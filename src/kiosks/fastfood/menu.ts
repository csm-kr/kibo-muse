// Bridge Burger 가상 메뉴. 구조와 가격대는 한국 패스트푸드 키오스크를 참고했고, 이름·상품은 가상이다.

export type Lang = "en" | "ko";
export type L10n = Record<Lang, string>;
export type CategoryId = "recommended" | "burgers" | "sides" | "drinks" | "desserts";
export type Size = "M" | "L";

export interface Category {
  id: CategoryId;
  name: L10n;
}

export interface Burger {
  id: string;
  category: "burgers";
  name: L10n;
  price: number;
  setPrice: Record<Size, number>;
  kcal: number;
  ingredients: string[];
  isNew?: boolean;
}

export interface SimpleItem {
  id: string;
  category: "sides" | "drinks" | "desserts";
  name: L10n;
  price: number;
  kcal: number;
  // 세트 구성으로 고를 때의 추가금. null이면 세트 구성으로 고를 수 없다.
  setUpcharge: number | null;
  isNew?: boolean;
}

export type MenuItem = Burger | SimpleItem;

export const categories: Category[] = [
  { id: "recommended", name: { en: "Recommended", ko: "추천 메뉴" } },
  { id: "burgers", name: { en: "Burgers", ko: "버거" } },
  { id: "sides", name: { en: "Sides", ko: "사이드" } },
  { id: "drinks", name: { en: "Drinks", ko: "음료" } },
  { id: "desserts", name: { en: "Desserts", ko: "디저트" } },
];

const burgerIngredients = ["bun", "patty", "cheese", "pickle", "onion", "lettuce", "tomato", "sauce"];

export const burgers: Burger[] = [
  { id: "classic", category: "burgers", name: { en: "Bridge Classic", ko: "브리지 클래식" }, price: 5200, setPrice: { M: 6400, L: 7100 }, kcal: 540, ingredients: burgerIngredients },
  { id: "double_cheese", category: "burgers", name: { en: "Double Cheeseburger", ko: "더블 치즈버거" }, price: 6600, setPrice: { M: 7600, L: 8300 }, kcal: 674, ingredients: burgerIngredients },
  { id: "spicy_chicken", category: "burgers", name: { en: "Spicy Chicken Burger", ko: "스파이시 치킨버거" }, price: 5900, setPrice: { M: 7000, L: 7700 }, kcal: 590, ingredients: ["bun", "chicken", "lettuce", "mayo"], isNew: true },
  { id: "bulgogi", category: "burgers", name: { en: "Bulgogi Burger", ko: "불고기버거" }, price: 4800, setPrice: { M: 6000, L: 6700 }, kcal: 470, ingredients: ["bun", "patty", "lettuce", "onion", "bulgogi_sauce"] },
  { id: "shrimp", category: "burgers", name: { en: "Shrimp Burger", ko: "새우버거" }, price: 5500, setPrice: { M: 6700, L: 7400 }, kcal: 510, ingredients: ["bun", "shrimp_patty", "lettuce", "tartar"] },
  { id: "veggie", category: "burgers", name: { en: "Veggie Burger", ko: "베지 버거" }, price: 5600, setPrice: { M: 6800, L: 7500 }, kcal: 430, ingredients: ["bun", "veggie_patty", "lettuce", "tomato", "onion", "sauce"], isNew: true },
];

export const simpleItems: SimpleItem[] = [
  { id: "fries", category: "sides", name: { en: "French Fries", ko: "감자튀김" }, price: 2300, kcal: 330, setUpcharge: 0 },
  { id: "cheese_sticks", category: "sides", name: { en: "Cheese Sticks", ko: "치즈스틱" }, price: 2800, kcal: 300, setUpcharge: 1500 },
  { id: "coleslaw", category: "sides", name: { en: "Coleslaw", ko: "코울슬로" }, price: 2000, kcal: 180, setUpcharge: 0 },
  { id: "corn_salad", category: "sides", name: { en: "Corn Salad", ko: "콘샐러드" }, price: 2000, kcal: 160, setUpcharge: 0, isNew: true },
  { id: "nuggets4", category: "sides", name: { en: "Nuggets (4 pc)", ko: "너겟 4조각" }, price: 2700, kcal: 190, setUpcharge: 1000 },
  { id: "cola", category: "drinks", name: { en: "Cola", ko: "콜라" }, price: 1900, kcal: 198, setUpcharge: 0 },
  { id: "zero_cola", category: "drinks", name: { en: "Zero Cola", ko: "제로 콜라" }, price: 1900, kcal: 0, setUpcharge: 0 },
  { id: "lemon_soda", category: "drinks", name: { en: "Lemon Soda", ko: "레몬 소다" }, price: 1900, kcal: 206, setUpcharge: 0 },
  { id: "orange_soda", category: "drinks", name: { en: "Orange Soda", ko: "오렌지 소다" }, price: 1900, kcal: 86, setUpcharge: 0 },
  { id: "iced_tea", category: "drinks", name: { en: "Iced Tea", ko: "아이스티" }, price: 1900, kcal: 120, setUpcharge: 0 },
  { id: "americano", category: "drinks", name: { en: "Americano", ko: "아메리카노" }, price: 2400, kcal: 10, setUpcharge: 500 },
  { id: "iced_latte", category: "drinks", name: { en: "Iced Latte", ko: "아이스 라테" }, price: 3200, kcal: 180, setUpcharge: 1500, isNew: true },
  { id: "milkshake", category: "drinks", name: { en: "Vanilla Shake", ko: "바닐라 셰이크" }, price: 3500, kcal: 340, setUpcharge: 2100 },
  { id: "sundae", category: "desserts", name: { en: "Ice Cream Sundae", ko: "아이스크림 선데" }, price: 2500, kcal: 280, setUpcharge: null },
  { id: "apple_pie", category: "desserts", name: { en: "Apple Pie", ko: "애플파이" }, price: 1800, kcal: 250, setUpcharge: null },
];

export const addOns: { id: string; name: L10n; price: number }[] = [
  { id: "extra_cheese", name: { en: "Extra cheese", ko: "치즈 추가" }, price: 500 },
  { id: "bacon", name: { en: "Bacon", ko: "베이컨 추가" }, price: 900 },
  { id: "extra_patty", name: { en: "Extra patty", ko: "패티 추가" }, price: 1500 },
];

// 세트의 기본 사이드. 사이드를 말하지 않으면 이것으로 채우고 확인 문장에서 밝힌다
export const DEFAULT_SET_SIDE = "fries";
// 빼면 그 버거가 아니게 되는 주재료. 사람도 KIBO도 뺄 수 없다
export const REQUIRED_INGREDIENTS = ["bun", "patty", "chicken", "shrimp_patty", "veggie_patty"];

// 추천 카테고리에 보이는 상품 (실제 키오스크의 "추천 메뉴" 화면)
export const recommendedIds = ["double_cheese", "spicy_chicken", "bulgogi", "iced_latte", "sundae"];

export const allItems: MenuItem[] = [...burgers, ...simpleItems];

export function findItem(id: string): MenuItem | undefined {
  return allItems.find((i) => i.id === id);
}

export function isBurger(item: MenuItem): item is Burger {
  return item.category === "burgers";
}

export function itemsIn(category: CategoryId): MenuItem[] {
  if (category === "recommended") return recommendedIds.map((id) => findItem(id)!);
  return allItems.filter((i) => i.category === category);
}
