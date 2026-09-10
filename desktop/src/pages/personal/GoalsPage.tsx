import { useEffect, useState } from "react";
import { Target, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { usePrototypeCollection, newId } from "@/lib/prototype-store";
import type { Goal, Milestone, Plan } from "@/lib/daily-life";

function blankGoal(): Goal {
  return { id: newId(), title: "", progress: 0, planIds: [], milestones: [], createdAt: new Date().toISOString() };
}

function GoalCard({ goal, plans, onEdit, onDelete }: { goal: Goal; plans: Plan[]; onEdit: () => void; onDelete: () => void }) {
  const linkedPlans = plans.filter((p) => goal.planIds.includes(p.id));
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{goal.title}</p>
          {goal.target && <p className="text-xs text-muted-foreground">{goal.target}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <ConfirmDeleteButton confirmText={`Delete goal "${goal.title}"?`} onConfirm={onDelete} />
        </div>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${goal.progress}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{goal.progress}% complete{goal.deadline && ` · due ${goal.deadline}`}</p>

      {linkedPlans.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {linkedPlans.map((p) => (
            <Badge key={p.id} variant="outline">
              {p.title}
            </Badge>
          ))}
        </div>
      )}

      {goal.milestones.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {goal.milestones.filter((m) => m.done).length} / {goal.milestones.length} milestones
        </p>
      )}
    </div>
  );
}

function GoalFormDialog({
  open,
  onOpenChange,
  goal,
  plans,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: Goal | null;
  plans: Plan[];
  onSave: (goal: Goal) => void;
}) {
  const [draft, setDraft] = useState<Goal>(() => goal ?? blankGoal());
  const [milestoneText, setMilestoneText] = useState("");

  useEffect(() => {
    if (open) setDraft(goal ?? blankGoal());
  }, [open, goal]);

  function field<K extends keyof Goal>(key: K, value: Goal[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function togglePlan(id: string) {
    field("planIds", draft.planIds.includes(id) ? draft.planIds.filter((p) => p !== id) : [...draft.planIds, id]);
  }

  function addMilestone() {
    if (!milestoneText.trim()) return;
    const m: Milestone = { id: newId(), title: milestoneText.trim(), done: false };
    field("milestones", [...draft.milestones, m]);
    setMilestoneText("");
  }
  function toggleMilestone(id: string) {
    field("milestones", draft.milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m)));
  }

  function handleSave() {
    if (!draft.title.trim()) return;
    onSave({ ...draft, title: draft.title.trim() });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle>
          <DialogDescription>A longer-term objective, like "Learn AI" or "Get a new job".</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-title">Title</Label>
            <Input id="goal-title" value={draft.title} onChange={(e) => field("title", e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-target">Target</Label>
            <Input id="goal-target" value={draft.target ?? ""} onChange={(e) => field("target", e.target.value)} placeholder="What does success look like?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-deadline">Deadline</Label>
            <Input id="goal-deadline" type="date" value={draft.deadline ?? ""} onChange={(e) => field("deadline", e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Progress: {draft.progress}%</Label>
            <input type="range" min={0} max={100} step={5} value={draft.progress} onChange={(e) => field("progress", Number(e.target.value))} className="w-full accent-primary" />
          </div>

          {plans.length > 0 && (
            <div>
              <Label className="mb-1.5 block">Related plans</Label>
              <div className="flex flex-wrap gap-1.5">
                {plans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlan(p.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      draft.planIds.includes(p.id) ? "border-primary bg-accent-soft text-primary" : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="mb-1.5 block">Milestones</Label>
            <div className="mb-2 space-y-1">
              {draft.milestones.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <button type="button" onClick={() => toggleMilestone(m.id)} className={`flex h-4 w-4 items-center justify-center rounded-full border ${m.done ? "border-success bg-success text-success-foreground" : "border-border"}`}>
                    {m.done && <Check className="h-2.5 w-2.5" />}
                  </button>
                  <span className={m.done ? "text-muted-foreground line-through" : "text-foreground"}>{m.title}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={milestoneText} onChange={(e) => setMilestoneText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMilestone()} placeholder="Add a milestone…" className="h-8 text-sm" />
              <Button type="button" size="sm" variant="outline" onClick={addMilestone}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!draft.title.trim()}>
            {goal ? "Save changes" : "Create goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GoalsPage() {
  const { items, add, update, remove } = usePrototypeCollection<Goal>("daily.goals");
  const { items: plans } = usePrototypeCollection<Plan>("daily.plans");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  function handleSave(goal: Goal) {
    if (items.some((g) => g.id === goal.id)) update(goal.id, goal);
    else add(goal);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Goals</h1>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> New goal
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <p className="mb-1 text-sm text-muted-foreground">Longer-term objectives — link them to plans so Missy understands why a task matters.</p>
          <PrototypeNotice />

          {items.length === 0 ? (
            <EmptyState icon={Target} title="No goals yet" description='Use "New goal" above.' />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.map((g) => (
                <GoalCard key={g.id} goal={g} plans={plans} onEdit={() => { setEditing(g); setFormOpen(true); }} onDelete={() => remove(g.id)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <GoalFormDialog open={formOpen} onOpenChange={setFormOpen} goal={editing} plans={plans} onSave={handleSave} />
    </div>
  );
}
