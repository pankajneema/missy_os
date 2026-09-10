import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarHeart,
  Check,
  Clock,
  Flame,
  ListChecks,
  ListTodo,
  Plus,
  Sparkles,
  UserPlus,
  FileUp,
  ShieldAlert,
  Milestone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import * as api from "@/lib/api";
import type { ScheduledTask } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { usePrototypeCollection } from "@/lib/prototype-store";
import { useTasks } from "@/lib/use-tasks";
import { PRIORITY_STYLES, PRIORITY_LABELS, todayStr, type FollowUp, type ScheduleBlock } from "@/lib/daily-life";
import { PEOPLE_CATEGORIES, type Person } from "@/lib/people";

function dayOfYearDistance(dateStr: string): number {
  const now = new Date();
  const d = new Date(dateStr);
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1);
  return Math.round((next.getTime() - now.getTime()) / 86400000);
}

function SectionCard({ icon: Icon, title, to, children }: { icon: React.ComponentType<{ className?: string }>; title: string; to: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <Link to={to} className="mb-3 flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary">
        <Icon className="h-4 w-4" /> {title}
      </Link>
      {children}
    </div>
  );
}

export function TodayPage() {
  const { token, assistantName } = useAuthStore();
  const [reminders, setReminders] = useState<ScheduledTask[] | null>(null);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const family = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.family.storageKey);
  const friends = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.friend.storageKey);
  const work = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.work.storageKey);
  const important = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.important.storageKey);
  const { items: manualDates } = usePrototypeCollection<{ id: string; title: string; date: string }>("important-dates");
  const { items: routines } = usePrototypeCollection<{ id: string; name: string; steps: string[] }>("daily.routines");
  const { items: habits } = usePrototypeCollection<{ id: string; name: string; days: string[] }>("daily.habits");
  const { tasks, toggleComplete, overdue } = useTasks();
  const { items: blocks } = usePrototypeCollection<ScheduleBlock>("daily.schedule");
  const { items: followUps } = usePrototypeCollection<FollowUp>("daily.followups");

  useEffect(() => {
    (async () => {
      if (!token) return;
      const [t, m] = await Promise.all([api.listScheduledTasks(token), api.listMemories(token)]);
      setReminders(t);
      setMemoryCount(m.length);
    })();
  }, [token]);

  const today = todayStr();

  const allPeople = [...family.items, ...friends.items, ...work.items, ...important.items];
  const birthdays = allPeople
    .filter((p) => p.birthday)
    .map((p) => ({ title: `${p.name}'s birthday`, days: dayOfYearDistance(p.birthday!) }));
  const upcomingDates = [...birthdays, ...manualDates.map((d) => ({ title: d.title, days: dayOfYearDistance(d.date) }))]
    .filter((d) => d.days <= 30)
    .sort((a, b) => a.days - b.days)
    .slice(0, 4);

  const habitsToday = habits.map((h) => ({ ...h, done: h.days.includes(today) }));

  const todayTasks = tasks.filter((t) => t.date === today);
  const pendingToday = todayTasks
    .filter((t) => t.status !== "completed")
    .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));
  const completedToday = todayTasks.filter((t) => t.status === "completed");
  const todaysBlocks = blocks.filter((b) => b.date === today).sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
  const activeReminders = (reminders ?? []).filter((r) => r.enabled);
  const followUpsToday = followUps.filter((f) => !f.resolved && f.followUpDate === today);
  const mostImportant = pendingToday[0];

  const profileCompleteness = Math.round(
    (allPeople.length > 0 ? 1 : 0) * 25 +
      ((memoryCount ?? 0) > 0 ? 1 : 0) * 25 +
      (routines.length > 0 ? 1 : 0) * 25 +
      (todayTasks.length > 0 ? 1 : 0) * 25,
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Today</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-4xl">
          <p className="mb-5 text-sm text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} — everything
            {assistantName ? ` ${assistantName} knows about your day` : " about your day"}, in one place.
          </p>

          {mostImportant && (
            <div className="mb-4 rounded-lg border border-primary/30 bg-accent-soft/60 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Most important right now</p>
              <p className="mt-0.5 text-sm font-medium text-foreground">{mostImportant.title}</p>
            </div>
          )}

          {overdue.length > 0 && (
            <div className="mb-5 flex items-start gap-2 rounded-lg border border-warning-soft bg-warning-soft/60 p-3">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <p className="text-sm text-warning">
                {overdue.length} task{overdue.length === 1 ? "" : "s"} carried forward from earlier —{" "}
                <Link to="/daily/tasks" className="underline">
                  view in Tasks
                </Link>
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SectionCard icon={ListChecks} title={`Today's tasks (${completedToday.length}/${todayTasks.length})`} to="/daily/tasks">
              {pendingToday.length === 0 && completedToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing planned — add a task.</p>
              ) : (
                <div className="space-y-1.5">
                  {pendingToday.map((t) => (
                    <button key={t.id} onClick={() => toggleComplete(t)} className="flex w-full items-center gap-2 text-left text-sm text-foreground hover:text-primary">
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <Badge className={PRIORITY_STYLES[t.priority]} variant="outline">
                        {PRIORITY_LABELS[t.priority]}
                      </Badge>
                    </button>
                  ))}
                  {completedToday.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                      <span className="min-w-0 flex-1 truncate line-through">{t.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard icon={Clock} title="Today's schedule" to="/daily/schedule">
              {todaysBlocks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing time-blocked yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {todaysBlocks.map((b) => (
                    <p key={b.id} className="text-sm text-foreground">
                      <span className="font-medium">{b.startTime}–{b.endTime}</span> {b.label}
                    </p>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard icon={Clock} title="Jobs & reminders" to="/work/jobs">
              {activeReminders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active reminders.</p>
              ) : (
                <ul className="space-y-1.5">
                  {activeReminders.slice(0, 4).map((r) => (
                    <li key={r.id} className="truncate text-sm text-foreground">
                      {r.prompt}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard icon={ListTodo} title="Follow-ups due today" to="/daily/follow-ups">
              {followUpsToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">None due today.</p>
              ) : (
                <div className="space-y-1.5">
                  {followUpsToday.map((f) => (
                    <p key={f.id} className="text-sm text-foreground">{f.title}</p>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard icon={CalendarHeart} title="Upcoming dates" to="/about/important-dates">
              {upcomingDates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing in the next 30 days.</p>
              ) : (
                <ul className="space-y-1.5">
                  {upcomingDates.map((d, i) => (
                    <li key={i} className="flex items-center justify-between text-sm text-foreground">
                      <span className="truncate">{d.title}</span>
                      <Badge variant="outline" className="shrink-0">{d.days === 0 ? "Today" : `${d.days}d`}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard icon={Flame} title="Habits" to="/daily/habits">
              {habitsToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">No habits tracked.</p>
              ) : (
                <ul className="space-y-1.5">
                  {habitsToday.map((h) => (
                    <li key={h.id} className="flex items-center justify-between text-sm text-foreground">
                      {h.name}
                      <Badge variant={h.done ? "default" : "outline"}>{h.done ? "Done" : "Not yet"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <div className="mt-6 rounded-lg border border-border bg-surface p-4">
            <p className="mb-3 text-sm font-medium text-foreground">Assistant snapshot</p>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Profile completeness</p>
                <p className="font-medium text-foreground">{profileCompleteness}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">People saved</p>
                <p className="font-medium text-foreground">{allPeople.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Memories</p>
                <p className="font-medium text-foreground">{memoryCount ?? "…"}</p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-foreground">Quick actions</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/daily/tasks"><Plus className="h-3.5 w-3.5" /> Add Task</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/about/family"><UserPlus className="h-3.5 w-3.5" /> Add Person</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/memory/memories"><Plus className="h-3.5 w-3.5" /> Add Memory</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/work/jobs"><Clock className="h-3.5 w-3.5" /> Add Job</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/assistant/rules"><ShieldAlert className="h-3.5 w-3.5" /> Add Rule</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/about/profile"><FileUp className="h-3.5 w-3.5" /> Upload Document</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/about/life"><Milestone className="h-3.5 w-3.5" /> Add Life Event</Link>
              </Button>
              <Button size="sm" onClick={() => window.dispatchEvent(new Event("missy:teach-assistant"))}>
                <Sparkles className="h-3.5 w-3.5" /> Teach Assistant
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
