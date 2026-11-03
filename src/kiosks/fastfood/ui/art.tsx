// Bridge Burger 로고와 화면 그림(SVG). 가상 브랜드다: 실제 버거 브랜드 표장(겹친 아치, 왕관 등)을 닮지 않게 다리 하나(상판·아치·줄)로 그린다.
// 색은 토큰(var(--bb-*))만 쓴다. 그림은 장식이라 화면 낭독기에서 숨긴다(aria-hidden).

const NAVY = "var(--bb-navy)";
const COBALT = "var(--bb-cobalt)";
const TINT = "var(--bb-tint)";

// 다리 모양 표지: 상판 위에 아치 하나, 아치에서 상판으로 내려오는 줄 세 개(2px 선)
export function BridgeMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 28) / 40} viewBox="0 0 40 28" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <path d="M3 22H37" />
      <path d="M6 22Q20 2 34 22" />
      <path d="M13 22V14.5M20 22V12M27 22V14.5" strokeWidth="2" />
    </svg>
  );
}

// 워드마크. stacked: 레일처럼 좁은 곳(표지 위, 두 줄 글자)
export function Logo({ tone = "navy", stacked = false, size = 32 }: { tone?: "navy" | "white"; stacked?: boolean; size?: number }) {
  const color = tone === "white" ? "text-white" : "text-(--bb-navy)";
  if (stacked)
    return (
      <div className={`flex flex-col items-center ${color}`}>
        <BridgeMark size={size} />
        <div className="mt-0.5 text-center text-[13px] leading-[14px] font-black tracking-tight">
          Bridge
          <br />
          Burger
        </div>
      </div>
    );
  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      <BridgeMark size={size} />
      <span className="text-[17px] leading-none font-black tracking-tight whitespace-nowrap">Bridge Burger</span>
    </div>
  );
}

export function BagIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden>
      <path d="M5 9h18l-1.4 15.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8z" fill={NAVY} />
      <path d="M10 11V7.5a4 4 0 0 1 8 0V11" stroke={NAVY} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// 포인트 적립: 앱 바코드가 뜬 휴대폰을 스캐너 창에 대는 그림. QR 모양은 쓰지 않는다(화면의 QR은 KIBO 연결 QR 하나뿐이어야
// 사용자 시험 참가자가 장식 QR을 찍고 헤매지 않는다)
export function PointScanArt({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect x="15" y="3" width="18" height="29" rx="3" fill={NAVY} />
      <rect x="17" y="6" width="14" height="21" rx="1" fill="#fff" />
      <path d="M19 10v13M20.6 10v13M22.8 10v13M24.4 10v13M26.6 10v13M27.8 10v13M29 10v13" stroke={NAVY} strokeWidth="0.9" />
      <rect x="4" y="34" width="40" height="11" rx="3" fill={NAVY} />
      <rect x="9" y="38.5" width="30" height="2" rx="1" fill={COBALT} />
    </svg>
  );
}

export function GlobeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" />
    </svg>
  );
}

export function AccessIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none" />
      <path d="M5 8.5l7 1.5 7-1.5M12 10v5l-3 6M12 15l3 6" />
    </svg>
  );
}

export function StarIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.1l-5.7 3.2 1.2-6.4-4.7-4.4 6.4-.8z" fill={COBALT} />
    </svg>
  );
}

// 대기 화면 '주문하기' 손가락
export function TapIcon({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="20" cy="12" r="8" stroke="#fff" strokeOpacity=".55" strokeWidth="2" />
      <path d="M17 30V12.5a3 3 0 0 1 6 0V24l9.6 2a4 4 0 0 1 3.2 4.4L34.6 42H19.5l-6.8-8.6a3 3 0 0 1 4.3-4.1z" fill="#fff" />
    </svg>
  );
}

// 매장 식사: 탁자 위 쟁반(버거·컵)과 옆의 의자
export function EatInArt({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <rect x="10" y="62" width="76" height="6" rx="3" fill={NAVY} />
      <rect x="45" y="68" width="6" height="36" fill={NAVY} />
      <rect x="32" y="102" width="32" height="5" rx="2.5" fill={NAVY} />
      <rect x="16" y="56" width="64" height="6" rx="2" fill={COBALT} />
      <path d="M22 56v-3h20v3z" fill={NAVY} />
      <path d="M22 52a10 7 0 0 1 20 0z" fill={COBALT} />
      <path d="M56 30h14l-2 26H58z" fill={COBALT} />
      <rect x="55" y="27" width="16" height="4" rx="2" fill={NAVY} />
      <path d="M65 27l3-9" stroke={NAVY} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M96 46v58M96 76h16v28" fill="none" stroke={NAVY} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="93" y="72" width="22" height="6" rx="3" fill={COBALT} />
    </svg>
  );
}

// 포장: 로고 없는 종이봉투
export function TakeOutArt({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <path d="M30 40h60l-5 66H35z" fill={COBALT} />
      <path d="M30 40l8-10h44l8 10" fill={NAVY} />
      <path d="M48 40v-6a12 12 0 0 1 24 0v6" fill="none" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
      <rect x="44" y="60" width="32" height="4" rx="2" fill={TINT} />
    </svg>
  );
}

export function CardArt({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 64) / 96} viewBox="0 0 96 64" aria-hidden>
      <rect x="2" y="2" width="92" height="60" rx="8" fill={NAVY} />
      <rect x="2" y="14" width="92" height="10" fill={COBALT} />
      <rect x="12" y="34" width="16" height="12" rx="2" fill="#E9D9A8" />
      <rect x="40" y="44" width="40" height="5" rx="2.5" fill={TINT} />
    </svg>
  );
}

export function MobileArt({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 64) / 96} viewBox="0 0 96 64" aria-hidden>
      <rect x="30" y="2" width="36" height="60" rx="6" fill={NAVY} />
      <rect x="34" y="8" width="28" height="44" rx="2" fill="#fff" />
      <path d="M38 18v24M41 18v24M45 18v24M47 18v24M51 18v24M55 18v24M58 18v24" stroke={NAVY} strokeWidth="1.6" />
    </svg>
  );
}

// 카드 투입: 투입구와 아래로 들어가는 카드, 화살표
export function CardSlotArt({ size = 220 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 220 220" aria-hidden>
      <rect x="20" y="120" width="180" height="84" rx="14" fill={NAVY} />
      <rect x="44" y="140" width="132" height="10" rx="5" fill="#0B1428" />
      <rect x="70" y="40" width="80" height="88" rx="8" fill={COBALT} />
      <rect x="82" y="58" width="22" height="16" rx="3" fill="#E9D9A8" />
      <path d="M110 6v26M98 22l12 12 12-12" fill="none" stroke="var(--bb-berry)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="20" y="120" width="180" height="16" fill={NAVY} />
    </svg>
  );
}

// 담김 알림: 쇼핑백과 코발트 ✓
export function AddedArt({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <path d="M12 24h40l-3 38a4 4 0 0 1-4 3.6H19a4 4 0 0 1-4-3.6z" fill={NAVY} />
      <path d="M23 28v-8a9 9 0 0 1 18 0v8" fill="none" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
      <circle cx="52" cy="50" r="16" fill={COBALT} stroke="#fff" strokeWidth="3" />
      <path d="M44.5 50.5l5 5 9-10" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
