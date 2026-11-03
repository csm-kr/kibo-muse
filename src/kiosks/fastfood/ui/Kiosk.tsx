"use client";

// Bridge Burger 키오스크 화면. 화면 순서와 배치는 실물 한국 패스트푸드 키오스크 영상 측정(critic-demo kiosk-spec.md)을 따르고,
// 로고·이름·색·상품은 가상이다(사진은 Muse Image 생성, 글자·로고 없음). 사람의 터치와 KIBO의 조작은 모두 같은 step()을 거친다.
// data-target·data-value는 KIBO가 누르는 대상이라 바꾸지 않는다(Kiosk.test.ts가 지킨다).

import { useEffect, useState, type ReactNode } from "react";
import type { KioskState, Target } from "../machine";
import { unitPrice } from "../machine";
import { addOns, burgers, categories, findItem, isBurger, itemsIn, simpleItems, type Burger } from "../menu";
import { AddedArt, CardArt, CardSlotArt, EatInArt, GlobeIcon, Logo, MobileArt, PointScanArt, StarIcon, TakeOutArt, TapIcon } from "./art";
import { Btn, BottomBar, CancelRow, cartTotal, Ctx, DraftHeader, HelpBtn, HumanBtn, Photo, ProductCard, StartOverBtn, Stepper, tr, useK, type DemoPay, type KioskCtx } from "./kit";
import { mealPhoto, photo, preloadPhotos } from "./photos";
import { ingredientName, won } from "./strings";
import { bbVars, krFont } from "./tokens";

export type { DemoPay };
export type Highlight = { target: Target; value?: string } | null;

const PRIMARY = "bg-(--bb-cobalt) text-white active:bg-(--bb-cobalt-press)";
const OUTLINE = "border border-(--bb-ink) bg-white text-(--bb-ink)";

function Idle() {
  const { s } = useK();
  return (
    <div className="flex h-full flex-col">
      {/* 위 62%: 홍보 사진. 사진 위 40%는 비어 있어 글자를 얹는다. 오른쪽 위 150×90은 녹화 때 KIBO QR 자리라 비운다 */}
      <div className="relative h-[592px] shrink-0 overflow-hidden bg-(--bb-navy)">
        <Photo src={photo("promo_spicy")} srcSet={`/menu/small/promo_spicy.webp 828w, ${photo("promo_spicy")} 1080w`} sizes="(max-width: 560px) 100vw, 540px" size={[1080, 1215]} priority className="absolute inset-0 bg-(--bb-navy)" imgClass="object-[center_70%]" />
        <div className="absolute top-6 left-6">
          <Logo tone="white" size={30} />
        </div>
        <div className="absolute top-[68px] left-6 flex max-w-[320px] flex-col items-start gap-2 text-white">
          <span className="rounded-full bg-(--bb-berry) px-2.5 text-[11px] leading-5 font-extrabold">NEW</span>
          <span className="text-[34px] leading-[40px] font-black">{tr("adTitle", s.lang)}</span>
          <span className="text-[15px] font-medium">{tr("adSub", s.lang)}</span>
        </div>
      </div>
      <div className="flex h-9 shrink-0 items-center bg-(--bb-navy) px-6 text-[12px] font-medium text-white">{tr("cashNotice", s.lang)}</div>
      <div className="flex min-h-0 flex-1 gap-4 bg-(--bb-cream) p-6">
        <div className="flex w-[292px] shrink-0 flex-col gap-3">
          <Btn target="start" className={`flex min-h-0 flex-1 flex-col items-start justify-between rounded-2xl p-5 text-left ${PRIMARY}`}>
            <span>
              <span className="block text-[34px] leading-10 font-black">{tr("orderHere", s.lang)}</span>
              <span className="mt-1 block text-[13px] font-medium">{tr("touchToOrder", s.lang)}</span>
            </span>
            <span className="self-end">
              <TapIcon size={52} />
            </span>
          </Btn>
          <div className="flex gap-3">
            <Btn target="language" value={s.lang === "en" ? "ko" : "en"} className="flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-(--bb-muted) bg-white text-[14px] font-semibold text-(--bb-ink)">
              <GlobeIcon />
              {s.lang === "en" ? "한국어" : "English"}
            </Btn>
            <HelpBtn className="h-[52px] flex-1 rounded-xl" />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-(--bb-tint) p-4 text-center text-(--bb-navy)">
          <div className="text-[16px] leading-5 font-extrabold">{tr("rewardsTitle", s.lang)}</div>
          <div className="text-[12px]">{tr("rewardsSub", s.lang)}</div>
          <PointScanArt size={96} />
        </div>
      </div>
    </div>
  );
}

