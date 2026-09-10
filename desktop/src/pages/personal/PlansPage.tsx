import { useState } from "react";
import { ArrowLeft, Check, MapPin, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { PlanFormDialog } from "@/components/daily/PlanFormDialog";
import { TaskFormDialog } from "@/components/daily/TaskFormDialog";
import { usePrototypeCollection, newId } from "@/lib/prototype-store";
import { useTasks } from "@/lib/use-tasks";
import { PEOPLE_CATEGORIES, initials, type Person } from "@/lib/people";
import type { Plan, PlanActivity, Milestone } from "@/lib/daily-life";

const TRAVEL_TEMPLATE: { dayLabel: string; items: string[] }[] = [
  { dayLabel: "Before Trip", items: ["Book hotel", "Book travel", "Prepare itinerary", "Packing", "Documents"] },
  { dayLabel: "Day 1", items: ["Travel", "Hotel check-in", "Dinner"] },
  { dayLabel: "Day 2", items: ["Sightseeing", "Beach", "Dinner"] },
];

function planProgress(plan: Plan, taskCount: number, taskDone: number) {
  const total = plan.milestones.length + plan.activities.length + taskCount;
  const done = plan.milestones.filter((m) => m.done).length + plan.activities.filter((a) => a.done).length + taskDone;
  return { total, done };
}

function PlanCard({ plan, progress, onClick }: { plan: Plan; progress: { done: number; total: number }; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-muted">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{plan.title}</p>
        <Badge variant="outline">{plan.kind}</Badge>
      </div>
      {(plan.startDate || plan.endDate) && (
        <p className="text-xs text-muted-foreground">
          {plan.startDate} {plan.endDate && plan.endDate !== plan.startDate ? `– ${plan.endDate}` : ""}
        </p>
      )}
      {progress.total > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {progress.done} / {progress.total} tasks completed
        </p>
      )}
    </button>
  );
}

