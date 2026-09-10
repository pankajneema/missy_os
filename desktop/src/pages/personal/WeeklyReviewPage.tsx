import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeCollection } from "@/lib/prototype-store";
import { useTasks } from "@/lib/use-tasks";
import { isInRange, startOfWeek, type FollowUp, type Goal, type Plan } from "@/lib/daily-life";

export function WeeklyReviewPage() {
  const { tasks } = useTasks();
  const { items: plans } = usePrototypeCollection<Plan>("daily.plans");
  const { items: goals } = usePrototypeCollection<Goal>("daily.goals");
  const { items: followUps } = usePrototypeCollection<FollowUp>("daily.followups");
  const [generated, setGenerated] = useState(false);

  const thisWeekStart = startOfWeek(0);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 6);
  const nextWeekStart = new Date(thisWeekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);

  const thisWeekTasks = tasks.filter((t) => isInRange(t.date, thisWeekStart, thisWeekEnd));
  const completedThisWeek = thisWeekTasks.filter((t) => t.status === "completed");
  const unfinishedThisWeek = thisWeekTasks.filter((t) => t.status !== "completed");
  const nextWeekTasks = tasks.filter((t) => isInRange(t.date, nextWeekStart, nextWeekEnd));
  const pendingFollowUps = followUps.filter((f) => !f.resolved);
  const upcomingDeadlines = tasks.filter((t) => t.deadline && isInRange(t.deadline, nextWeekStart, nextWeekEnd));

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Weekly Review</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <p className="mb-1 text-sm text-muted-foreground">A look back at this week, and what's ahead next week.</p>
          <PrototypeNotice>Built from your real local tasks, plans, goals, and follow-ups.</PrototypeNotice>

          <Button onClick={() => setGenerated(true)}>
            <CalendarCheck className="h-3.5 w-3.5" /> Generate this week's review
          </Button>

          {generated && (
            <div className="mt-6 space-y-6">
              <section>
                <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">This Week</h2>
                <p className="text-sm text-foreground">
                  {completedThisWeek.length} completed · {unfinishedThisWeek.length} unfinished out of {thisWeekTasks.length} planned
                </p>
                {plans.length > 0 && (
                  <p className="mt-1 text-sm text-foreground">
                    Plans: {plans.map((p) => `${p.title} (${p.activities.filter((a) => a.done).length + p.milestones.filter((m) => m.done).length}/${p.activities.length + p.milestones.length})`).join(", ")}
                  </p>
                )}
                {goals.length > 0 && (
                  <p className="mt-1 text-sm text-foreground">Goals: {goals.map((g) => `${g.title} (${g.progress}%)`).join(", ")}</p>
                )}
                {unfinishedThisWeek.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm text-foreground">
                    {unfinishedThisWeek.map((t) => (
                      <li key={t.id}>{t.title}</li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Next Week</h2>
                {nextWeekTasks.length === 0 && pendingFollowUps.length === 0 && upcomingDeadlines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing planned yet for next week.</p>
                ) : (
                  <>
                    {nextWeekTasks.length > 0 && <p className="text-sm text-foreground">{nextWeekTasks.length} tasks already planned.</p>}
                    {upcomingDeadlines.length > 0 && (
                      <p className="mt-1 text-sm text-foreground">
                        Deadlines: {upcomingDeadlines.map((t) => t.title).join(", ")}
                      </p>
                    )}
                    {pendingFollowUps.length > 0 && (
                      <p className="mt-1 text-sm text-foreground">
                        Pending follow-ups: {pendingFollowUps.map((f) => f.title).join(", ")}
                      </p>
                    )}
                  </>
                )}
              </section>

              {unfinishedThisWeek.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Consider carrying {unfinishedThisWeek.length} unfinished {unfinishedThisWeek.length === 1 ? "task" : "tasks"} into next week from Tasks.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