function OrderType() {
  const { s } = useK();
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center">
        <div className="mt-10">
          <Logo />
        </div>
        <div className="mt-12 text-center text-[26px] leading-[34px] font-extrabold whitespace-pre-line">{tr("whereEat", s.lang)}</div>
        <div className="mt-12 flex gap-5">
          {(["eat_in", "take_out"] as const).map((v) => (
            <Btn key={v} target="order_type" value={v} className="flex h-[240px] w-[200px] flex-col items-center justify-between rounded-2xl border border-(--bb-line) bg-white px-4 pt-6 pb-4 shadow-sm">
              <span className="text-[18px] font-bold">{tr(v === "eat_in" ? "eatIn" : "takeOut", s.lang)}</span>
              {v === "eat_in" ? <EatInArt /> : <TakeOutArt />}
            </Btn>
          ))}
        </div>
        <div className="mt-auto mb-7 flex flex-col items-center gap-3">
          <div className="flex items-center gap-1 text-[13px] text-(--bb-muted)">
            <GlobeIcon size={14} />
            언어 · Language
          </div>
          <div className="flex gap-3">
            {(["en", "ko"] as const).map((l) => (
              <Btn key={l} target="language" value={l} className={`h-[52px] w-[170px] rounded-xl border-2 bg-white text-[15px] ${s.lang === l ? "border-(--bb-cobalt) font-bold text-(--bb-cobalt)" : "border-(--bb-line) font-medium text-(--bb-ink)"}`}>
                {l === "en" ? "English" : "한국어"}
              </Btn>
            ))}
          </div>
        </div>
      </div>
      <BottomBar />
    </div>
  );
}

// 레일 아이콘: 추천은 별, 나머지는 그 분류의 대표 사진
const railPhoto: Record<string, string> = { burgers: "classic", sides: "fries", drinks: "cola", desserts: "sundae" };

