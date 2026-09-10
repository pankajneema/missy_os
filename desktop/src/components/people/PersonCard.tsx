import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { initials, type Person } from "@/lib/people";

export function PersonCard({ person, onClick }: { person: Person; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:bg-muted"
    >
      <Avatar size="lg">
        <AvatarImage src={person.photo} />
        <AvatarFallback>{initials(person.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{person.name}</p>
        <Badge variant="outline" className="mt-1">
          {person.relationship}
        </Badge>
      </div>
    </button>
  );
}
