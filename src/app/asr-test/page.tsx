import { AsrTest } from "@/phone/AsrTest";

// 실제 휴대폰 받아쓰기 측정. 어디에도 링크하지 않고 검색에 올리지 않는다
export const metadata = { title: "KIBO ASR test", robots: { index: false, follow: false } };

export default function Page() {
  return <AsrTest />;
}