function Menu() {
  const { s } = useK();
  const cat = categories.find((c) => c.id === s.category)!;
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[112px] shrink-0 flex-col border-r border-(--bb-line) bg-(--bb-cream)">
          <div className="flex h-[96px] shrink-0 items-center justify-center">
            <Logo stacked size={30} />
          </div>
          {categories.map((c) => (
            <Btn key={c.id} target="category" value={c.id} className={`flex h-[60px] flex-col items-center justify-center gap-0.5 border-l-4 pr-1 text-[12px] ${s.category === c.id ? "border-(--bb-cobalt) bg-white font-extrabold text-(--bb-navy)" : "border-transparent font-bold text-(--bb-ink)"}`}>
              {c.id === "recommended" ? <StarIcon size={30} /> : <Photo src={photo(railPhoto[c.id])} className="h-[30px] w-[30px] rounded-full" />}
              {c.name[s.lang]}
            </Btn>
          ))}
        </nav>
        <div className="min-w-0 flex-1 px-[14px] pt-5">
          <div className="text-[24px] leading-8 font-extrabold">{cat.name[s.lang]}</div>
          <div className="mt-0.5 text-[12px] text-(--bb-muted)">{tr("menuHint", s.lang)}</div>
          {s.category === "recommended" && (
            // 실물 메뉴 첫 화면의 광고 배너 자리. 누르는 버튼이 아니다
            <div className="relative mt-3 h-[110px] overflow-hidden rounded-xl bg-(--bb-navy)">
              <Photo src={photo("promo_meal")} size={[1080, 1215]} className="absolute inset-y-0 right-0 w-[62%] bg-(--bb-navy)" imgClass="object-[center_68%]" />
              <div className="absolute inset-y-0 left-0 w-[60%]" style={{ background: "linear-gradient(90deg, #16264A 55%, rgba(22,38,74,0))" }} />
              <div className="absolute top-1/2 left-4 max-w-[150px] -translate-y-1/2 text-[18px] leading-6 font-black text-white">{tr("bannerTitle", s.lang)}</div>
            </div>
          )}
          {/* 분류가 바뀌면 격자를 새로 그린다. 두 분류에 함께 있는 카드가 자리를 옮기며 이동(CLS)으로 잡히지 않게 */}
          <div key={s.category} className="mt-3 grid grid-cols-[repeat(3,124px)] gap-2">
            {itemsIn(s.category).map((i) => (
              <ProductCard key={i.id} target="item" value={i.id} img={photo(i.id)} name={i.name[s.lang]} price={won(i.price)} kcal={i.kcal} isNew={i.isNew} />
            ))}
          </div>
        </div>
      </div>
      <BottomBar withCart />
    </div>
  );
}

// 담김 알림 뒤에 어두운 막과 함께 까는 흐린 메뉴(누를 수 없음, 버튼·대상 없음)
function FaintMenu() {
  return (
    <div className="pointer-events-none grid min-h-0 flex-1 grid-cols-3 content-start gap-2 overflow-hidden px-[60px] pt-6 opacity-50" aria-hidden>
      {burgers.map((b) => (
        <Photo key={b.id} src={photo(b.id)} className="aspect-square rounded-xl" />
      ))}
    </div>
  );
}

function BottomRow() {
  return (
    <div className="flex shrink-0 gap-2 px-4 pb-3">
      <StartOverBtn />
      <HelpBtn />
    </div>
  );
}

function SetChoice() {
  const { s } = useK();
  const item = findItem(s.draft!.menuId) as Burger;
  return (
    <div className="flex h-full flex-col">
      <DraftHeader />
      <div className="min-h-0 flex-1 px-[50px]">
        <div className="mt-[72px] text-[26px] leading-[34px] font-extrabold">{tr("makeMeal", s.lang)}</div>
        <div className="mt-6 flex gap-4">
          <Btn target="set_choice" value="set" className="flex h-[270px] w-[206px] flex-col overflow-hidden rounded-2xl border border-(--bb-line) bg-white text-left">
            <Photo src={mealPhoto(item.id)} className="h-[170px] w-full shrink-0" />
            <span className="px-3 pt-2.5 text-[18px] font-extrabold">{tr("meal", s.lang)}</span>
            <span className="px-3 text-[15px] font-bold text-(--bb-navy)">{won(item.setPrice.M)}~</span>
          </Btn>
          <Btn target="set_choice" value="single" className="flex h-[270px] w-[206px] flex-col overflow-hidden rounded-2xl border border-(--bb-line) bg-white text-left">
            <Photo src={photo(item.id)} className="h-[170px] w-full shrink-0" />
            <span className="px-3 pt-2.5 text-[18px] font-extrabold">{tr("burgerOnly", s.lang)}</span>
            <span className="px-3 text-[15px] font-bold text-(--bb-navy)">
              {won(item.price)} · {item.kcal} kcal
            </span>
          </Btn>
        </div>
        <Btn target="cancel" className={`mt-8 h-[52px] w-full rounded-xl text-[15px] font-bold ${OUTLINE}`}>
          {tr("cancel", s.lang)}
        </Btn>
      </div>
      <BottomRow />
    </div>
  );
}

