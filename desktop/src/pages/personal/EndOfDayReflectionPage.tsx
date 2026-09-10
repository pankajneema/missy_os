import { useState } from "react";
import { Moon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeValue, usePrototypeCollection, newId } from "@/lib/prototype-store";
import { useTasks } from "@/lib/use-tasks";
import { todayStr } from "@/lib/daily-life";

interface Reflection {
  id: string;
  date: string;
  note: string;
}

interface Settings {
  time: string;
  enabled: boolean;
}

export function EndOfDayReflectionPage() {
  const [settings, setSettings] = usePrototypeValue<Settings>("daily.eod-settings", { time: "21:00", enabled: true });
  const { items: reflections, add, update } = usePrototypeCollection<Reflection>("daily.reflections");
  const { tasks } = useTasks();
  const [generated, setGenerated] = useState(false);
  const [note, setNote] = useState("");

  const today = todayStr();
  const todaysReflection = reflections.find((r) => r.date === today);
  const todayTasks = tasks.filter((t) => t.date === today);
  const completed = todayTasks.filter((t) => t.status === "completed");
  const notCompleted = todayTasks.filter((t) => t.status !== "completed");
  const carried = tasks.filter((t) => t.status !== "completed" && t.date < today);

  const plannedMinutes = todayTasks.reduce((sum, t) => sum + (t.durationMinutes ?? 0), 0);
  const actualMinutes = completed.reduce((sum, t) => sum + (t.durationMinutes ?? 0), 0);

  function generate() {
    setGenerated(true);
    setNote(todaysReflection?.note ?? "");
  }

  function saveNote() {
    if (todaysReflection) update(todaysReflection.id, { note });
    else add({ id: newId(), date: today, note });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">End-of-Day Reflection</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <p className="mb-1 text-sm text-muted-foreground">A short summary of your day, and what actually happened versus what you planned.</p>
          <PrototypeNotice>
            Built from your real local task data — completion counts and durations are real, but there's no
            automatic trigger at your chosen time since that needs a background scheduler.
          </PrototypeNotice>

          <div className="mb-6 flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Enable reflection prompt</p>
              <p className="text-xs text-muted-foreground">Reminds you to reflect at your chosen time.</p>
            </div>
            <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings((prev) => ({ ...prev, enabled: v }))} />
          </div>

          <div className="mb-6 space-y-1.5">
            <Label htmlFor="eod-time">Time</Label>
            <Input id="eod-time" type="time" className="w-40" value={settings.time} onChange={(e) => setSettings((prev) => ({ ...prev, time: e.target.value }))} />
          </div>

          <Button onClick={generate}>
            <Moon className="h-3.5 w-3.5" /> Generate today's reflection
          </Button>

          {generated && (
            <div className="mt-6 space-y-5">
              <section>
                <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Day Summary</h2>
                <p className="text-sm text-foreground">
                  {todayTasks.length} planned · {completed.length} completed · {notCompleted.length} not completed
                  {carried.length > 0 && ` · ${carried.length} carried forward from before`}
                </p>
                {completed.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-muted-foreground">Completed</p>
                    <ul className="mt-1 list-inside list-disc text-sm text-foreground">
                      {completed.map((t) => (
                        <li key={t.id}>{t.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {notCompleted.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-muted-foreground">Not completed</p>
                    <ul className="mt-1 list-inside list-disc text-sm text-foreground">
                      {notCompleted.map((t) => (
                        <li key={t.id}>{t.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {plannedMinutes > 0 && (
                <section>
                  <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Planned vs Actual</h2>
                  <p className="text-sm text-foreground">
                    Planned: {Math.round(plannedMinutes / 60 * 10) / 10}h of tasks · Actual: {Math.round(actualMinutes / 60 * 10) / 10}h completed
                  </p>
                </section>
              )}

              <section>
                <Label htmlFor="eod-note" className="mb-1.5 block">
                  Anything you want to add about today?
                </Label>
                <Textarea id="eod-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                <Button size="sm" className="mt-2" onClick={saveNote}>
                  Save
                </Button>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
