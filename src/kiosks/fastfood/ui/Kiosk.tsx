"use client";

// Bridge Burger 키오스크 화면. 화면 순서와 배치는 한국 패스트푸드 키오스크(와이어프레임 분석)를 따른다.
// 사람의 터치와 KIBO의 조작은 모두 같은 step()을 거친다.

import { createContext, useContext, type ReactNode } from "react";
import type { KioskState, Target } from "../machine";
import { addOns, categories, findItem, isBurger, itemsIn, simpleItems, type Burger, type Lang } from "../menu";
import { unitPrice } from "../machine";
import { icon, ingredientName, t, won } from "./strings";

export type Highlight = { target: Target; value?: string } | null;

interface KioskCtx {
  s: KioskState;
  press: (target: Target, value?: string) => void;
  hl: Highlight;
}

const Ctx = createContext<KioskCtx | null>(null);
const useK = () => useContext(Ctx)!;
const tr = (key: keyof typeof t, lang: Lang) => t[key][lang];

function Btn({ target, value, className = "", children }: { target: Target; value?: string; className?: string; children: ReactNode }) {
  const { press, hl } = useK();
  const on = !!hl && hl.target === target && (hl.value ?? "") === (value ?? "");
  return (
    <button
      type="button"
      data-target={target}
      data-value={value}
      onClick={() => press(target, value)}
      className={`relative transition-transform ${className} ${on ? "z-20 scale-[0.97] ring-4 ring-orange-500 ring-offset-2" : ""}`}
    >
      {children}
      {on && <span className="pointer-events-none absolute -right-1 -bottom-4 text-4xl drop-shadow">👆</span>}
    </button>
  );
}

function Logo({ size = "text-2xl" }: { size?: string }) {
  return <div className={`font-black tracking-tight text-teal-700 ${size}`}>◗ Bridge</div>;
}

function Rewards({ compact = false }: { compact?: boolean }) {
  const { s } = useK();
  return (
    <div className={`flex flex-col items-center justify-center bg-amber-200 text-center ${compact ? "w-24 gap-1 p-2" : "w-44 gap-2 p-3"}`}>
      <div className={compact ? "text-[10px] font-bold leading-tight" : "text-sm font-bold"}>{tr("rewardsTitle", s.lang)}</div>
      <div className={compact ? "text-[8px]" : "text-[10px]"}>{tr("rewardsSub", s.lang)}</div>
      <div className={`grid grid-cols-3 gap-[2px] ${compact ? "h-7 w-7" : "h-14 w-14"}`}>
        {[1, 0, 1, 0, 1, 1, 1, 0, 1].map((b, i) => (
          <div key={i} className={b ? "bg-neutral-900" : "bg-transparent"} />
        ))}
      </div>
    </div>
  );
}