// 세트 단계(사이즈·사이드·음료) 공통 틀: 머리, 왼쪽 단계 표시, 3열 격자, 맨 아래 취소·처음으로
function SetStep({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <DraftHeader />
      <div className="flex min-h-0 flex-1 gap-3 pt-5 pr-3">
        <Stepper />
        <div className="min-w-0 flex-1">
          <div className="text-[20px] leading-7 font-extrabold">{title}</div>
          <div className="mt-3 grid grid-cols-[repeat(3,124px)] gap-2">{children}</div>
        </div>
      </div>
      <CancelRow indent />
    </div>
  );
}

function SetSize() {
  const { s } = useK();
  const item = findItem(s.draft!.menuId) as Burger;
  return (
    <SetStep title={tr("chooseSize", s.lang)}>
      {(["M", "L"] as const).map((z) => (
        <ProductCard key={z} target="size" value={z} img={photo("meal_sides")} imgStyle={z === "L" ? { transform: "scale(1.15)" } : undefined} name={`${tr(z === "M" ? "medium" : "large", s.lang)} ${tr("set", s.lang)}`} price={won(item.setPrice[z])} />
      ))}
    </SetStep>
  );
}

function SetChoiceGrid({ kind }: { kind: "sides" | "drinks" }) {
  const { s } = useK();
  const target = kind === "sides" ? "side" : "drink";
  const options = simpleItems.filter((i) => i.category === kind && i.setUpcharge !== null);
  return (
    <SetStep title={kind === "sides" ? tr("chooseSide", s.lang) : tr("chooseDrink", s.lang)}>
      {options.map((o) => (
        <ProductCard key={o.id} target={target} value={o.id} img={photo(o.id)} name={`${o.name[s.lang]}${s.draft?.size === "L" ? " L" : ""}`} price={o.setUpcharge ? `+${won(o.setUpcharge)}` : null} kcal={o.kcal} isNew={o.isNew} />
      ))}
    </SetStep>
  );
}

const removedText = (remove: string[], lang: KioskState["lang"]) => remove.map((r) => ingredientName[r]?.[lang] ?? r).join(", ");
const addedText = (add: string[], lang: KioskState["lang"]) => add.map((a) => addOns.find((x) => x.id === a)!.name[lang]).join(", ");

