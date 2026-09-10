import { Pencil, MapPin, Cake, Briefcase } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { initials, type Person } from "@/lib/people";

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value}</p>
    </div>
  );
}

export function PersonDetailDialog({
  person,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  person: Person | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!person) return null;
  const isWork = person.category === "work";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src={person.photo} />
              <AvatarFallback>{initials(person.name)}</AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle>{person.name}</DialogTitle>
              <DialogDescription>
                <Badge variant="outline" className="mt-1">
                  {person.relationship}
                </Badge>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          {person.birthday && (
            <span className="flex items-center gap-1">
              <Cake className="h-3.5 w-3.5" /> {new Date(person.birthday).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
            </span>
          )}
          {person.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {person.location}
            </span>
          )}
          {(person.company || person.profession) && (
            <span className="flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" />
              {isWork ? [person.role, person.company].filter(Boolean).join(" · ") : person.profession}
            </span>
          )}
        </div>

        <div className="space-y-3 border-t border-border pt-3">
          <Field label="About" value={person.about} />
          {isWork ? (
            <Field label="Projects together" value={person.projects} />
          ) : (
            <>
              <Field label="How you know each other" value={person.howMet} />
              <Field label="Known since" value={person.knownSince} />
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Likes" value={person.likes} />
            <Field label="Dislikes" value={person.dislikes} />
          </div>
          <Field label="Important memories" value={person.memories} />
          <Field label={isWork ? "Communication style & notes" : "Relationship notes"} value={person.notes} />
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <ConfirmDeleteButton confirmText={`Remove ${person.name}?`} onConfirm={onDelete} />
          <Button onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
