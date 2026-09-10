import { useState } from "react";
import { Milestone, Plus, X, ImagePlus, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeCollection, newId } from "@/lib/prototype-store";
import { PEOPLE_CATEGORIES, type Person } from "@/lib/people";
import { SectionTabs, LIFE_TABS } from "@/components/shared/SectionTabs";

interface LifeEvent {
  id: string;
  date: string;
  title: string;
  description?: string;
  people: string[];
  photo?: string;
  documentName?: string;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AddEventForm({ people, onAdd }: { people: Person[]; onAdd: (e: LifeEvent) => void }) {
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [photo, setPhoto] = useState<string | undefined>();
  const [documentName, setDocumentName] = useState<string | undefined>();

  function togglePerson(id: string) {
    setSelectedPeople((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function handleAdd() {
    if (!title.trim() || !date) return;
    onAdd({ id: newId(), date, title: title.trim(), description: description.trim() || undefined, people: selectedPeople, photo, documentName });
    setDate("");
    setTitle("");
    setDescription("");
    setSelectedPeople([]);
    setPhoto(undefined);
    setDocumentName(undefined);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="event-date">Date</Label>
          <Input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-title">Title</Label>
          <Input id="event-title" placeholder="e.g. Started university" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="event-desc">Description</Label>
        <Textarea id="event-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {people.length > 0 && (
        <div className="space-y-1.5">
          <Label>People involved</Label>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => togglePerson(p.id)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  selectedPeople.includes(p.id)
                    ? "border-primary bg-accent-soft text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div>
          <input
            id="event-photo"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setPhoto(await fileToDataUrl(file));
            }}
          />
          <Label htmlFor="event-photo" className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <ImagePlus className="h-3.5 w-3.5" /> {photo ? "Photo added" : "Add a photo"}
          </Label>
        </div>
        <div>
          <input
            id="event-doc"
            type="file"
            className="hidden"
            onChange={(e) => setDocumentName(e.target.files?.[0]?.name)}
          />
          <Label htmlFor="event-doc" className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <Paperclip className="h-3.5 w-3.5" /> {documentName ?? "Attach a document"}
          </Label>
        </div>
      </div>

      <Button size="sm" onClick={handleAdd} disabled={!title.trim() || !date}>
        <Plus className="h-3.5 w-3.5" /> Add to timeline
      </Button>
    </div>
  );
}

export function LifeTimelinePage() {
  const { items, add, remove } = usePrototypeCollection<LifeEvent>("life-events");
  const family = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.family.storageKey);
  const friends = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.friend.storageKey);
  const work = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.work.storageKey);
  const important = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.important.storageKey);
  const allPeople = [...family.items, ...friends.items, ...work.items, ...important.items];
  const byId = Object.fromEntries(allPeople.map((p) => [p.id, p]));

  const sorted = [...items].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">My Life</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={LIFE_TABS} />
          <p className="mb-1 text-sm text-muted-foreground">A chronological timeline of the important events in your life.</p>
          <PrototypeNotice />

          <AddEventForm people={allPeople} onAdd={add} />

          <div className="mt-8">
            {sorted.length === 0 ? (
              <EmptyState icon={Milestone} title="No events yet" description="Add your first milestone above." />
            ) : (
              <div className="relative space-y-6 border-l border-border pl-6">
                {sorted.map((ev) => (
                  <div key={ev.id} className="relative">
                    <span className="absolute top-1.5 -left-[29px] h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">
                          {new Date(ev.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                        </p>
                        <p className="text-sm font-medium text-foreground">{ev.title}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => remove(ev.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {ev.description && <p className="mt-1 text-sm text-foreground/80">{ev.description}</p>}
                    {ev.photo && <img src={ev.photo} alt="" className="mt-2 max-h-40 rounded-lg border border-border object-cover" />}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ev.people.map((id) => byId[id] && <Badge key={id} variant="outline">{byId[id].name}</Badge>)}
                      {ev.documentName && (
                        <Badge variant="secondary">
                          <Paperclip className="h-3 w-3" /> {ev.documentName}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