function Confirm() {
  const { s } = useK();
  const d = s.draft!;
  const item = findItem(d.menuId)!;
  const parts = [item, ...(d.mode === "set" ? [findItem(d.side!)!, findItem(d.drink!)!] : [])];
  return (
    <div className="flex h-full flex-col px-5 pt-4">
      <Logo size={26} />
      <div className="mt-3 text-[24px] leading-8 font-extrabold">
        {item.name[s.lang]}
        {d.mode === "set" ? ` - ${d.size === "L" ? tr("large", s.lang) : tr("medium", s.lang)} ${tr("set", s.lang)}` : ""}
      </div>
      <div className="text-[20px] font-extrabold text-(--bb-navy)">{won(unitPrice(d) * d.qty)}</div>
      <Photo src={d.mode === "set" ? mealPhoto(item.id) : photo(item.id)} className="mx-auto mt-3 h-[270px] w-[270px] shrink-0 rounded-[20px]" />
      <div className="mt-4 grid shrink-0 grid-cols-3 gap-2">
        {parts.map((p, i) => (
          <div key={p.id} className="flex flex-col gap-1.5 rounded-xl border border-(--bb-line) p-2">
            <div className="flex items-center gap-2">
              <Photo src={photo(p.id)} className="h-11 w-11 shrink-0 rounded-lg" />
              <span className="line-clamp-2 text-[12px] leading-4 font-semibold">{p.name[s.lang]}</span>
            </div>
            {i === 0 && d.remove.length > 0 && <div className="text-[11px] font-semibold text-(--bb-berry)">− {removedText(d.remove, s.lang)}</div>}
            {i === 0 && d.add.length > 0 && <div className="text-[11px] font-semibold text-(--bb-cobalt)">+ {addedText(d.add, s.lang)}</div>}
            {i === 0 && isBurger(item) ? (
              <Btn target="customize" className="mt-auto h-11 rounded-lg border border-(--bb-muted) bg-white text-[12px] font-semibold">
                {tr("customize", s.lang)}
              </Btn>
            ) : (
              <HumanBtn className="mt-auto h-11 rounded-lg border border-(--bb-line) bg-white text-[12px] font-semibold">{tr("change", s.lang)}</HumanBtn>
            )}
          </div>
        ))}
      </div>
      <div className="mt-auto flex shrink-0 flex-col gap-3 pb-3">
        <div className="mx-auto flex h-[52px] overflow-hidden rounded-xl border border-(--bb-muted)">
          <Btn target="qty_minus" className="w-[52px] text-[24px] font-bold">
            −
          </Btn>
          <div className="flex w-24 items-center justify-center border-x border-(--bb-muted) text-[18px] font-extrabold">{d.qty}</div>
          <Btn target="qty_plus" className="w-[52px] text-[24px] font-bold">
            +
          </Btn>
        </div>
        <div className="flex gap-3">
          <Btn target="cancel" className={`h-16 w-[150px] shrink-0 rounded-xl text-[16px] font-bold ${OUTLINE}`}>
            {tr("cancel", s.lang)}
          </Btn>
          <Btn target="add_to_cart" className={`h-16 flex-1 rounded-xl text-[17px] font-extrabold ${PRIMARY}`}>
            {tr("addToOrder", s.lang)} {won(unitPrice(d) * d.qty)}
          </Btn>
        </div>
        <div className="flex gap-2">
          <StartOverBtn />
          <HelpBtn />
        </div>
      </div>
    </div>
  );
}

