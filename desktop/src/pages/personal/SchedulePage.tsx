import { useState } from "react";
import { Sparkles, Plus, X, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeCollection, newId } from "@/lib/prototype-store";
import { useTasks } from "@/lib/use-tasks";
import { todayStr, type ScheduleBlock } from "@/lib/daily-life";

const DAY_END_HOUR = 18; // 6 PM - the greedy packer won't schedule past this

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function AddBlockForm({ onAdd }: { onAdd: (block: Omit<ScheduleBlock, "id" | "date">) => void }) {
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");

  function handleAdd() {
    if (!label.trim() || start >= end) return;
    onAdd({ label: label.trim(), startTime: start, endTime: end });
    setLabel("");
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3">
      <div className="min-w-[160px] flex-1 space-y-1">
        <Label className="text-xs">Label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Report writing" className="h-8" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Start</Label>
        <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 w-28" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">End</Label>
        <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8 w-28" />
      </div>
      <Button size="sm" onClick={handleAdd} disabled={!label.trim()}>
        <Plus className="h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}

export function SchedulePage() {
  const { items, add, remove, setItems } = usePrototypeCollection<ScheduleBlock>("daily.schedule");
  const { tasks, update: updateTask } = useTasks();
  const [suggestion, setSuggestion] = useState<ScheduleBlock[] | null>(null);

  const today = todayStr();
  const todaysBlocks = items.filter((b) => b.date === today).sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
  const unscheduledTasks = tasks.filter((t) => t.date === today && t.status !== "completed" && !todaysBlocks.some((b) => b.taskId === t.id));

  function suggestSchedule() {
    const now = new Date();
    const startMinutes = Math.max(timeToMinutes(`${now.getHours()}:${now.getMinutes()}`), 8 * 60);
    const endMinutes = DAY_END_HOUR * 60;

    const busy = todaysBlocks.map((b) => [timeToMinutes(b.startTime), timeToMinutes(b.endTime)] as const);
    const sorted = [...unscheduledTasks].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
      return (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
    });

    let cursor = startMinutes;
    const proposed: ScheduleBlock[] = [];
    for (const task of sorted) {
      const duration = task.durationMinutes ?? 60;
      // skip past any existing busy block that overlaps the cursor
      for (const [busyStart, busyEnd] of busy) {
        if (cursor < busyEnd && cursor + duration > busyStart) cursor = busyEnd;
      }
      if (cursor + duration > endMinutes) continue;
      proposed.push({
        id: newId(),
        date: today,
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(cursor + duration),
        label: task.title,
        taskId: task.id,
      });
      cursor += duration;
    }
    setSuggestion(proposed);
  }

  function acceptSuggestion() {
    if (!suggestion) return;
    setItems((prev) => [...prev, ...suggestion]);
    for (const block of suggestion) {
      if (block.taskId) updateTask(block.taskId, { status: "in_progress" });
    }
    setSuggestion(null);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Schedule</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <p className="mb-1 text-sm text-muted-foreground">Today's time-blocked plan.</p>
          <PrototypeNotice>
            Saved on this device. "Suggest a schedule" packs your unscheduled tasks into free time using priority and
            deadline — a simple local rule, not an AI call.
          </PrototypeNotice>

          {unscheduledTasks.length > 0 && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-accent-soft bg-accent-soft/60 p-3">
              <p className="text-sm text-foreground">
                {unscheduledTasks.length} unscheduled {unscheduledTasks.length === 1 ? "task" : "tasks"} today.
              </p>
              <Button size="sm" onClick={suggestSchedule}>
                <Sparkles className="h-3.5 w-3.5" /> Suggest a schedule
              </Button>
            </div>
          )}

          {suggestion && (
            <div className="mb-4 rounded-lg border border-border bg-surface p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Suggested — nothing saved yet</p>
              {suggestion.length === 0 ? (
                <p className="text-sm text-muted-foreground">No free time left before {DAY_END_HOUR}:00 today.</p>
              ) : (
                <div className="mb-3 space-y-1">
                  {suggestion.map((b) => (
                    <p key={b.id} className="text-sm text-foreground">
                      {b.startTime}–{b.endTime} {b.label}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                {suggestion.length > 0 && (
                  <Button size="sm" onClick={acceptSuggestion}>
                    Accept
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setSuggestion(null)}>
                  Discard
                </Button>
              </div>
            </div>
          )}

          <AddBlockForm onAdd={(b) => add({ ...b, id: newId(), date: today })} />

          <div className="mt-6">
            {todaysBlocks.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Nothing scheduled yet" description="Add a block above, or suggest a schedule from your tasks." />
            ) : (
              <div>
                {todaysBlocks.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-b-0">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{b.startTime}–{b.endTime}</span> · {b.label}
                    </p>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(b.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
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
