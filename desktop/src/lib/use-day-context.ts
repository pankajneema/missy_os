import { readPrototypeCollection } from "@/lib/prototype-store";
import { buildDayContext, needsDayContext } from "@/lib/day-context";
import type { FollowUp, Plan, ScheduleBlock, Task } from "@/lib/daily-life";

/** Prefixes a message with the user's real tasks/schedule when the question
 * is about their day, so the assistant answers from fact instead of asking
 * them to fill in a blank table.
 *
 * The lists are read when the message is sent, not when this hook rendered:
 * a voice conversation runs for many turns, and a task added three turns ago
 * has to be in the context of the fourth. */
export function useDayContext() {
  return function withDayContext(message: string): string {
    if (!needsDayContext(message)) return message;
    const context = buildDayContext({
      tasks: readPrototypeCollection<Task>("daily.tasks"),
      blocks: readPrototypeCollection<ScheduleBlock>("daily.schedule"),
      followUps: readPrototypeCollection<FollowUp>("daily.followups"),
      plans: readPrototypeCollection<Plan>("daily.plans"),
    });
    return context ? `${context}\n\n---\n\n${message}` : message;
  };
}
