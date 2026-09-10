import { usePrototypeCollection } from "@/lib/prototype-store";
import { todayStr, type Task } from "@/lib/daily-life";

const TASKS_KEY = "daily.tasks";

export function useTasks() {
  const { items, add, update, remove } = usePrototypeCollection<Task>(TASKS_KEY);

  function toggleComplete(task: Task) {
    update(task.id, {
      status: task.status === "completed" ? "pending" : "completed",
      completedAt: task.status === "completed" ? undefined : new Date().toISOString(),
    });
  }

  const today = todayStr();
  const overdue = items.filter((t) => t.status !== "completed" && t.date < today);

  return { tasks: items, add, update, remove, toggleComplete, overdue };
}
