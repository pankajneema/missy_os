import { usePrototypeCollection, readPrototypeCollection, newId } from "@/lib/prototype-store";
import { useTasks } from "@/lib/use-tasks";
import { formatDateLabel, todayStr, type FollowUp, type Goal, type Plan, type ScheduleBlock, type Task } from "@/lib/daily-life";
import type { ChatCommand, CommandResult } from "@/lib/chat-commands";
import { addMinutes, speakTime } from "@/lib/parse-when";
import * as api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

/** Runs a locally-parsed chat command against the same stores the pages use,
 * so anything done from chat shows up in Tasks/Plans/Settings immediately. */
export function useChatCommands() {
  const { token, setProfileInfo } = useAuthStore();
  const { add: addTask, update: updateTask, toggleComplete } = useTasks();
  const plans = usePrototypeCollection<Plan>("daily.plans");
  const goals = usePrototypeCollection<Goal>("daily.goals");
  const followUps = usePrototypeCollection<FollowUp>("daily.followups");
  const { add: addBlock } = usePrototypeCollection<ScheduleBlock>("daily.schedule");

  // Always the current lists, never the ones this hook was rendered with.
  const currentTasks = () => readPrototypeCollection<Task>("daily.tasks");
  const currentBlocks = () => readPrototypeCollection<ScheduleBlock>("daily.schedule");

  function findTask(match: string): Task | undefined {
    const needle = match.toLowerCase();
    const pending = currentTasks().filter((t) => t.status !== "completed");
    return (
      pending.find((t) => t.title.toLowerCase() === needle) ??
      pending.find((t) => t.title.toLowerCase().includes(needle)) ??
      pending.find((t) => needle.includes(t.title.toLowerCase()))
    );
  }

  async function execute(command: ChatCommand): Promise<CommandResult> {
    switch (command.kind) {
      case "add_task": {
        addTask({
          id: newId(),
          title: command.title,
          date: command.date,
          time: command.time,
          priority: "medium",
          status: "pending",
          createdAt: new Date().toISOString(),
        });
        const at = command.time ? ` at ${speakTime(command.time)}` : "";
        return {
          ok: true,
          message: `Added “${command.title}” to your tasks for ${command.dateLabel}${at}.`,
          link: { to: "/daily/tasks", label: "Open Tasks" },
        };
      }

      // A meeting belongs on the calendar and in the task list, linked - not
      // filed away as a remembered fact, which is where it used to end up.
      case "add_meeting": {
        const taskId = newId();
        addTask({
          id: taskId,
          title: command.title,
          date: command.date,
          time: command.time,
          durationMinutes: 60,
          priority: "medium",
          status: "pending",
          createdAt: new Date().toISOString(),
        });
        if (command.time) {
          addBlock({
            id: newId(),
            date: command.date,
            startTime: command.time,
            endTime: addMinutes(command.time, 60),
            label: command.title,
            taskId,
          });
          return {
            ok: true,
            message: `Scheduled “${command.title}” for ${command.dateLabel} at ${speakTime(command.time)}. It's on your schedule and in your tasks.`,
            link: { to: "/daily/schedule", label: "Open Schedule" },
          };
        }
        return {
          ok: true,
          message: `Added “${command.title}” for ${command.dateLabel}. What time is it? Say the time and I'll put it on your schedule.`,
          link: { to: "/daily/tasks", label: "Open Tasks" },
        };
      }

      // Answers "what time?" after a meeting was added without one.
      case "set_time": {
        const waiting = currentTasks()
          .filter((t) => !t.time && t.status !== "completed")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (!waiting) {
          return { ok: false, message: "There's nothing waiting on a time right now." };
        }
        updateTask(waiting.id, { time: command.time });
        addBlock({
          id: newId(),
          date: waiting.date,
          startTime: command.time,
          endTime: addMinutes(command.time, waiting.durationMinutes ?? 60),
          label: waiting.title,
          taskId: waiting.id,
        });
        return {
          ok: true,
          message: `Set “${waiting.title}” for ${speakTime(command.time)} ${formatDateLabel(waiting.date).toLowerCase()}.`,
          link: { to: "/daily/schedule", label: "Open Schedule" },
        };
      }

      case "complete_task": {
        const task = findTask(command.match);
        if (!task) return { ok: false, message: `I couldn't find a pending task matching “${command.match}”.` };
        toggleComplete(task);
        return {
          ok: true,
          message: `Marked “${task.title}” as done.`,
          link: { to: "/daily/tasks", label: "Open Tasks" },
        };
      }

      case "move_task": {
        const task = findTask(command.match);
        if (!task) return { ok: false, message: `I couldn't find a pending task matching “${command.match}”.` };
        updateTask(task.id, { date: command.date });
        return {
          ok: true,
          message: `Moved “${task.title}” to ${command.dateLabel}.`,
          link: { to: "/daily/tasks", label: "Open Tasks" },
        };
      }

      case "add_plan": {
        plans.add({
          id: newId(),
          title: command.title,
          kind: /trip|travel|vacation|holiday/i.test(command.title) ? "trip" : "other",
          peopleIds: [],
          milestones: [],
          activities: [],
          createdAt: new Date().toISOString(),
        });
        return {
          ok: true,
          message: `Created the plan “${command.title}”.`,
          link: { to: "/daily/plans", label: "Open Plans" },
        };
      }

      case "add_goal": {
        goals.add({
          id: newId(),
          title: command.title,
          progress: 0,
          planIds: [],
          milestones: [],
          createdAt: new Date().toISOString(),
        });
        return { ok: true, message: `Added the goal “${command.title}”.`, link: { to: "/daily/goals", label: "Open Goals" } };
      }

      case "add_followup": {
        followUps.add({
          id: newId(),
          title: command.title,
          kind: "follow_up",
          waitingSince: todayStr(),
          resolved: false,
          createdAt: new Date().toISOString(),
        });
        return {
          ok: true,
          message: `Added “${command.title}” to your follow-ups.`,
          link: { to: "/daily/follow-ups", label: "Open Follow-ups" },
        };
      }

      case "set_language":
      case "set_tone": {
        if (!token) return { ok: false, message: "You need to be signed in for that." };
        const profile = await api.getProfile(token);
        if (!profile) return { ok: false, message: "I couldn't load your profile to change that." };
        const next =
          command.kind === "set_language"
            ? { ...profile, response_language: command.language }
            : { ...profile, tone_preference: command.tone };
        await api.saveProfile(token, next);
        setProfileInfo(next.assistant_name, next.response_language);
        return {
          ok: true,
          message:
            command.kind === "set_language"
              ? `I'll reply in ${command.language} from now on.`
              : `Tone set to “${command.tone}”.`,
          link: { to: "/assistant/tone-language", label: "Open Tone & Language" },
        };
      }

      case "query_today": {
        const today = todayStr();
        const tasks = currentTasks();
        const blocks = currentBlocks();
        const todays = tasks.filter((t) => t.date === today);
        const pending = todays.filter((t) => t.status !== "completed");
        const overdue = tasks.filter((t) => t.status !== "completed" && t.date < today);
        const todaysBlocks = blocks.filter((b) => b.date === today);
        const parts: string[] = [];
        parts.push(
          pending.length
            ? `${pending.length} task${pending.length === 1 ? "" : "s"} left today: ${pending.map((t) => t.title).join(", ")}.`
            : todays.length
              ? "All of today's tasks are done."
              : "Nothing planned for today yet.",
        );
        if (todaysBlocks.length) {
          parts.push(`Scheduled: ${todaysBlocks.map((b) => `${b.startTime}–${b.endTime} ${b.label}`).join("; ")}.`);
        }
        if (overdue.length) parts.push(`${overdue.length} carried over from earlier.`);
        return { ok: true, message: parts.join(" "), link: { to: "/today", label: "Open Today" } };
      }

      case "query_next": {
        const today = todayStr();
        const candidates = currentTasks()
          .filter((t) => t.status !== "completed" && t.date <= today)
          .sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
            return a.date.localeCompare(b.date);
          });
        const next = candidates[0];
        if (!next) return { ok: true, message: "Nothing pending for today — you're clear." };
        const overdue = next.date < today ? ` (carried over from ${formatDateLabel(next.date)})` : "";
        return {
          ok: true,
          message: `Highest priority right now: “${next.title}”${overdue}.`,
          link: { to: "/daily/tasks", label: "Open Tasks" },
        };
      }
    }
  }

  return { execute };
}
