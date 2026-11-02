import { StatCard } from "../../Card";
import { statCards } from "../../cards";

export const metadata = { title: "KIBO film · stat 1" };

export default function Page() {
  return <StatCard {...statCards[0]} />;
}
