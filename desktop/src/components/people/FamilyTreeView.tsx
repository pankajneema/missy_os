import { useAuthStore } from "@/store/auth-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials, type Person } from "@/lib/people";

const ROWS: { label: string; relationships: string[] }[] = [
  { label: "Grandparents", relationships: ["Grandparent"] },
  { label: "Parents & their siblings", relationships: ["Father", "Mother", "Uncle", "Aunt"] },
  { label: "Your generation", relationships: ["Spouse", "Brother", "Sister", "Cousin"] },
  { label: "Children", relationships: ["Child"] },
];

function TreeNode({ person, onClick, highlight }: { person: Person; onClick?: () => void; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-colors ${
        onClick ? "hover:bg-muted" : ""
      } ${highlight ? "ring-2 ring-primary" : ""}`}
    >
      <Avatar size="lg">
        <AvatarImage src={person.photo} />
        <AvatarFallback>{initials(person.name)}</AvatarFallback>
      </Avatar>
      <p className="w-full truncate text-xs font-medium text-foreground">{person.name}</p>
      <p className="truncate text-[11px] text-muted-foreground">{person.relationship}</p>
    </button>
  );
}

export function FamilyTreeView({ people, onSelect }: { people: Person[]; onSelect: (person: Person) => void }) {
  const { username } = useAuthStore();
  const grouped = ROWS.map((row) => ({
    ...row,
    people: people.filter((p) => row.relationships.includes(p.relationship)),
  }));
  const other = people.filter((p) => !ROWS.some((row) => row.relationships.includes(p.relationship)));

  return (
    <div className="space-y-8 py-2">
      {grouped.map(
        (row) =>
          (row.people.length > 0 || row.label === "Your generation") && (
            <div key={row.label}>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{row.label}</p>
              <div className="flex flex-wrap items-start gap-1 border-b border-dashed border-border pb-6">
                {row.label === "Your generation" && (
                  <div className="flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-lg p-2 text-center">
                    <Avatar size="lg">
                      <AvatarFallback>{initials(username ?? "You")}</AvatarFallback>
                    </Avatar>
                    <p className="w-full truncate text-xs font-medium text-foreground">You</p>
                  </div>
                )}
                {row.people.map((p) => (
                  <TreeNode key={p.id} person={p} onClick={() => onSelect(p)} />
                ))}
              </div>
            </div>
          ),
      )}
      {other.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Other relatives</p>
          <div className="flex flex-wrap gap-1">
            {other.map((p) => (
              <TreeNode key={p.id} person={p} onClick={() => onSelect(p)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
