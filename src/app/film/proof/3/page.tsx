import { StatCard } from "../../Card";
import { proofCards } from "../../cards";

export const metadata = { title: "KIBO film · proof 3" };

export default function Page() {
  return <StatCard {...proofCards[2]} />;
}