function PlanDetail({
  plan,
  onBack,
  onUpdate,
  onDelete,
}: {
  plan: Plan;
  onBack: () => void;
  onUpdate: (patch: Partial<Plan>) => void;
  onDelete: () => void;
}) {
  const family = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.family.storageKey);
  const friends = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.friend.storageKey);
  const work = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.work.storageKey);
  const important = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.important.storageKey);
  const allPeople = [...family.items, ...friends.items, ...work.items, ...important.items];

  const { tasks, add: addTask, toggleComplete, remove: removeTask } = useTasks();
  const planTasks = tasks.filter((t) => t.planId === plan.id);
  const [taskFormOpen, setTaskFormOpen] = useState(false);

  const [milestoneText, setMilestoneText] = useState("");
  const [activityDay, setActivityDay] = useState("Day 1");
  const [activityText, setActivityText] = useState("");

  const progress = planProgress(plan, planTasks.length, planTasks.filter((t) => t.status === "completed").length);
  const dayGroups = [...new Set(plan.activities.map((a) => a.dayLabel))];

  function addMilestone() {
    if (!milestoneText.trim()) return;
    const m: Milestone = { id: newId(), title: milestoneText.trim(), done: false };
    onUpdate({ milestones: [...plan.milestones, m] });
    setMilestoneText("");
  }
  function toggleMilestone(id: string) {
    onUpdate({ milestones: plan.milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m)) });
  }
  function removeMilestone(id: string) {
    onUpdate({ milestones: plan.milestones.filter((m) => m.id !== id) });
  }

  function addActivity() {
    if (!activityText.trim()) return;
    const a: PlanActivity = { id: newId(), dayLabel: activityDay.trim() || "Day 1", title: activityText.trim(), done: false };
    onUpdate({ activities: [...plan.activities, a] });
    setActivityText("");
  }
  function toggleActivity(id: string) {
    onUpdate({ activities: plan.activities.map((a) => (a.id === id ? { ...a, done: !a.done } : a)) });
  }
  function removeActivity(id: string) {
    onUpdate({ activities: plan.activities.filter((a) => a.id !== id) });
  }

  function applyTravelTemplate() {
    const activities: PlanActivity[] = TRAVEL_TEMPLATE.flatMap((group) =>
      group.items.map((title) => ({ id: newId(), dayLabel: group.dayLabel, title, done: false })),
    );
    onUpdate({ activities });
  }

  function togglePerson(id: string) {
    const has = plan.peopleIds.includes(id);
    onUpdate({ peopleIds: has ? plan.peopleIds.filter((p) => p !== id) : [...plan.peopleIds, id] });
  }

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> All plans
      </button>

      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-foreground">{plan.title}</h2>
          {plan.goal && <p className="text-sm text-muted-foreground">{plan.goal}</p>}
          {(plan.startDate || plan.endDate) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {plan.startDate} {plan.endDate && plan.endDate !== plan.startDate ? `– ${plan.endDate}` : ""}
            </p>
          )}
        </div>
        <ConfirmDeleteButton confirmText={`Delete "${plan.title}"?`} onConfirm={onDelete} />
      </div>

      {progress.total > 0 && (
        <p className="mb-5 text-sm text-foreground">
          <span className="font-medium">{progress.done} / {progress.total}</span> tasks completed
        </p>
      )}

      {plan.notes && <p className="mb-5 text-sm text-foreground/80">{plan.notes}</p>}

      <section className="mb-6">
        <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">People involved</h3>
        <div className="flex flex-wrap gap-1.5">
          {allPeople.length === 0 && <p className="text-xs text-muted-foreground">No one added yet in About You.</p>}
          {allPeople.map((p) => (
            <button
              key={p.id}
              onClick={() => togglePerson(p.id)}
              className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors ${
                plan.peopleIds.includes(p.id) ? "border-primary bg-accent-soft text-primary" : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <Avatar size="sm">
                <AvatarImage src={p.photo} />
                <AvatarFallback>{initials(p.name)}</AvatarFallback>
              </Avatar>
              {p.name}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Milestones</h3>
        <div className="mb-2 space-y-1">
          {plan.milestones.map((m) => (
            <div key={m.id} className="group flex items-center gap-2 text-sm">
              <button onClick={() => toggleMilestone(m.id)} className={`flex h-4 w-4 items-center justify-center rounded-full border ${m.done ? "border-success bg-success text-success-foreground" : "border-border"}`}>
                {m.done && <Check className="h-2.5 w-2.5" />}
              </button>
              <span className={m.done ? "text-muted-foreground line-through" : "text-foreground"}>{m.title}</span>
              <button onClick={() => removeMilestone(m.id)} className="ml-auto opacity-0 group-hover:opacity-100">
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={milestoneText} onChange={(e) => setMilestoneText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMilestone()} placeholder="Add a milestone…" className="h-8 text-sm" />
          <Button size="sm" variant="outline" onClick={addMilestone}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Activities / itinerary</h3>
          {plan.kind === "trip" && plan.activities.length === 0 && (
            <Button size="sm" variant="outline" onClick={applyTravelTemplate}>
              <MapPin className="h-3.5 w-3.5" /> Use trip template
            </Button>
          )}
        </div>
        {dayGroups.map((day) => (
          <div key={day} className="mb-3">
            <p className="mb-1 text-xs font-medium text-foreground">{day}</p>
            <div className="space-y-1">
              {plan.activities.filter((a) => a.dayLabel === day).map((a) => (
                <div key={a.id} className="group flex items-center gap-2 text-sm">
                  <button onClick={() => toggleActivity(a.id)} className={`flex h-4 w-4 items-center justify-center rounded-full border ${a.done ? "border-success bg-success text-success-foreground" : "border-border"}`}>
                    {a.done && <Check className="h-2.5 w-2.5" />}
                  </button>
                  <span className={a.done ? "text-muted-foreground line-through" : "text-foreground"}>{a.title}</span>
                  <button onClick={() => removeActivity(a.id)} className="ml-auto opacity-0 group-hover:opacity-100">
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Input value={activityDay} onChange={(e) => setActivityDay(e.target.value)} placeholder="Day label" className="h-8 w-28 text-sm" />
          <Input value={activityText} onChange={(e) => setActivityText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addActivity()} placeholder="Add an activity…" className="h-8 flex-1 text-sm" />
          <Button size="sm" variant="outline" onClick={addActivity}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tasks</h3>
          <Button size="sm" variant="outline" onClick={() => setTaskFormOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add task
          </Button>
        </div>
        {planTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tasks linked to this plan yet.</p>
        ) : (
          <div className="space-y-1">
            {planTasks.map((t) => (
              <div key={t.id} className="group flex items-center gap-2 text-sm">
                <button onClick={() => toggleComplete(t)} className={`flex h-4 w-4 items-center justify-center rounded-full border ${t.status === "completed" ? "border-success bg-success text-success-foreground" : "border-border"}`}>
                  {t.status === "completed" && <Check className="h-2.5 w-2.5" />}
                </button>
                <span className={t.status === "completed" ? "text-muted-foreground line-through" : "text-foreground"}>{t.title}</span>
                <button onClick={() => removeTask(t.id)} className="ml-auto opacity-0 group-hover:opacity-100">
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <TaskFormDialog open={taskFormOpen} onOpenChange={setTaskFormOpen} task={null} planId={plan.id} onSave={(t) => addTask(t)} />
    </div>
  );
}

export function PlansPage() {
  const { items, add, update, remove } = usePrototypeCollection<Plan>("daily.plans");
  const { tasks } = useTasks();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  const selected = items.find((p) => p.id === selectedId) ?? null;

  function handleSave(plan: Plan) {
    if (items.some((p) => p.id === plan.id)) update(plan.id, plan);
    else {
      add(plan);
      setSelectedId(plan.id);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Plans</h1>
        {!selected && (
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> New plan
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          {selected ? (
            <PlanDetail
              plan={selected}
              onBack={() => setSelectedId(null)}
              onUpdate={(patch) => update(selected.id, patch)}
              onDelete={() => {
                remove(selected.id);
                setSelectedId(null);
              }}
            />
          ) : (
            <>
              <p className="mb-1 text-sm text-muted-foreground">
                Bigger than a single task — trips, events, projects. Say "I'm planning a 4-day Goa trip" in Chat and
                Missy can point you here to organize it, or use the trip template below.
              </p>
              <PrototypeNotice />
              {items.length === 0 ? (
                <EmptyState icon={Sparkles} title="No plans yet" description='Use "New plan" above to get started.' />
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map((p) => {
                    const planTasks = tasks.filter((t) => t.planId === p.id);
                    const progress = planProgress(p, planTasks.length, planTasks.filter((t) => t.status === "completed").length);
                    return <PlanCard key={p.id} plan={p} progress={progress} onClick={() => setSelectedId(p.id)} />;
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <PlanFormDialog open={formOpen} onOpenChange={setFormOpen} plan={editing} onSave={handleSave} />
    </div>
  );
}
