import { useState } from "react";
import { CalendarHeart, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeCollection, newId } from "@/lib/prototype-store";
import { PEOPLE_CATEGORIES, type Person } from "@/lib/people";
import { SectionTabs, LIFE_TABS } from "@/components/shared/SectionTabs";

interface ImportantDate {
  id: string;
  title: string;
  date: string; // yyyy-mm-dd; year may be a placeholder for recurring dates
  category: string;
  notes?: string;
}

const CATEGORIES = ["Birthday", "Anniversary", "Family event", "Work anniversary", "Deadline", "Milestone", "Other"];

function dayOfYearDistance(dateStr: string): number {
  const now = new Date();
  const d = new Date(dateStr);
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1);
  return Math.round((next.getTime() - now.getTime()) / 86400000);
}

function formatUpcoming(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function AddDateForm({ onAdd }: { onAdd: (d: ImportantDate) => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [notes, setNotes] = useState("");

  function handleAdd() {
    if (!title.trim() || !date) return;
    onAdd({ id: newId(), title: title.trim(), date, category, notes: notes.trim() || undefined });
    setTitle("");
    setDate("");
    setNotes("");
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="date-title">Title</Label>
          <Input id="date-title" placeholder="e.g. Mom's birthday" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date-date">Date</Label>
          <Input id="date-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="date-notes">Notes (optional)</Label>
        <Textarea id="date-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button size="sm" onClick={handleAdd} disabled={!title.trim() || !date}>
        <Plus className="h-3.5 w-3.5" /> Add date
      </Button>
    </div>
  );
}

export function ImportantDatesPage() {
  const { items, add, remove } = usePrototypeCollection<ImportantDate>("important-dates");
  const family = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.family.storageKey);
  const friends = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.friend.storageKey);
  const work = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.work.storageKey);
  const important = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.important.storageKey);

  const birthdayEntries = [...family.items, ...friends.items, ...work.items, ...important.items]
    .filter((p) => p.birthday)
    .map((p) => ({
      id: `bday-${p.id}`,
      title: `${p.name}'s birthday`,
      date: p.birthday!,
      category: "Birthday",
      source: p.relationship,
      derived: true as const,
    }));

  const manualEntries = items.map((d) => ({ ...d, source: undefined, derived: false as const }));
  const all = [...birthdayEntries, ...manualEntries].sort((a, b) => dayOfYearDistance(a.date) - dayOfYearDistance(b.date));

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Important Dates</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={LIFE_TABS} />
          <p className="mb-1 text-sm text-muted-foreground">
            Every important date in one place — birthdays are pulled in automatically from Family, Friends, Work &
            People, and Important People.
          </p>
          <PrototypeNotice />

          <AddDateForm onAdd={add} />

          <div className="mt-8">
            {all.length === 0 ? (
              <EmptyState icon={CalendarHeart} title="No dates yet" description="Add one above, or add birthdays to people in About You." />
            ) : (
              <div>
                {all.map((d) => (
                  <div key={d.id} className="flex items-start justify-between gap-3 border-b border-border/60 py-3 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{d.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(d.date).toLocaleDateString(undefined, { month: "long", day: "numeric" })} ·{" "}
                        {formatUpcoming(dayOfYearDistance(d.date))}
                        {"source" in d && d.source && ` · ${d.source}`}
                      </p>
                      {"notes" in d && d.notes && <p className="mt-1 text-sm text-foreground/80">{d.notes}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">{d.category}</Badge>
                      {!d.derived && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(d.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
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
