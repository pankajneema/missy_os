import { PeoplePage } from "./PeoplePage";
import { PEOPLE_CATEGORIES } from "@/lib/people";

export function FamilyPage() {
  return <PeoplePage config={PEOPLE_CATEGORIES.family} />;
}
