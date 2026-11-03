// 받아쓰기(Transcribe)에 넘길 고유 이름. 키오스크 화면에 나오는 이름을 잘 알아듣게 한다.
import { airlines, booking } from "./airport/booking";
import { burgers, simpleItems } from "./fastfood/menu";
import { stations } from "./train/rail";
import { t as air } from "./airport/ui/strings";
import { t as ff } from "./fastfood/ui/strings";
import { t as rail } from "./train/ui/strings";

export function keywordsFor(kiosk: string | null): string[] {
  if (kiosk === "airport") {
    const { from, to } = booking.flight;
    return [...airlines.flatMap((a) => [a.name.en, a.name.ko]), from.city.en, from.city.ko, to.city.en, to.city.ko, "Incheon", "인천", "Narita", "나리타"];
  }
  if (kiosk === "train") return stations.flatMap((s) => [s.name.en, s.name.ko]);
  return [...burgers, ...simpleItems].flatMap((i) => [i.name.en, i.name.ko]);
}

// 거절·결제 넘김 문구가 [ ] 안에 그대로 인용하는 키오스크 화면 버튼 글자(키오스크 화면 문구와 같은 출처, 한국어·영어 둘 다).
// 키오스크 언어 그대로라 대답 언어와 문자가 다를 수 있어 섞임 판정(langmix)이 고유명사처럼 뺀다. 받아쓰기 keywords에는 넣지 않는다
export function buttonsFor(kiosk: string | null): string[] {
  const labels = (...xs: Record<string, string>[]) => xs.flatMap((x) => Object.values(x));
  if (kiosk === "airport") return labels(air.exit);
  if (kiosk === "train") return labels(rail.home);
  return labels(ff.startOver, ff.pay);
}
