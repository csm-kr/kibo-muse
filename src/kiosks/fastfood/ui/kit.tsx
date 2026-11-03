"use client";

// 키오스크 공통 부품. 화면 배치는 critic-demo kiosk-spec.md §3(실물 영상 측정, 540×960 기준)을 따른다.
// KIBO 규칙(§0): Btn은 눈에 보이는 버튼 상자 전체, 화면마다 같은 (target, value)는 하나, Btn 안에 Btn 없음, 44×44 이상.
// 사람만 누르는 버튼(도움 기능·영양정보·수정·결제 수단)은 data-target이 없는 HumanBtn이라 KIBO가 찾지 못한다.

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { unitPrice, type KioskState, type Target } from "../machine";
import { findItem, type Lang } from "../menu";
import { AccessIcon, BagIcon, BridgeMark, PointScanArt } from "./art";
import { t, won } from "./strings";

// pay: 결제 화면의 시연용 모의 결제(사람이 '카드 넣기'를 누르면 주문번호). machine은 모르는 화면 상태다
export interface DemoPay {
  no: number | null;
  onPay: () => void;
}

export interface KioskCtx {
  s: KioskState;
  press: (target: Target, value?: string) => void;
  pay?: DemoPay;
}

export const Ctx = createContext<KioskCtx | null>(null);
export const useK = () => useContext(Ctx)!;
export const tr = (key: keyof typeof t, lang: Lang) => t[key][lang];

export function Btn({ target, value, className = "", children }: { target: Target; value?: string; className?: string; children: ReactNode }) {
  const { press } = useK();
  return (
    <button type="button" data-target={target} data-value={value} onClick={() => press(target, value)} className={`relative ${className}`}>
      {children}
    </button>
  );
}

