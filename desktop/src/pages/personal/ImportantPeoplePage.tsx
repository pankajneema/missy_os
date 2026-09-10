import { PeoplePage } from "./PeoplePage";
import { PEOPLE_CATEGORIES } from "@/lib/people";

export function ImportantPeoplePage() {
  return <PeoplePage config={PEOPLE_CATEGORIES.important} />;
}