function BottomBar({ withCart = false }: { withCart?: boolean }) {
  const { s } = useK();
  const count = s.cart.reduce((n, l) => n + l.qty, 0);
  const total = s.cart.reduce((n, l) => n + l.qty * l.unitPrice, 0);
  return (
    <div className="flex h-24 shrink-0 border-t border-neutral-200 bg-white">
      <Rewards compact />
      <div className="flex flex-1 flex-col justify-center gap-2 px-3">
        {withCart && (
          <div className="flex items-center gap-3">
            <div className="relative text-2xl">
              🛍️
              <span className="absolute -top-1 -right-2 rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">{count}</span>
            </div>
            <div className="text-lg font-bold">{won(total)}</div>
            <Btn target="order_details" className="ml-auto rounded-md bg-teal-700 px-3 py-1.5 text-sm font-bold text-white">
              {tr("orderDetails", s.lang)}
            </Btn>
          </div>
        )}
        <div className="flex gap-2">
          <Btn target="start_over" className="flex-1 rounded border border-neutral-400 py-1 text-xs">
            {tr("startOver", s.lang)}
          </Btn>
          <button type="button" className="flex-1 rounded border border-neutral-400 py-1 text-xs">
            ♿ {tr("accessibility", s.lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

function Idle() {
  const { s } = useK();
  return (
    <div className="flex h-full flex-col">
      <div className="relative flex flex-[62] flex-col items-center justify-center gap-3 bg-gradient-to-b from-teal-800 to-teal-950 text-white">
        <div className="rounded-full bg-orange-500 px-3 py-1 text-xs font-bold">NEW</div>
        <div className="text-4xl font-black">{tr("adTitle", s.lang)}</div>
        <div className="text-sm opacity-80">{tr("adSub", s.lang)}</div>
        <div className="text-[120px] leading-none">🍗</div>
      </div>
      <div className="bg-amber-300 px-4 py-2 text-[11px]">{tr("cashNotice", s.lang)}</div>
      <div className="flex flex-[30] gap-3 p-4">
        <Rewards />
        <div className="flex flex-1 flex-col gap-3">
          <Btn target="start" className="flex-1 rounded-lg border-2 border-teal-700 text-2xl font-bold text-teal-800">
            {tr("orderHere", s.lang)}
          </Btn>
          <div className="flex gap-3">
            <Btn target="language" value={s.lang === "en" ? "ko" : "en"} className="flex-1 rounded border border-neutral-400 py-2 text-sm">
              🌐 {s.lang === "en" ? "한국어" : "English"}
            </Btn>
            <button type="button" className="flex-1 rounded border border-neutral-400 py-2 text-sm">
              ♿ {tr("accessibility", s.lang)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderType() {
  const { s } = useK();
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center gap-10 pt-14">
        <Logo />
        <div className="whitespace-pre-line text-center text-3xl font-bold">{tr("whereEat", s.lang)}</div>
        <div className="flex gap-4">
          <Btn target="order_type" value="eat_in" className="flex h-56 w-44 flex-col items-center justify-between rounded-lg border border-neutral-300 p-4 text-lg">
            {tr("eatIn", s.lang)}
            <span className="text-7xl">🍽️</span>
          </Btn>
          <Btn target="order_type" value="take_out" className="flex h-56 w-44 flex-col items-center justify-between rounded-lg border border-neutral-300 p-4 text-lg">
            {tr("takeOut", s.lang)}
            <span className="text-7xl">🛍️</span>
          </Btn>
        </div>
        <div className="mt-auto mb-6 flex flex-col items-center gap-2">
          <div className="text-xs">🌐 {tr("language", s.lang)}</div>
          <div className="flex gap-3">
            <Btn target="language" value="en" className={`w-36 rounded border py-2 text-sm ${s.lang === "en" ? "border-2 border-teal-700" : "border-neutral-400"}`}>
              English
            </Btn>
            <Btn target="language" value="ko" className={`w-36 rounded border py-2 text-sm ${s.lang === "ko" ? "border-2 border-teal-700" : "border-neutral-400"}`}>
              한국어
            </Btn>
          </div>
        </div>
      </div>
      <BottomBar />
    </div>
  );
}

function Menu() {
  const { s } = useK();
  const cat = categories.find((c) => c.id === s.category)!;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-24 shrink-0 flex-col gap-1 border-r border-neutral-200 pt-4">
          <div className="mb-3 flex justify-center">
            <Logo size="text-base" />
          </div>
          {categories.map((c) => (
            <Btn key={c.id} target="category" value={c.id} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${s.category === c.id ? "border-l-4 border-orange-500 bg-teal-50 font-bold" : ""}`}>
              <span className="text-xl">{icon[c.id]}</span>
              {c.name[s.lang]}
            </Btn>
          ))}
        </div>
        <div className="flex-1 overflow-hidden p-4">
          <div className="mb-3 text-xl font-bold">{cat.name[s.lang]}</div>
          <div className="grid grid-cols-3 gap-2">
            {itemsIn(s.category).map((i) => (
              <Btn key={i.id} target="item" value={i.id} className="flex h-36 flex-col items-center rounded border border-neutral-300 p-1.5 text-left">
                {i.isNew && <span className="absolute top-1 left-0 bg-amber-300 px-1 text-[9px] font-bold">NEW</span>}
                <span className="mt-3 text-4xl">{icon[i.id]}</span>
                <span className="mt-1 w-full text-[11px] leading-tight">{i.name[s.lang]}</span>
                <span className="mt-auto w-full text-[11px] font-bold">
                  {won(i.price)} <span className="font-normal text-neutral-500">{i.kcal} kcal</span>
                </span>
              </Btn>
            ))}
          </div>
        </div>
      </div>
      <BottomBar withCart />
    </div>
  );
}

function DraftHeader() {
  const { s } = useK();
  const d = s.draft!;
  const item = findItem(d.menuId)!;
  const suffix = d.mode === "set" ? ` - ${d.size === "L" ? tr("large", s.lang) : d.size === "M" ? tr("medium", s.lang) : ""} ${tr("set", s.lang)}` : "";
  return (
    <div className="flex items-center gap-3 px-5 pt-8">
      <Logo size="text-base" />
      <div>
        <div className="text-sm font-bold">
          {item.name[s.lang]}
          {suffix}
        </div>
        {d.mode && (
          <div className="text-xs">
            {won(unitPrice(d))} · {item.kcal} kcal
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper() {
  const { s } = useK();
  const order = ["set_size", "set_side", "set_drink", "confirm"];
  const idx = order.indexOf(s.screen);
  const labels = [s.draft ? findItem(s.draft.menuId)!.name[s.lang] : "", tr("chooseSide", s.lang), tr("chooseDrink", s.lang), tr("confirmOrder", s.lang)];
  return (
    <div className="flex w-32 shrink-0 flex-col gap-2 pt-6">
      {labels.map((l, i) => (
        <div key={i} className={`flex items-start gap-1.5 bg-neutral-100 p-2 text-[10px] leading-tight ${i === idx ? "border-l-4 border-orange-500" : ""}`}>
          <span>{i < idx ? "✔" : "○"}</span>
          {l}
        </div>
      ))}
    </div>
  );
}

function CancelBar() {
  const { s } = useK();
  return (
    <div className="flex flex-col items-center gap-3 pb-4">
      <Btn target="cancel" className="w-64 rounded border border-neutral-400 py-2.5">
        {tr("cancel", s.lang)}
      </Btn>
    </div>
  );
}

function SetChoice() {
  const { s } = useK();
  const item = findItem(s.draft!.menuId) as Burger;
  return (
    <div className="flex h-full flex-col">
      <DraftHeader />
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="text-2xl font-bold">{tr("makeMeal", s.lang)}</div>
        <div className="flex gap-4">
          <Btn target="set_choice" value="set" className="flex h-52 w-48 flex-col rounded border border-neutral-300 p-3 text-left">
            <span className="text-6xl">🍔🍟🥤</span>
            <span className="mt-auto font-bold">{tr("meal", s.lang)}</span>
            <span className="text-sm">
              {won(item.setPrice.M)}~
            </span>
          </Btn>
          <Btn target="set_choice" value="single" className="flex h-52 w-48 flex-col rounded border border-neutral-300 p-3 text-left">
            <span className="text-6xl">{icon[item.id]}</span>
            <span className="mt-auto font-bold">{tr("burgerOnly", s.lang)}</span>
            <span className="text-sm">
              {won(item.price)} · {item.kcal} kcal
            </span>
          </Btn>
        </div>
      </div>
      <CancelBar />
    </div>
  );
}

function SetSize() {
  const { s } = useK();
  const item = findItem(s.draft!.menuId) as Burger;
  return (
    <div className="flex h-full flex-col">
      <DraftHeader />
      <div className="flex flex-1 gap-4 px-4">
        <Stepper />
        <div className="flex-1 pt-6">
          <div className="mb-4 text-lg font-bold">{tr("chooseSize", s.lang)}</div>
          <div className="grid grid-cols-2 gap-3">
            {(["M", "L"] as const).map((z) => (
              <Btn key={z} target="size" value={z} className="flex h-40 flex-col items-center rounded border border-neutral-300 p-2">
                <span className={z === "L" ? "text-6xl" : "text-5xl"}>🍟🥤</span>
                <span className="mt-auto font-bold">{z === "M" ? tr("medium", s.lang) : tr("large", s.lang)}</span>
                <span className="text-sm">{won(item.setPrice[z])}</span>
              </Btn>
            ))}
          </div>
        </div>
      </div>
      <CancelBar />
    </div>
  );
}

function SetChoiceGrid({ kind }: { kind: "sides" | "drinks" }) {
  const { s } = useK();
  const target = kind === "sides" ? "side" : "drink";
  const options = simpleItems.filter((i) => i.category === kind && i.setUpcharge !== null);
  return (
    <div className="flex h-full flex-col">
      <DraftHeader />
      <div className="flex flex-1 gap-4 px-4">
        <Stepper />
        <div className="flex-1 pt-6">
          <div className="mb-3 text-lg font-bold">{kind === "sides" ? tr("chooseSide", s.lang) : tr("chooseDrink", s.lang)}</div>
          <div className="grid grid-cols-3 gap-2">
            {options.map((o) => (
              <Btn key={o.id} target={target} value={o.id} className="flex h-32 flex-col items-center rounded border border-neutral-300 p-1.5">
                {o.isNew && <span className="absolute top-1 left-0 bg-amber-300 px-1 text-[9px] font-bold">NEW</span>}
                <span className="mt-2 text-4xl">{icon[o.id]}</span>
                <span className="mt-1 text-[11px] leading-tight">
                  {o.name[s.lang]}
                  {s.draft?.size === "L" ? " - L" : ""}
                </span>
                {!!o.setUpcharge && <span className="mt-auto text-[11px] font-bold">+{won(o.setUpcharge)}</span>}
              </Btn>
            ))}
          </div>
        </div>
      </div>
      <CancelBar />
    </div>
  );
}

function Confirm() {
  const { s } = useK();
  const d = s.draft!;
  const item = findItem(d.menuId)!;
  const parts = [item, ...(d.mode === "set" ? [findItem(d.side!)!, findItem(d.drink!)!] : [])];
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-8">
        <Logo size="text-base" />
        <div className="mt-3 text-3xl leading-tight font-bold">
          {item.name[s.lang]}
          {d.mode === "set" ? ` - ${d.size === "L" ? tr("large", s.lang) : tr("medium", s.lang)} ${tr("set", s.lang)}` : ""}
        </div>
        <div className="text-2xl font-bold">{won(unitPrice(d) * d.qty)}</div>
      </div>
      <div className="flex justify-center py-6 text-8xl">{parts.map((p) => icon[p.id]).join("")}</div>
      <div className="grid grid-cols-3 gap-2 px-6">
        {parts.map((p, i) => (
          <div key={p.id} className="flex flex-col gap-1">
            <div className="text-[11px]">
              {p.name[s.lang]}
              {i === 0 && d.remove.length > 0 && <div className="text-orange-600">− {d.remove.map((r) => ingredientName[r]?.[s.lang] ?? r).join(", ")}</div>}
              {i === 0 && d.add.length > 0 && <div className="text-teal-700">+ {d.add.map((a) => addOns.find((x) => x.id === a)!.name[s.lang]).join(", ")}</div>}
            </div>
            {i === 0 && isBurger(item) && (
              <Btn target="customize" className="rounded border border-neutral-400 py-1 text-[10px]">
                {tr("customize", s.lang)}
              </Btn>
            )}
            {i > 0 && (
              <button type="button" className="rounded border border-neutral-400 py-1 text-[10px]">
                {tr("change", s.lang)}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-3 px-6 pb-4">
        <div className="flex h-11 border border-neutral-300">
          <Btn target="qty_minus" className="w-12 text-xl">
            −
          </Btn>
          <div className="flex flex-1 items-center justify-center border-x border-neutral-300">{d.qty}</div>
          <Btn target="qty_plus" className="w-12 text-xl">
            +
          </Btn>
        </div>
        <div className="flex gap-3">
          <Btn target="cancel" className="flex-1 rounded border border-neutral-400 py-3">
            {tr("cancel", s.lang)}
          </Btn>
          <Btn target="add_to_cart" className="flex-[2] rounded bg-orange-500 py-3 font-bold text-white">
            {tr("addToOrder", s.lang)}
          </Btn>
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
      <div className="text-2xl font-bold">
        {tr("customize", s.lang)} — {item.name[s.lang]}
      </div>
      <div className="mt-5 mb-2 text-sm font-bold">{tr("ingredients", s.lang)}</div>
      <div className="grid grid-cols-2 gap-2">
        {item.ingredients
          .filter((g) => g !== "bun" && g !== "patty")
          .map((g) => {
            const off = d.remove.includes(g);
            return (
              <Btn key={g} target="toggle_ingredient" value={g} className={`flex items-center justify-between rounded border px-3 py-3 text-sm ${off ? "border-orange-500 bg-orange-50 line-through" : "border-neutral-300"}`}>
                {ingredientName[g]?.[s.lang] ?? g}
                <span className="text-xs no-underline">{off ? tr("removed", s.lang) : tr("remove", s.lang)}</span>
              </Btn>
            );
          })}
      </div>
      <div className="mt-5 mb-2 text-sm font-bold">{tr("extras", s.lang)}</div>
      <div className="grid grid-cols-2 gap-2">
        {addOns.map((a) => {
          const on = d.add.includes(a.id);
          return (
            <Btn key={a.id} target="toggle_addon" value={a.id} className={`flex items-center justify-between rounded border px-3 py-3 text-sm ${on ? "border-teal-700 bg-teal-50" : "border-neutral-300"}`}>
              {a.name[s.lang]}
              <span className="text-xs">+{won(a.price)}</span>
            </Btn>
          );
        })}
      </div>
      <Btn target="customize_done" className="mt-auto rounded bg-teal-700 py-3 font-bold text-white">
        {tr("done", s.lang)}
      </Btn>
    </div>
  );
}

function Added() {
  const { s } = useK();
  const last = s.cart[s.cart.length - 1];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="text-8xl">🛍️✅</div>
      <div className="text-center text-2xl">{tr("added", s.lang)}</div>
      {last && <div className="text-lg font-bold">{won(last.unitPrice * last.qty)}</div>}
      <Btn target="added_ok" className="rounded border border-neutral-300 px-6 py-2 text-sm">
        OK
      </Btn>
    </div>
  );
}

function Upsell() {
  const { s } = useK();
  const offers = simpleItems.filter((i) => i.category === "desserts");
  return (
    <div className="flex h-full flex-col items-center justify-center bg-neutral-900/60 p-6">
      <div className="w-full rounded-xl bg-white p-6">
        <div className="mb-4 text-center text-2xl font-bold">{tr("upsellTitle", s.lang)}</div>
        <div className="grid grid-cols-2 gap-3">
          {offers.map((o) => (
            <div key={o.id} className="flex flex-col items-center rounded border border-neutral-300 p-3">
              <span className="text-6xl">{icon[o.id]}</span>
              <span className="mt-2 text-sm">{o.name[s.lang]}</span>
              <span className="text-sm font-bold">{won(o.price)}</span>
              <Btn target="upsell_add" value={o.id} className="mt-2 w-full rounded bg-orange-500 py-1.5 text-sm font-bold text-white">
                {tr("add", s.lang)}
              </Btn>
            </div>
          ))}
        </div>
        <Btn target="upsell_no_thanks" className="mt-4 w-full rounded border border-neutral-400 py-3">
          {tr("noThanks", s.lang)}
        </Btn>
      </div>
    </div>
  );
}

function Review() {
  const { s } = useK();
  const total = s.cart.reduce((n, l) => n + l.qty * l.unitPrice, 0);
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-8">
        <Logo size="text-base" />
        <div className="mt-3 text-2xl font-bold">{tr("reviewTitle", s.lang)}</div>
        <div className="text-sm text-neutral-500">{s.orderType === "eat_in" ? tr("eatIn", s.lang) : tr("takeOut", s.lang)}</div>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        {s.cart.map((l, i) => {
          const item = findItem(l.menuId)!;
          return (
            <div key={i} className="flex items-start gap-3 border-b border-neutral-200 py-3">
              <span className="text-4xl">{icon[l.menuId]}</span>
              <div className="flex-1 text-sm">
                <div className="font-bold">
                  {item.name[s.lang]} {l.mode === "set" ? `${l.size} ${tr("set", s.lang)}` : ""} × {l.qty}
                </div>
                {l.mode === "set" && (
                  <div className="text-xs text-neutral-600">
                    {findItem(l.side!)!.name[s.lang]} · {findItem(l.drink!)!.name[s.lang]}
                  </div>
                )}
                {l.remove.length > 0 && <div className="text-xs text-orange-600">− {l.remove.map((r) => ingredientName[r]?.[s.lang] ?? r).join(", ")}</div>}
                {l.add.length > 0 && <div className="text-xs text-teal-700">+ {l.add.map((a) => addOns.find((x) => x.id === a)!.name[s.lang]).join(", ")}</div>}
              </div>
              <div className="text-sm font-bold">{won(l.unitPrice * l.qty)}</div>
              <Btn target="remove_line" value={String(i)} className="text-neutral-400">
                ✕
              </Btn>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between px-6 pb-2 text-xl font-bold">
        <span>{tr("total", s.lang)}</span>
        <span>{won(total)}</span>
      </div>
      <div className="flex gap-3 px-6 pb-4">
        <Btn target="add_more" className="flex-1 rounded border border-neutral-400 py-3">
          {tr("addMore", s.lang)}
        </Btn>
        <Btn target="pay" className="flex-[2] rounded bg-orange-500 py-3 text-lg font-bold text-white">
          {tr("pay", s.lang)} {won(total)}
        </Btn>
      </div>
      <BottomBar />
    </div>
  );
}

function Payment() {
  const { s } = useK();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="text-8xl">💳</div>
      <div className="text-2xl font-bold">{tr("paymentTitle", s.lang)}</div>
      <div className="text-sm text-neutral-500">{tr("paymentSub", s.lang)}</div>
      <Btn target="start_over" className="rounded border border-neutral-400 px-6 py-2 text-sm">
        {tr("startOver", s.lang)}
      </Btn>
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

export function FastfoodKiosk({ state, press, highlight, banner }: { state: KioskState; press: KioskCtx["press"]; highlight: Highlight; banner?: ReactNode }) {
  const Screen = screens[state.screen];
  return (
    <Ctx.Provider value={{ s: state, press, hl: highlight }}>
      <div className="relative h-[960px] w-[540px] overflow-hidden rounded-[28px] border-[10px] border-neutral-800 bg-white text-neutral-900 shadow-2xl" data-screen={state.screen}>
        <Screen />
        {banner}
      </div>
    </Ctx.Provider>
  );
}
