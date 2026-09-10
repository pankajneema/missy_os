import { formatDateLabel, todayStr, tomorrowStr, type FollowUp, type Plan, type ScheduleBlock, type Task } from "@/lib/daily-life";

/** Questions about "my tasks" or "my day" used to reach the model with no
 * data at all, so it answered with an empty template. Tasks live in the app,
 * not the backend, so the app has to hand them over - but only when the
 * question is actually about them, otherwise every message pays for context
 * it doesn't use. */
const DAY_QUESTION = new RegExp(
  [
    // English
    "task", "todo", "to-do", "schedule", "agenda", "plan", "meeting", "deadline",
    "today", "tomorrow", "this week", "follow.?up", "my day", "priorit",
    // Hindi / Hinglish, roman and Devanagari
    "kaam", "kya karna", "aaj", "kal", "planning", "shedule",
    "काम", "आज", "कल", "टास्क", "मीटिंग", "प्लान", "शेड्यूल",
  ].join("|"),
  "i",
);

export function needsDayContext(message: string): boolean {
  return DAY_QUESTION.test(message);
}

function line(t: Task): string {
  const bits = [t.title];
  if (t.time) bits.push(`at ${t.time}`);
  if (t.durationMinutes) bits.push(`~${t.durationMinutes}min`);
  if (t.deadline) bits.push(`due ${formatDateLabel(t.deadline)}`);
  bits.push(`priority ${t.priority}`);
  if (t.status === "completed") bits.push("DONE");
  return `- ${bits.join(", ")}`;
}

/** A compact, factual snapshot. Kept small on purpose - it's prepended to a
 * real message, so every line costs tokens. */
export function buildDayContext({
  tasks,
  blocks,
  followUps,
  plans,
}: {
  tasks: Task[];
  blocks: ScheduleBlock[];
  followUps: FollowUp[];
  plans: Plan[];
}): string | null {
  const today = todayStr();
  const tomorrow = tomorrowStr();

  const todays = tasks.filter((t) => t.date === today);
  const tomorrows = tasks.filter((t) => t.date === tomorrow && t.status !== "completed");
  const overdue = tasks.filter((t) => t.status !== "completed" && t.date < today);
  const todaysBlocks = blocks.filter((b) => b.date === today);
  const openFollowUps = followUps.filter((f) => !f.resolved);
  const activePlans = plans.filter((p) => !p.endDate || p.endDate >= today);

  const sections: string[] = [];

  if (todays.length) sections.push(`Tasks for today (${today}):\n${todays.map(line).join("\n")}`);
  else sections.push(`Tasks for today (${today}): none recorded.`);

  if (overdue.length) sections.push(`Unfinished from earlier:\n${overdue.map(line).join("\n")}`);
  if (tomorrows.length) sections.push(`Planned for tomorrow:\n${tomorrows.map(line).join("\n")}`);
  if (todaysBlocks.length) {
    sections.push(
      `Time blocked today:\n${todaysBlocks.map((b) => `- ${b.startTime}-${b.endTime} ${b.label}`).join("\n")}`,
    );
  }
  if (openFollowUps.length) {
    sections.push(
      `Open follow-ups:\n${openFollowUps
        .map((f) => `- ${f.title}${f.followUpDate ? `, check on ${f.followUpDate}` : ""}`)
        .join("\n")}`,
    );
  }
  if (activePlans.length) {
    sections.push(
      `Active plans:\n${activePlans
        .map((p) => {
          const done = p.activities.filter((a) => a.done).length + p.milestones.filter((m) => m.done).length;
          const total = p.activities.length + p.milestones.length;
          return `- ${p.title}${total ? ` (${done}/${total} done)` : ""}${p.startDate ? `, from ${p.startDate}` : ""}`;
        })
        .join("\n")}`,
    );
  }

  if (!sections.length) return null;

  return [
    "[The user's current tasks and schedule, from their planner. This is the real,",
    "complete list - if something isn't here, they haven't recorded it. Answer from",
    "this rather than asking them to fill in a template.]",
    "",
    sections.join("\n\n"),
  ].join("\n");
}
