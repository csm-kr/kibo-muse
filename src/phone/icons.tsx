// 휴대폰 아이콘. 이모지는 기기마다 모양이 달라 SVG로 쓴다(선 2px, currentColor, 기본 24px). 모두 장식이라 aria-hidden
import type { ReactNode } from "react";

function Icon({ size = 24, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const MicIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
  </Icon>
);

export const SpeakerIcon = ({ on, size }: { on: boolean; size?: number }) => (
  <Icon size={size}>
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    {on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="m17 9 5 6m0-6-5 6" />}
  </Icon>
);

export const CameraIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);

// 손가락(키오스크 화면을 사람이 직접 누른다)
export const TapIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M9 11V5a1.5 1.5 0 0 1 3 0v5m0-1a1.5 1.5 0 0 1 3 0v1m0 0a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-.5a5.5 5.5 0 0 1-4.6-2.5L5 15.5a1.5 1.5 0 0 1 2.4-1.8L9 15" />
  </Icon>
);

export const CheckIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M5 12.5 10 17.5 19 7" />
  </Icon>
);

export const AlertIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </Icon>
);

// KIBO 표지: 청록 점(10px)을 주황 고리(20px, 선 2px)가 감싼다. 키오스크에서 KIBO가 누르는 자리 표시와 같은 모양
export const KiboMark = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
    <circle cx="10" cy="10" r="9" fill="none" stroke="var(--k-orange)" strokeWidth="2" />
    <circle cx="10" cy="10" r="5" fill="var(--k-teal)" />
  </svg>
);
