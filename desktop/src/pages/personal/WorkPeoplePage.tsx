import { PeoplePage } from "./PeoplePage";
import { PEOPLE_CATEGORIES } from "@/lib/people";

export function WorkPeoplePage() {
  return <PeoplePage config={PEOPLE_CATEGORIES.work} />;
}
