// 받아쓰기(Transcribe)에 넘길 고유 이름. 키오스크 화면에 나오는 이름을 잘 알아듣게 한다.
import { airlines, booking } from "./airport/booking";
import { burgers, simpleItems } from "./fastfood/menu";
import { stations } from "./train/rail";

export function keywordsFor(kiosk: string | null): string[] {
  if (kiosk === "airport") {
    const { from, to } = booking.flight;
    return [...airlines.flatMap((a) => [a.name.en, a.name.ko]), from.city.en, from.city.ko, to.city.en, to.city.ko, "Incheon", "인천", "Narita", "나리타"];
  }
  if (kiosk === "train") return stations.flatMap((s) => [s.name.en, s.name.ko]);
  return [...burgers, ...simpleItems].flatMap((i) => [i.name.en, i.name.ko]);
}