function Customize() {
  const { s } = useK();
  const d = s.draft!;
  const item = findItem(d.menuId) as Burger;
  return (
    <div className="flex h-full flex-col p-6">
      <div className="text-[22px] leading-8 font-extrabold">
        {tr("customize", s.lang)} — {item.name[s.lang]}
      </div>
      <div className="mt-5 mb-2 text-[13px] font-extrabold">{tr("ingredients", s.lang)}</div>
      <div className="grid grid-cols-2 gap-2">
        {item.ingredients
          .filter((g) => g !== "bun" && g !== "patty")
          .map((g) => {
            const off = d.remove.includes(g);
            return (
              <Btn key={g} target="toggle_ingredient" value={g} className={`flex h-[52px] items-center gap-2.5 rounded-xl border-2 px-3 text-left text-[14px] font-semibold ${off ? "border-(--bb-berry) bg-[#FBE7F0]" : "border-(--bb-line) bg-white"}`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border-2 ${off ? "border-(--bb-berry) bg-(--bb-berry) text-white" : "border-(--bb-muted)"}`} aria-hidden>
                  {off && (
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <path d="M2.5 6.2l2.3 2.3L9.6 3.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={`flex-1 ${off ? "line-through" : ""}`}>{ingredientName[g]?.[s.lang] ?? g}</span>
                <span className={`text-[12px] ${off ? "font-extrabold text-(--bb-berry)" : "text-(--bb-muted)"}`}>{off ? tr("removed", s.lang) : tr("remove", s.lang)}</span>
              </Btn>
            );
          })}
      </div>
      <div className="mt-5 mb-2 text-[13px] font-extrabold">{tr("extras", s.lang)}</div>
      <div className="flex flex-col gap-2">
        {addOns.map((a) => {
          const on = d.add.includes(a.id);
          return (
            <Btn key={a.id} target="toggle_addon" value={a.id} className={`flex h-14 items-center gap-3 rounded-xl border-2 px-2 text-left text-[14px] font-semibold ${on ? "border-(--bb-cobalt) bg-(--bb-tint)" : "border-(--bb-line) bg-white"}`}>
              <Photo src={photo(a.id)} className="h-10 w-10 shrink-0 rounded-lg" />
              <span className="flex-1">{a.name[s.lang]}</span>
              <span className="pr-2 text-[13px] font-extrabold text-(--bb-navy)">+{won(a.price)}</span>
            </Btn>
          );
        })}
      </div>
      <Btn target="customize_done" className={`mt-auto h-14 rounded-xl text-[17px] font-extrabold ${PRIMARY}`}>
        {tr("done", s.lang)}
      </Btn>
    </div>
  );
}

function Added() {
  const { s } = useK();
  const last = s.cart[s.cart.length - 1];
  return (
    <div className="relative flex h-full flex-col bg-(--bb-cream)">
      <FaintMenu />
      <div className="absolute inset-0 bg-[#141B2B]/50" />
      <div className="absolute top-[330px] left-1/2 flex w-[380px] -translate-x-1/2 flex-col items-center gap-3 rounded-[20px] bg-white px-6 py-7 text-center">
        <AddedArt />
        <div className="text-[18px] leading-6 font-bold">{tr("added", s.lang)}</div>
        {last && <div className="text-[16px] font-extrabold text-(--bb-navy)">{won(last.unitPrice * last.qty)}</div>}
        <Btn target="added_ok" className={`mt-1 h-[52px] w-[200px] rounded-xl text-[17px] font-extrabold ${PRIMARY}`}>
          OK
        </Btn>
      </div>
    </div>
  );
}

// 추천: 실물처럼 전체 화면. 카드 전체가 누르는 버튼이다
function Upsell() {
  const { s } = useK();
  const offers = simpleItems.filter((i) => i.category === "desserts");
  return (
    <div className="flex h-full flex-col items-center px-6">
      <div className="mt-10">
        <Logo />
      </div>
      <div className="mt-[100px] text-center text-[22px] leading-8 font-extrabold">{tr("upsellTitle", s.lang)}</div>
      <div className="mt-8 flex gap-4">
        {offers.map((o) => (
          <Btn key={o.id} target="upsell_add" value={o.id} className="flex h-[230px] w-[160px] flex-col overflow-hidden rounded-2xl border border-(--bb-line) bg-white text-left">
            <Photo src={photo(o.id)} className="h-[140px] w-full shrink-0" />
            <span className="px-3 pt-2 text-[14px] leading-5 font-semibold">{o.name[s.lang]}</span>
            <span className="px-3 text-[14px] font-extrabold text-(--bb-navy)">{won(o.price)}</span>
            <span className="mt-auto px-3 pb-2.5 text-[13px] font-extrabold text-(--bb-cobalt)">+ {tr("add", s.lang)}</span>
          </Btn>
        ))}
      </div>
      <Btn target="upsell_no_thanks" className={`mt-auto mb-[136px] h-[52px] w-[334px] rounded-xl text-[15px] font-bold ${OUTLINE}`}>
        {tr("noThanks", s.lang)}
      </Btn>
    </div>
  );
}

function Review() {
  const { s } = useK();
  const total = cartTotal(s);
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-6 pt-6">
        <div className="text-[24px] leading-8 font-extrabold">{tr("reviewTitle", s.lang)}</div>
        <span className="shrink-0 rounded-full bg-(--bb-tint) px-3 py-1 text-[12px] font-bold text-(--bb-navy)">{s.orderType === "eat_in" ? tr("eatIn", s.lang) : tr("takeOut", s.lang)}</span>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-auto px-6">
        {s.cart.map((l, i) => {
          const item = findItem(l.menuId)!;
          return (
            <div key={i} className="flex min-h-[76px] items-center gap-3 border-b border-(--bb-line) py-2">
              <Btn target="remove_line" value={String(i)} className="h-11 w-14 shrink-0 rounded-lg border border-(--bb-muted) bg-white text-[12px] font-semibold">
                {tr("deleteLine", s.lang)}
              </Btn>
              <Photo src={l.mode === "set" ? mealPhoto(l.menuId) : photo(l.menuId)} className="h-14 w-14 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] leading-5 font-bold">
                  {item.name[s.lang]} {l.mode === "set" ? `${l.size} ${tr("set", s.lang)}` : ""}
                </div>
                {l.mode === "set" && (
                  <div className="text-[11px] text-(--bb-muted)">
                    {findItem(l.side!)!.name[s.lang]} · {findItem(l.drink!)!.name[s.lang]}
                  </div>
                )}
                {l.remove.length > 0 && <div className="text-[11px] font-semibold text-(--bb-berry)">− {removedText(l.remove, s.lang)}</div>}
                {l.add.length > 0 && <div className="text-[11px] font-semibold text-(--bb-cobalt)">+ {addedText(l.add, s.lang)}</div>}
              </div>
              <span className="w-10 shrink-0 text-[13px] font-semibold">{s.lang === "ko" ? `${l.qty}개` : `× ${l.qty}`}</span>
              <span className="w-[72px] shrink-0 text-right text-[14px] font-extrabold">{won(l.unitPrice * l.qty)}</span>
            </div>
          );
        })}
      </div>
      <div className="shrink-0 px-6 pt-3">
        <div className="flex justify-between text-[13px] text-(--bb-muted)">
          <span>{tr("subtotal", s.lang)}</span>
          <span>{won(total)}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-[18px] font-extrabold">{tr("total", s.lang)}</span>
          <span className="text-[24px] font-black text-(--bb-navy)">{won(total)}</span>
        </div>
      </div>
      <div className="flex shrink-0 gap-3 px-6 pt-4 pb-4">
        <Btn target="add_more" className={`h-14 w-[150px] shrink-0 rounded-xl text-[15px] font-bold ${OUTLINE}`}>
          {tr("addMore", s.lang)}
        </Btn>
        <Btn target="pay" className={`h-14 flex-1 rounded-xl text-[18px] font-extrabold ${PRIMARY}`}>
          {tr("pay", s.lang)} {won(total)}
        </Btn>
      </div>
      <BottomBar />
    </div>
  );
}

// 결제: KIBO가 멈추는 화면(사람만 누른다). 결제 수단 → 카드 투입 → 결제 완료·주문번호.
// 결제 수단과 카드 투입은 이 화면 안 상태라 machine은 모른다. 새 KIBO 대상은 없다(결제 수단 카드는 data-target 없는 버튼)
function Payment() {
  const { s, pay } = useK();
  const [stage, setStage] = useState<"method" | "insert">("method");
  const total = cartTotal(s);
  const first = s.cart[0];
  let body: ReactNode;
  if (pay?.no != null)
    body = (
      <>
        <div data-paid={pay.no} className="mt-[88px] flex flex-col items-center">
          <div className="text-[26px] font-extrabold">{tr("paidTitle", s.lang)}</div>
          <div className="mt-8 text-[14px] text-(--bb-muted)">{tr("orderNo", s.lang)}</div>
          <div className="text-[96px] leading-none font-black text-(--bb-navy)">{pay.no}</div>
        </div>
        {first && <Photo src={first.mode === "set" ? mealPhoto(first.menuId) : photo(first.menuId)} className="mt-8 h-[200px] w-[200px] rounded-2xl" />}
        <div className="mt-6 max-w-[400px] text-center text-[13px] leading-5">{tr("receiptNote", s.lang)}</div>
        <div className="mt-2 text-[12px] text-(--bb-muted)">{tr("demoNote", s.lang)}</div>
      </>
    );
  else if (stage === "insert")
    body = (
      <>
        <div className="mt-[90px] text-center text-[24px] font-extrabold">{tr("paymentTitle", s.lang)}</div>
        <div className="mt-[120px] rounded-full bg-(--bb-berry) px-5 py-1.5 text-[14px] font-bold text-white">{tr("icCard", s.lang)}</div>
        {pay ? (
          <button type="button" onClick={pay.onPay} data-demo-pay className="mt-4 flex flex-col items-center gap-1 rounded-2xl px-6 pb-3">
            <CardSlotArt size={200} />
            <span className={`rounded-xl px-6 py-3 text-[17px] font-extrabold ${PRIMARY}`}>{tr("insertCard", s.lang)}</span>
          </button>
        ) : (
          <div className="mt-4">
            <CardSlotArt size={200} />
          </div>
        )}
      </>
    );
  else
    body = (
      <>
        <div className="mt-[90px] text-center text-[24px] font-extrabold">{tr("payMethodTitle", s.lang)}</div>
        <div className="mt-1 text-center text-[13px] text-(--bb-muted)">{tr("paymentSub", s.lang)}</div>
        <div className="mt-10 flex gap-4">
          {/* 사람이 누르기 전에는 두 카드가 같은 테두리다(KIBO는 결제 수단을 고르지 않는다). 누르는 순간에만 코발트 */}
          <HumanBtn onClick={() => setStage("insert")} className="flex h-[160px] w-[206px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-(--bb-line) bg-white active:border-(--bb-cobalt) active:bg-(--bb-tint)">
            <CardArt size={88} />
            <span className="text-[16px] font-extrabold">{tr("cardPay", s.lang)}</span>
          </HumanBtn>
          {/* 시연은 카드 결제만 이어진다 */}
          <HumanBtn disabled className="flex h-[160px] w-[206px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-(--bb-line) bg-white opacity-60">
            <MobileArt size={88} />
            <span className="text-[16px] font-extrabold">{tr("mobileVoucher", s.lang)}</span>
          </HumanBtn>
        </div>
        <div className="mt-10 flex items-baseline gap-3">
          <span className="text-[14px] text-(--bb-muted)">{tr("amountDue", s.lang)}</span>
          <span className="text-[20px] font-extrabold text-(--bb-navy)">{won(total)}</span>
        </div>
      </>
    );
  return (
    <div className="flex h-full flex-col items-center px-6">
      {body}
      <StartOverBtn className="mt-auto mb-[120px] h-[52px] w-[200px] rounded-xl text-[15px] font-bold" />
    </div>
  );
}

const screens: Record<KioskState["screen"], () => ReactNode> = {
  idle: Idle,
  order_type: OrderType,
  menu: Menu,
  set_choice: SetChoice,
  set_size: SetSize,
  set_side: () => <SetChoiceGrid kind="sides" />,
  set_drink: () => <SetChoiceGrid kind="drinks" />,
  confirm: Confirm,
  customize: Customize,
  added: Added,
  upsell: Upsell,
  review: Review,
  payment: Payment,
};

// KIBO가 누르는 자리는 banner 층의 KiboPointer가 보인다
export function FastfoodKiosk({ state, press, banner, pay }: { state: KioskState; press: KioskCtx["press"]; banner?: ReactNode; pay?: DemoPay }) {
  const Screen = screens[state.screen];
  // 식 본문으로 쓰면 반환값이 정리 함수가 된다. 블록으로 감싼다
  useEffect(() => {
    preloadPhotos();
  }, []);
  return (
    <Ctx.Provider value={{ s: state, press, pay }}>
      <div lang={state.lang} style={{ ...bbVars, fontFamily: krFont }} className="relative h-[960px] w-[540px] overflow-hidden rounded-[24px] border-[6px] border-neutral-900 bg-white text-(--bb-ink) shadow-2xl" data-screen={state.screen}>
        <Screen />
        {banner}
      </div>
    </Ctx.Provider>
  );
}
