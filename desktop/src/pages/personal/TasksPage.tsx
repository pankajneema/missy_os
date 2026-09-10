import { useState } from "react";
import { ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { TaskRow } from "@/components/daily/TaskRow";
import { TaskFormDialog } from "@/components/daily/TaskFormDialog";
import { useTasks } from "@/lib/use-tasks";
import { ImportPanel, ImportButton } from "@/components/shared/ImportPanel";
import { newId } from "@/lib/prototype-store";
import { todayStr, tomorrowStr, type Task } from "@/lib/daily-life";

function TaskList({
  tasks,
  onToggle,
  onEdit,
  onDelete,
  emptyLabel,
  showDate,
}: {
  tasks: Task[];
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  emptyLabel: string;
  showDate?: boolean;
}) {
  if (tasks.length === 0) return <EmptyState icon={ListChecks} title="Nothing here" description={emptyLabel} />;
  return (
    <div>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} showDate={showDate} onToggleComplete={() => onToggle(t)} onEdit={() => onEdit(t)} onDelete={() => onDelete(t.id)} />
      ))}
    </div>
  );
}

export function TasksPage() {
  const { tasks, add, update, remove, toggleComplete, overdue } = useTasks();
  const [tab, setTab] = useState("today");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const today = todayStr();
  const tomorrow = tomorrowStr();

  const todayTasks = tasks.filter((t) => t.date === today);
  const tomorrowTasks = tasks.filter((t) => t.date === tomorrow);
  const upcomingTasks = tasks
    .filter((t) => t.date > tomorrow)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const [pendingDate, setPendingDate] = useState(today);
  const [importOpen, setImportOpen] = useState(false);

  function openAdd(defaultDate?: string) {
    setEditing(null);
    setFormOpen(true);
    setPendingDate(defaultDate ?? today);
  }

  function openEdit(t: Task) {
    setEditing(t);
    setFormOpen(true);
  }

  function handleSave(task: Task) {
    if (tasks.some((t) => t.id === task.id)) update(task.id, task);
    else add(task);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Tasks</h1>
        <div className="flex items-center gap-2">
          <ImportButton onClick={() => setImportOpen(true)} />
          <Button size="sm" onClick={() => openAdd(tab === "tomorrow" ? tomorrow : today)}>
            <Plus className="h-3.5 w-3.5" /> Add task
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <p className="mb-1 text-sm text-muted-foreground">Plan what needs doing today, tomorrow, and beyond.</p>
          <ImportPanel
            label="tasks"
            open={importOpen}
            onClose={() => setImportOpen(false)}
            placeholder={"Finish the report\nReview the PR\nCall the client"}
            onImport={(lines) =>
              lines.forEach((title) =>
                add({
                  id: newId(),
                  title,
                  date: tab === "tomorrow" ? tomorrow : today,
                  priority: "medium",
                  status: "pending",
                  createdAt: new Date().toISOString(),
                }),
              )
            }
          />
          <PrototypeNotice>
            Saved on this device only. Tell Missy things like "Tomorrow I need to finish the report" in Chat and
            she'll remember it — but adding it here as an actual task is still manual for now.
          </PrototypeNotice>

          {overdue.length > 0 && (
            <div className="mb-6 rounded-lg border border-warning-soft bg-warning-soft/60 p-3">
              <p className="mb-1 text-xs font-medium text-warning">Carried forward from earlier — still pending</p>
              <TaskList tasks={overdue} onToggle={toggleComplete} onEdit={openEdit} onDelete={remove} emptyLabel="" showDate />
            </div>
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="tomorrow">Tomorrow</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            </TabsList>
            <TabsContent value="today" className="mt-4">
              <TaskList tasks={todayTasks} onToggle={toggleComplete} onEdit={openEdit} onDelete={remove} emptyLabel='Nothing planned for today yet — use "Add task" above.' />
            </TabsContent>
            <TabsContent value="tomorrow" className="mt-4">
              <TaskList tasks={tomorrowTasks} onToggle={toggleComplete} onEdit={openEdit} onDelete={remove} emptyLabel="Nothing planned for tomorrow yet." />
            </TabsContent>
            <TabsContent value="upcoming" className="mt-4">
              <TaskList tasks={upcomingTasks} onToggle={toggleComplete} onEdit={openEdit} onDelete={remove} emptyLabel="No future tasks yet." showDate />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <TaskFormDialog open={formOpen} onOpenChange={setFormOpen} task={editing} defaultDate={pendingDate} onSave={handleSave} />
    </div>
  );
}
