import town from "../../data/town.json";
import { loadTickets } from "@/lib/ticket";
import { Workbench } from "@/components/Workbench";
import type { Town } from "@/lib/impact";

export default function Page() {
  const tickets = loadTickets();
  return <Workbench town={town as unknown as Town} meta={town.meta} ticket={tickets[0]} />;
}
