import { Check, Circle, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PRIORITY_LABELS, PRIORITY_STYLES, formatDateLabel, type Task } from "@/lib/daily-life";

export function TaskRow({
  task,
  onToggleComplete,
  onEdit,
  onDelete,
  showDate,
}: {
  task: Task;
  onToggleComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  showDate?: boolean;
}) {
  const done = task.status === "completed";
  return (
    <div className="group flex items-start gap-3 border-b border-border/60 py-3 last:border-b-0">
      <button
        onClick={onToggleComplete}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          done ? "border-success bg-success text-success-foreground" : "border-border text-transparent hover:border-primary"
        }`}
      >
        {done ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2 opacity-0" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-sm ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showDate && <span>{formatDateLabel(task.date)}</span>}
          {task.time && <span>{task.time}</span>}
          {task.durationMinutes && <span>{task.durationMinutes}m</span>}
          {task.deadline && <span>Due {formatDateLabel(task.deadline)}</span>}
          <Badge className={PRIORITY_STYLES[task.priority]} variant="outline">
            {PRIORITY_LABELS[task.priority]}
          </Badge>
          {task.status === "in_progress" && <Badge variant="outline">In progress</Badge>}
        </div>
        {task.notes && <p className="mt-1 text-xs text-foreground/70">{task.notes}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
