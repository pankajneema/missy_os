import { CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePrototypeCollection } from "@/lib/prototype-store";
import { useTasks } from "@/lib/use-tasks";
import { addDaysStr, todayStr, tomorrowStr, type FollowUp, type Plan } from "@/lib/daily-life";

interface ImportantDateRecord {
  id: string;
  title: string;
  date: string;
}

interface UpcomingItem {
  id: string;
  title: string;
  date: string;
  category: string;
}

function bucketFor(date: string): string {
  const today = todayStr();
  const tomorrow = tomorrowStr();
  const weekEnd = addDaysStr(7);
  const nextWeekEnd = addDaysStr(14);
  if (date < today) return "Overdue";
  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";
  if (date <= weekEnd) return "This Week";
  if (date <= nextWeekEnd) return "Next Week";
  return "Later";
}

const BUCKET_ORDER = ["Overdue", "Today", "Tomorrow", "This Week", "Next Week", "Later"];

export function UpcomingPage() {
  const { tasks } = useTasks();
  const { items: plans } = usePrototypeCollection<Plan>("daily.plans");
  const { items: followUps } = usePrototypeCollection<FollowUp>("daily.followups");
  const { items: importantDates } = usePrototypeCollection<ImportantDateRecord>("important-dates");

  const items: UpcomingItem[] = [
    ...tasks.filter((t) => t.status !== "completed").map((t) => ({ id: `task-${t.id}`, title: t.title, date: t.date, category: "Task" })),
    ...tasks.filter((t) => t.deadline).map((t) => ({ id: `deadline-${t.id}`, title: `${t.title} (deadline)`, date: t.deadline!, category: "Deadline" })),
    ...plans.flatMap((p) => [
      ...(p.startDate ? [{ id: `plan-${p.id}`, title: p.title, date: p.startDate, category: "Plan" }] : []),
      ...p.milestones.filter((m) => !m.done && m.date).map((m) => ({ id: `milestone-${m.id}`, title: `${p.title}: ${m.title}`, date: m.date!, category: "Milestone" })),
    ]),
    ...followUps.filter((f) => !f.resolved && f.followUpDate).map((f) => ({ id: `followup-${f.id}`, title: f.title, date: f.followUpDate!, category: "Follow-up" })),
    ...importantDates.map((d) => ({ id: `date-${d.id}`, title: d.title, date: d.date, category: "Date" })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  const grouped = BUCKET_ORDER.map((bucket) => ({ bucket, items: items.filter((i) => bucketFor(i.date) === bucket) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Upcoming</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <p className="mb-5 text-sm text-muted-foreground">
            Everything ahead of you — tasks, deadlines, plans, follow-ups, and important dates, in one feed.
          </p>

          {grouped.length === 0 ? (
            <EmptyState icon={CalendarRange} title="Nothing coming up" description="Add tasks, plans, or follow-ups to see them here." />
          ) : (
            grouped.map((g) => (
              <div key={g.bucket} className="mb-6">
                <p className={`mb-2 text-[11px] font-medium uppercase tracking-wide ${g.bucket === "Overdue" ? "text-warning" : "text-muted-foreground"}`}>
                  {g.bucket}
                </p>
                <div>
                  {g.items.map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-b-0">
                      <p className="text-sm text-foreground">{i.title}</p>
                      <Badge variant="outline" className="shrink-0">
                        {i.category}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
