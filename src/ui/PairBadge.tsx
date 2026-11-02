"use client";

// 키오스크 대기 화면 구석의 짝짓기 표: 휴대폰으로 QR을 찍으면 /phone?room=… 이 열려 이 키오스크와 이어진다.
// 터치로 쓰는 사람에게 방해되지 않게 작게, 대기 화면에서만 띄운다.
import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore } from "react";
import { pairUrl } from "@/sync/room";

const noop = () => () => {};
// ?qr=0이면 QR을 띄우지 않는다(녹화 때)
export const useQrFlag = () =>
  useSyncExternalStore(
    noop,
    () => new URLSearchParams(location.search).get("qr") !== "0",
    () => false,
  );

// at: 놓을 자리. 기본은 화면 오른쪽 아래 구석, 나란히 비교·영상에서는 키오스크 칸 안(버튼을 가리지 않는 곳)
export function PairBadge({ room, at = "fixed right-3 bottom-3" }: { room: string; at?: string }) {
  const [qr, setQr] = useState<{ src: string; url: string } | null>(null);
  useEffect(() => {
    const url = pairUrl(location.origin, room);
    let live = true;
    void QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((svg) => live && setQr({ src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, url }));
    return () => {
      live = false;
    };
  }, [room]);

  return (
    <div className={`${at} z-50 flex items-center gap-2.5 rounded-xl bg-white/95 p-2 pr-3 shadow-lg`} data-pair={room}>
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 만든 QR data URL
        <img src={qr.src} alt={`Scan to connect your phone: ${qr.url}`} width={84} height={84} />
      )}
      <div className="text-xs leading-tight text-neutral-600">
        <div className="font-bold text-teal-800">KIBO</div>
        <div>휴대폰으로 찍어 연결</div>
        <div>Scan to talk to this kiosk</div>
        <div className="mt-1 font-mono text-[10px] text-neutral-400">…{room.slice(-4)}</div>
      </div>
    </div>
  );
}
