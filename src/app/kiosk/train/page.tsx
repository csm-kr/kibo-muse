import { TrainStation } from "@/kiosks/train/ui/Station";

export const metadata = { title: "Bridge Rail ticket machine · KIBO" };

// ?view=kiosk 이면 개발 콘솔 없이 발매기만 보인다(Station이 브라우저에서 읽는다)
export default function Page() {
  return <TrainStation />;
}
