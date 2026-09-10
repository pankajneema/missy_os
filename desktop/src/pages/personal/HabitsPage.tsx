import { useState } from "react";
import { Flame, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { usePrototypeCollection, newId } from "@/lib/prototype-store";
import { SectionTabs, ROUTINE_TABS } from "@/components/shared/SectionTabs";

interface Habit {
  id: string;
  name: string;
  days: string[]; // local dates (yyyy-mm-dd) marked done
}

const PRESETS = ["Reading", "Exercise", "Learning", "Personal projects", "Water"];

function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return localDateStr(d);
  });
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentStreak(days: string[]): number {
  let streak = 0;
  const cursor = new Date();
  while (days.includes(localDateStr(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function HabitRow({ habit, onToggle, onDelete }: { habit: Habit; onToggle: (date: string) => void; onDelete: () => void }) {
  const week = last7Days();
  const streak = currentStreak(habit.days);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{habit.name}</p>
        {streak > 0 && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-warning">
            <Flame className="h-3 w-3" /> {streak} day streak
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {week.map((date) => {
            const done = habit.days.includes(date);
            const label = new Date(date).toLocaleDateString(undefined, { weekday: "narrow" });
            return (
              <button
                key={date}
                onClick={() => onToggle(date)}
                title={date}
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] transition-colors ${
                  done ? "border-success bg-success text-success-foreground" : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <ConfirmDeleteButton confirmText={`Stop tracking "${habit.name}"?`} onConfirm={onDelete} />
      </div>
    </div>
  );
}

export function HabitsPage() {
  const { items, add, update, remove } = usePrototypeCollection<Habit>("daily.habits");
  const [name, setName] = useState("");

  function addHabit(habitName: string) {
    if (!habitName.trim()) return;
    add({ id: newId(), name: habitName.trim(), days: [] });
    setName("");
  }

  function toggleDay(habit: Habit, date: string) {
    const days = habit.days.includes(date) ? habit.days.filter((d) => d !== date) : [...habit.days, date];
    update(habit.id, { days });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Habits</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={ROUTINE_TABS} />
          <p className="mb-1 text-sm text-muted-foreground">Simple tracking for things you want to do regularly.</p>
          <PrototypeNotice />

          {items.length === 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button key={p} variant="outline" size="sm" onClick={() => addHabit(p)}>
                  <Plus className="h-3.5 w-3.5" /> {p}
                </Button>
              ))}
            </div>
          )}

          <div className="mb-6 flex gap-2">
            <Input placeholder="Add a custom habit…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addHabit(name)} />
            <Button onClick={() => addHabit(name)} disabled={!name.trim()}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>

          {items.length === 0 ? (
            <EmptyState icon={Flame} title="No habits yet" description="Add one above to start tracking." />
          ) : (
            <div>
              {items.map((h) => (
                <HabitRow key={h.id} habit={h} onToggle={(date) => toggleDay(h, date)} onDelete={() => remove(h.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
