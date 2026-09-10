import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeCollection } from "@/lib/prototype-store";
import { PEOPLE_CATEGORIES, initials, type Person } from "@/lib/people";
import { SectionTabs, MEMORY_TABS } from "@/components/shared/SectionTabs";

const ROUTES: Record<Person["category"], string> = {
  family: "/about/family",
  friend: "/about/friends",
  work: "/about/work",
  important: "/about/important-people",
};

export function MemoryPeoplePage() {
  const family = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.family.storageKey);
  const friends = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.friend.storageKey);
  const work = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.work.storageKey);
  const important = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.important.storageKey);

  const people = [...family.items, ...friends.items, ...work.items, ...important.items].filter(
    (p) => p.notes || p.memories,
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">People</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={MEMORY_TABS} />
          <p className="mb-1 text-sm text-muted-foreground">
            What Missy should know about the people in your life — pulled from the notes and memories on each
            person's profile in About You.
          </p>
          <PrototypeNotice>Reflects real profile data you entered, but isn't yet fed into Missy's actual chat memory.</PrototypeNotice>

          {people.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nothing yet"
              description='Add relationship notes or important memories to someone in About You, and they’ll show up here.'
            />
          ) : (
            <div className="space-y-2">
              {people.map((p) => (
                <Link
                  key={p.id}
                  to={ROUTES[p.category]}
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:bg-muted"
                >
                  <Avatar>
                    <AvatarImage src={p.photo} />
                    <AvatarFallback>{initials(p.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {p.name} <Badge variant="outline">{p.relationship}</Badge>
                    </p>
                    {p.notes && <p className="mt-0.5 text-sm text-foreground/80">{p.notes}</p>}
                    {p.memories && <p className="mt-0.5 text-xs text-muted-foreground">{p.memories}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
