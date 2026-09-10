export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "pending" | "in_progress" | "completed";

export interface Task {
  id: string;
  title: string;
  notes?: string;
  date: string; // yyyy-mm-dd - the day it's planned for
  time?: string; // HH:mm
  deadline?: string; // yyyy-mm-dd
  durationMinutes?: number;
  priority: TaskPriority;
  status: TaskStatus;
  planId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ScheduleBlock {
  id: string;
  date: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  label: string;
  taskId?: string;
}

export interface Milestone {
  id: string;
  title: string;
  date?: string;
  done: boolean;
}

export interface PlanActivity {
  id: string;
  dayLabel: string; // "Before Trip", "Day 1", ...
  title: string;
  done: boolean;
}

export type PlanKind = "trip" | "event" | "project" | "other";

export interface Plan {
  id: string;
  title: string;
  kind: PlanKind;
  goal?: string;
  startDate?: string;
  endDate?: string;
  peopleIds: string[];
  notes?: string;
  milestones: Milestone[];
  activities: PlanActivity[];
  goalId?: string;
  createdAt: string;
}

export interface Goal {
  id: string;
  title: string;
  target?: string;
  deadline?: string;
  progress: number; // 0-100, manual
  planIds: string[];
  milestones: Milestone[];
  createdAt: string;
}

export type FollowUpKind = "follow_up" | "commitment";

export interface FollowUp {
  id: string;
  title: string;
  kind: FollowUpKind;
  waitingSince: string;
  followUpDate?: string;
  personId?: string;
  notes?: string;
  resolved: boolean;
  createdAt: string;
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = { low: "Low", medium: "Medium", high: "High" };
export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning-soft text-warning",
  high: "bg-error-soft text-error",
};

/** Formats a Date as yyyy-mm-dd using its LOCAL date components - not
 * toISOString(), which reads UTC and silently lands on the wrong day for
 * any timezone ahead of UTC once local time has passed midnight but UTC
 * hasn't yet (e.g. IST between 00:00 and 05:30). */
function localDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayStr(): string {
  return localDateStr(new Date());
}

export function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDateStr(d);
}

export function addDaysStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

export function formatDateLabel(date: string): string {
  const today = todayStr();
  const tomorrow = tomorrowStr();
  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function startOfWeek(offsetWeeks = 0): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start of week
  d.setDate(d.getDate() + diff + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isInRange(date: string, start: Date, end: Date): boolean {
  const d = new Date(date);
  return d >= start && d <= end;
}
