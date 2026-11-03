import town from "../../../data/town.json";
import { loadTickets } from "@/lib/ticket";
import { Workbench } from "@/components/Workbench";
import type { Town } from "@/lib/impact";

// 町全体の地図と、バスの便を外す作業台。町の中のバス停の依頼を深く解くときに使う
export default function MapPage() {
  return <Workbench town={town as unknown as Town} meta={town.meta} tickets={loadTickets()} />;
}
