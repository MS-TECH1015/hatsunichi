import town from "../../data/town.json";
import { loadTickets } from "@/lib/ticket";
import { Workbench } from "@/components/Workbench";
import type { Town } from "@/lib/impact";

// 静的書き出し。tickets/ を差し替えたらビルドし直す
export default function Page() {
  const tickets = loadTickets();
  return <Workbench town={town as unknown as Town} meta={town.meta} tickets={tickets} />;
}
