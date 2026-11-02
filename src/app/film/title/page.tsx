import { C, StatCard } from "../Card";

export const metadata = { title: "KIBO film · title" };

// 장면 5 (6초)
export default function Page() {
  return <StatCard big="KIBO" desc="Any kiosk. Any language. Just say it." source="Kiosk Intelligence Bridge & Operator" bigColor={C.second} descSize={64} sourceSize={32} />;
}
