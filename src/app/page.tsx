import world from "../../data/world.json";
import { Town } from "@/components/Town";
import type { World } from "@/lib/world";

export default function Page() {
  return <Town world={world as unknown as World} />;
}
