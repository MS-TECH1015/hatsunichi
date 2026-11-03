import town from "../../data/town.json";
import { loadTickets } from "@/lib/ticket";
import { Workbench } from "@/components/Workbench";
import type { Town } from "@/lib/impact";

// 先生が tickets/ を差し替えたら次の表示で変わるように、毎回読む
export const dynamic = "force-dynamic";

export default function Page() {
  const tickets = loadTickets();
  return <Workbench town={town as unknown as Town} meta={town.meta} tickets={tickets} />;
}
