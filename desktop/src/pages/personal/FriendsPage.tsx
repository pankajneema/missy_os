import { PeoplePage } from "./PeoplePage";
import { PEOPLE_CATEGORIES } from "@/lib/people";

export function FriendsPage() {
  return <PeoplePage config={PEOPLE_CATEGORIES.friend} />;
}