export function HumanBtn({ className = "", children, onClick, disabled }: { className?: string; children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}

// 사진 자리. 버튼 안에 들어가므로 span이다. 자리 크기는 className이 고정하고, width·height(원본 픽셀)로 비율도 밝혀 이동(CLS)이 없다.
// 사진은 미리 불러 둔 같은 주소를 바로 그린다(decoding sync). priority: 첫 화면의 큰 사진(LCP). srcSet: 휴대폰 폭에서 작은 판(LCP 바이트를 줄인다)
export function Photo({ src, srcSet, sizes, className = "", imgClass = "", imgStyle, size = [600, 600], priority = false }: { src: string; srcSet?: string; sizes?: string; className?: string; imgClass?: string; imgStyle?: CSSProperties; size?: [number, number]; priority?: boolean }) {
  return (
    <span className={`block overflow-hidden bg-(--bb-photo) ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 이미 600px webp라 변환이 필요 없고, 미리 불러온 같은 주소를 써야 640ms 단계 안에 그려진다 */}
      <img src={src} srcSet={srcSet} sizes={sizes} alt="" width={size[0]} height={size[1]} decoding="sync" fetchPriority={priority ? "high" : undefined} draggable={false} className={`h-full w-full object-cover ${imgClass}`} style={imgStyle} />
    </span>
  );
}

// 메뉴·사이즈·사이드·음료 카드(124×160). 사진이 위 60%, 이름은 왼쪽 위(KIBO 점은 오른쪽 아래에 놓인다)
export function ProductCard({ target, value, img, name, price, kcal, isNew, imgStyle }: { target: Target; value: string; img: string; name: string; price?: string | null; kcal?: number; isNew?: boolean; imgStyle?: CSSProperties }) {
  return (
    <Btn target={target} value={value} className="flex h-[160px] w-[124px] flex-col overflow-hidden rounded-xl border border-(--bb-line) bg-white text-left">
      <Photo src={img} className="h-[96px] w-full shrink-0" imgStyle={imgStyle} />
      {isNew && <span className="absolute top-1.5 left-1.5 rounded bg-(--bb-berry) px-1.5 text-[10px] leading-[18px] font-extrabold text-white">NEW</span>}
      <span className="flex min-h-0 flex-1 flex-col px-2 pt-1.5 pb-1.5">
        <span className="line-clamp-2 text-[13px] leading-4 font-semibold text-(--bb-ink)">{name}</span>
        <span className="mt-auto flex items-baseline gap-1.5 whitespace-nowrap">
          {price && <span className="text-[13px] font-extrabold text-(--bb-navy)">{price}</span>}
          {kcal !== undefined && <span className="text-[10px] text-(--bb-muted)">{kcal} kcal</span>}
        </span>
      </span>
    </Btn>
  );
}

export function HelpBtn({ className = "h-11 w-[110px]" }: { className?: string }) {
  const { s } = useK();
  return (
    <HumanBtn className={`flex items-center justify-center gap-1 rounded-lg border border-(--bb-muted) bg-white text-[13px] font-semibold text-(--bb-ink) ${className}`}>
      <AccessIcon size={16} />
      {tr("accessibility", s.lang)}
    </HumanBtn>
  );
}

export function StartOverBtn({ className = "h-11 w-[110px] rounded-lg text-[13px] font-semibold" }: { className?: string }) {
  const { s } = useK();
  return (
    <Btn target="start_over" className={`border border-(--bb-muted) bg-white text-(--bb-ink) ${className}`}>
      {tr("startOver", s.lang)}
    </Btn>
  );
}

// 포인트 상자: 실물처럼 하단 막대 오른쪽에 둔다(노랑 대신 연한 남색)
function PointBox() {
  const { s } = useK();
  return (
    <div className="flex h-[94px] w-[156px] shrink-0 items-center gap-1.5 self-center rounded-[10px] bg-(--bb-tint) px-2.5 text-(--bb-navy)">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] leading-4 font-extrabold">{tr("rewardsShort", s.lang)}</div>
        <div className="mt-0.5 text-[10px] leading-3">{tr("rewardsSubShort", s.lang)}</div>
      </div>
      <PointScanArt size={44} />
    </div>
  );
}

export const cartCount = (s: KioskState) => s.cart.reduce((n, l) => n + l.qty, 0);
export const cartTotal = (s: KioskState) => s.cart.reduce((n, l) => n + l.qty * l.unitPrice, 0);

// 하단 막대(110). 1줄: 담은 개수·총액·주문 내역(메뉴 화면만). 2줄: 처음으로·도움 기능. 오른쪽: 포인트 상자
export function BottomBar({ withCart = false }: { withCart?: boolean }) {
  const { s } = useK();
  const count = cartCount(s);
  return (
    <div className="flex h-[110px] shrink-0 gap-3 border-t border-(--bb-line) bg-white px-4">
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        {withCart && (
          <div className="flex items-center gap-3">
            <span className="relative">
              <BagIcon />
              <span data-cart-count={count} className="absolute -top-1.5 -right-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-(--bb-berry) px-1 text-[11px] font-extrabold text-white">
                {count}
              </span>
            </span>
            <span className="text-[20px] font-extrabold text-(--bb-navy)">{won(cartTotal(s))}</span>
            <Btn target="order_details" className="ml-auto h-11 w-[150px] rounded-[10px] bg-(--bb-cobalt) text-[15px] font-extrabold text-white">
              {tr("orderDetails", s.lang)}
            </Btn>
          </div>
        )}
        <div className="flex gap-2">
          <StartOverBtn />
          <HelpBtn />
        </div>
      </div>
      <PointBox />
    </div>
  );
}

// 세트 고르는 동안 위에 보이는 상품 머리: 표지, 이름과 세트 꼬리, 가격·kcal, 영양정보(사람만)
export function DraftHeader() {
  const { s } = useK();
  const d = s.draft!;
  const item = findItem(d.menuId)!;
  const suffix = d.mode === "set" ? ` - ${[d.size === "L" ? tr("large", s.lang) : d.size === "M" ? tr("medium", s.lang) : "", tr("set", s.lang)].filter(Boolean).join(" ")}` : "";
  return (
    <div className="flex h-[72px] shrink-0 items-center gap-3 px-4 pt-3">
      <span className="text-(--bb-navy)">
        <BridgeMark size={32} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[17px] leading-6 font-extrabold">
          {item.name[s.lang]}
          {suffix}
        </div>
        <div className="text-[12px] font-medium text-(--bb-muted)">{d.mode ? `${won(unitPrice(d))} · ${item.kcal} kcal` : `${item.kcal} kcal`}</div>
      </div>
      <HumanBtn className="h-11 w-[84px] shrink-0 rounded-lg border border-(--bb-muted) text-[12px] font-semibold">{tr("nutrition", s.lang)}</HumanBtn>
    </div>
  );
}

const STEPS = ["set_size", "set_side", "set_drink", "confirm"] as const;

// 왼쪽 단계 표시(세트 사이즈 → 사이드 → 음료 → 확인). 지금 단계는 왼쪽 코발트 막대, 지난 단계는 ✓
export function Stepper() {
  const { s } = useK();
  const idx = STEPS.indexOf(s.screen as (typeof STEPS)[number]);
  const labels = [tr("stepSize", s.lang), tr("stepSide", s.lang), tr("stepDrink", s.lang), tr("stepConfirm", s.lang)];
  return (
    <ol className="flex w-[112px] shrink-0 flex-col gap-1">
      {labels.map((l, i) => (
        <li key={i} className={`flex h-[52px] items-center gap-1.5 border-l-4 pr-1.5 pl-1.5 text-[12px] leading-[14px] ${i === idx ? "border-(--bb-cobalt) bg-white font-bold text-(--bb-navy)" : "border-transparent bg-(--bb-cream) font-semibold text-(--bb-ink)"}`}>
          <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0" aria-hidden>
            {i < idx ? (
              <>
                <circle cx="9" cy="9" r="8" fill="var(--bb-cobalt)" />
                <path d="M5 9.2l2.6 2.6L13 6.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </>
            ) : (
              <circle cx="9" cy="9" r="7.5" fill="none" stroke={i === idx ? "var(--bb-cobalt)" : "var(--bb-muted)"} strokeWidth="1.6" />
            )}
          </svg>
          <span>{l}</span>
        </li>
      ))}
    </ol>
  );
}

// 세트 단계 맨 아래: 취소(넓게), 그 아래 처음으로·도움 기능(실물 y 87.5–96%). indent: 왼쪽 단계 표시 오른쪽부터
export function CancelRow({ indent = false }: { indent?: boolean }) {
  const { s } = useK();
  return (
    <div className="flex shrink-0 flex-col gap-4 px-4 pt-3 pb-3">
      <Btn target="cancel" className={`h-12 rounded-lg border border-(--bb-ink) bg-white text-[15px] font-bold text-(--bb-ink) ${indent ? "ml-[108px]" : ""}`}>
        {tr("cancel", s.lang)}
      </Btn>
      <div className="flex gap-2">
        <StartOverBtn />
        <HelpBtn />
      </div>
    </div>
  );
}
