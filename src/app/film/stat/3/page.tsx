import { StatCard } from "../../Card";
import { statCards } from "../../cards";

export const metadata = { title: "KIBO film · stat 3" };

export default function Page() {
  return <StatCard {...statCards[2]} />;
}
