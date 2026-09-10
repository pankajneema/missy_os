import { useState } from "react";
import { ListTodo, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { usePrototypeCollection, newId } from "@/lib/prototype-store";
import { SectionTabs, ROUTINE_TABS } from "@/components/shared/SectionTabs";

interface Routine {
  id: string;
  name: string;
  steps: string[];
}

const PRESETS: Routine[] = [
  { id: "preset-morning", name: "Morning", steps: ["Wake up", "Morning briefing", "Exercise", "Reading"] },
  { id: "preset-work", name: "Work", steps: ["Daily planning", "Check important tasks", "End-of-day review"] },
  { id: "preset-evening", name: "Evening", steps: ["Review tasks", "Plan tomorrow"] },
];

function RoutineCard({ routine, onAddStep, onRemoveStep, onDelete }: {
  routine: Routine;
  onAddStep: (step: string) => void;
  onRemoveStep: (index: number) => void;
  onDelete: () => void;
}) {
  const [step, setStep] = useState("");
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{routine.name}</h3>
        <ConfirmDeleteButton confirmText={`Delete "${routine.name}"?`} onConfirm={onDelete} />
      </div>
      <ol className="mb-3 space-y-1.5">
        {routine.steps.map((s, i) => (
          <li key={i} className="group flex items-center justify-between gap-2 text-sm text-foreground">
            <span>
              {i + 1}. {s}
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100" onClick={() => onRemoveStep(i)}>
              <X className="h-3 w-3" />
            </Button>
          </li>
        ))}
        {routine.steps.length === 0 && <p className="text-xs text-muted-foreground">No steps yet.</p>}
      </ol>
      <div className="flex gap-2">
        <Input
          placeholder="Add a step…"
          value={step}
          onChange={(e) => setStep(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && step.trim()) {
              onAddStep(step.trim());
              setStep("");
            }
          }}
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (step.trim()) {
              onAddStep(step.trim());
              setStep("");
            }
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function RoutinesPage() {
  const { items, add, update, remove } = usePrototypeCollection<Routine>("daily.routines");
  const [name, setName] = useState("");

  function addPreset(preset: Routine) {
    add({ ...preset, id: newId() });
  }

  function addCustom() {
    if (!name.trim()) return;
    add({ id: newId(), name: name.trim(), steps: [] });
    setName("");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Routines</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={ROUTINE_TABS} />
          <p className="mb-1 text-sm text-muted-foreground">Recurring routines for different parts of your day.</p>
          <PrototypeNotice />

          {items.length === 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button key={p.id} variant="outline" size="sm" onClick={() => addPreset(p)}>
                  <Plus className="h-3.5 w-3.5" /> {p.name} routine
                </Button>
              ))}
            </div>
          )}

          <div className="mb-6 flex gap-2">
            <Input placeholder="Name a custom routine…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()} />
            <Button onClick={addCustom} disabled={!name.trim()}>
              <Plus className="h-3.5 w-3.5" /> Create
            </Button>
          </div>

          {items.length === 0 ? (
            <EmptyState icon={ListTodo} title="No routines yet" description="Add a preset above or create a custom one." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.map((r) => (
                <RoutineCard
                  key={r.id}
                  routine={r}
                  onAddStep={(step) => update(r.id, { steps: [...r.steps, step] })}
                  onRemoveStep={(i) => update(r.id, { steps: r.steps.filter((_, idx) => idx !== i) })}
                  onDelete={() => remove(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
