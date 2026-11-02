import { StatCard } from "../../Card";
import { proofCards } from "../../cards";

export const metadata = { title: "KIBO film · proof 1" };

export default function Page() {
  return <StatCard {...proofCards[0]} />;
}
