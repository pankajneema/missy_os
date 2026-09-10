import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Person, PersonCategoryConfig } from "@/lib/people";
import { initials } from "@/lib/people";
import { newId } from "@/lib/prototype-store";

function blankPerson(category: Person["category"], relationship: string): Person {
  return { id: newId(), category, name: "", relationship };
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PersonFormDialog({
  config,
  open,
  onOpenChange,
  person,
  onSave,
}: {
  config: PersonCategoryConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Person | null;
  onSave: (person: Person) => void;
}) {
  const [draft, setDraft] = useState<Person>(() => person ?? blankPerson(config.category, config.relationshipOptions[0]));

  useEffect(() => {
    if (open) setDraft(person ?? blankPerson(config.category, config.relationshipOptions[0]));
  }, [open, person, config]);

  function field<K extends keyof Person>(key: K, value: Person[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) field("photo", await fileToDataUrl(file));
  }

  function handleSave() {
    if (!draft.name.trim()) return;
    onSave({ ...draft, name: draft.name.trim() });
    onOpenChange(false);
  }

  const isWork = config.category === "work";
  const isFriend = config.category === "friend";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{person ? `Edit ${draft.name || config.singular}` : `Add a ${config.singular}`}</DialogTitle>
          <DialogDescription>Only the name is required — add as much or as little else as you like.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src={draft.photo} />
              <AvatarFallback>{initials(draft.name || "?")}</AvatarFallback>
            </Avatar>
            <div>
              <input
                id="person-photo"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhoto}
              />
              <Label htmlFor="person-photo" className="cursor-pointer text-xs font-medium text-primary hover:underline">
                {draft.photo ? "Change photo" : "Add photo"}
              </Label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="person-name">Name</Label>
              <Input id="person-name" value={draft.name} onChange={(e) => field("name", e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>{config.relationshipLabel}</Label>
              <Select value={draft.relationship} onValueChange={(v) => field("relationship", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {config.relationshipOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="person-birthday">Birthday</Label>
              <Input
                id="person-birthday"
                type="date"
                value={draft.birthday ?? ""}
                onChange={(e) => field("birthday", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-location">Location</Label>
              <Input id="person-location" value={draft.location ?? ""} onChange={(e) => field("location", e.target.value)} />
            </div>
          </div>

          {isWork ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="person-company">Company</Label>
                <Input id="person-company" value={draft.company ?? ""} onChange={(e) => field("company", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="person-role">Role</Label>
                <Input id="person-role" value={draft.role ?? ""} onChange={(e) => field("role", e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="person-profession">Profession</Label>
              <Input id="person-profession" value={draft.profession ?? ""} onChange={(e) => field("profession", e.target.value)} />
            </div>
          )}

          {isFriend && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="person-howmet">How you know each other</Label>
                <Input id="person-howmet" value={draft.howMet ?? ""} onChange={(e) => field("howMet", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="person-since">Known since</Label>
                <Input id="person-since" placeholder="e.g. 2015" value={draft.knownSince ?? ""} onChange={(e) => field("knownSince", e.target.value)} />
              </div>
            </div>
          )}

          {isWork && (
            <div className="space-y-1.5">
              <Label htmlFor="person-projects">Projects together</Label>
              <Input id="person-projects" value={draft.projects ?? ""} onChange={(e) => field("projects", e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="person-about">About them</Label>
            <Textarea id="person-about" rows={2} value={draft.about ?? ""} onChange={(e) => field("about", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="person-likes">Likes</Label>
              <Input id="person-likes" value={draft.likes ?? ""} onChange={(e) => field("likes", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-dislikes">Dislikes</Label>
              <Input id="person-dislikes" value={draft.dislikes ?? ""} onChange={(e) => field("dislikes", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-memories">Important memories</Label>
            <Textarea id="person-memories" rows={2} value={draft.memories ?? ""} onChange={(e) => field("memories", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-notes">
              {isWork ? "Communication style & notes" : "Relationship notes"}
            </Label>
            <Textarea
              id="person-notes"
              rows={2}
              placeholder={isWork ? "e.g. Keep it professional, prefers email over calls." : "e.g. We're very close — I usually ask them for advice."}
              value={draft.notes ?? ""}
              onChange={(e) => field("notes", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!draft.name.trim()}>
            {person ? "Save changes" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
