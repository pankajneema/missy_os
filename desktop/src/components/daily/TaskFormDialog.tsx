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
import { newId } from "@/lib/prototype-store";
import { todayStr, tomorrowStr, type Task, type TaskPriority } from "@/lib/daily-life";

function blankTask(date: string): Task {
  return { id: newId(), title: "", date, priority: "medium", status: "pending", createdAt: new Date().toISOString() };
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  defaultDate,
  planId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  defaultDate?: string;
  planId?: string;
  onSave: (task: Task) => void;
}) {
  const [draft, setDraft] = useState<Task>(() => task ?? blankTask(defaultDate ?? todayStr()));

  useEffect(() => {
    if (open) setDraft(task ?? { ...blankTask(defaultDate ?? todayStr()), planId });
  }, [open, task, defaultDate, planId]);

  function field<K extends keyof Task>(key: K, value: Task[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
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
          <DialogTitle>{task ? "Edit task" : "Add a task"}</DialogTitle>
          <DialogDescription>Only the title and date are required.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={draft.title}
              onChange={(e) => field("title", e.target.value)}
              autoFocus
              placeholder="e.g. Finish the report"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant={draft.date === todayStr() ? "default" : "outline"} size="sm" onClick={() => field("date", todayStr())}>
              Today
            </Button>
            <Button type="button" variant={draft.date === tomorrowStr() ? "default" : "outline"} size="sm" onClick={() => field("date", tomorrowStr())}>
              Tomorrow
            </Button>
            <Input type="date" className="h-7 w-40" value={draft.date} onChange={(e) => field("date", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-time">Time (optional)</Label>
              <Input id="task-time" type="time" value={draft.time ?? ""} onChange={(e) => field("time", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-duration">Duration (minutes)</Label>
              <Input
                id="task-duration"
                type="number"
                min={5}
                step={5}
                value={draft.durationMinutes ?? ""}
                onChange={(e) => field("durationMinutes", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-deadline">Deadline (optional)</Label>
              <Input id="task-deadline" type="date" value={draft.deadline ?? ""} onChange={(e) => field("deadline", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={draft.priority} onValueChange={(v) => field("priority", v as TaskPriority)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea id="task-notes" rows={2} value={draft.notes ?? ""} onChange={(e) => field("notes", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!draft.title.trim()}>
            {task ? "Save changes" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
