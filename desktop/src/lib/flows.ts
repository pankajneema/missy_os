/**
 * Flows: a job written as a few ordered steps instead of one paragraph.
 *
 * There is no workflow engine behind this and inventing one would be a lie -
 * what actually runs is the backend's scheduled-task loop, which hands a
 * single prompt to the same agent a chat turn uses. So a flow's real job is
 * to *compile* into that prompt: numbered instructions, an explicit stop
 * condition, and a note about which tools it may need. That keeps the thing
 * you edit readable while staying honest about what executes.
 */

export type StepKind = "check" | "condition" | "action" | "notify";

export interface FlowStep {
  id: string;
  kind: StepKind;
  /** What this step does, in the user's own words. */
  text: string;
  /** For "condition" only - what has to hold for the following steps to run. */
  otherwise?: string;
}

export type TriggerKind = "manual" | "interval" | "daily";

export interface FlowTrigger {
  kind: TriggerKind;
  /** interval only */
  everyMinutes?: number;
  /** daily only - "HH:MM" in the user's local time */
  atTime?: string;
}

export interface Flow {
  id: string;
  name: string;
  goal?: string;
  trigger: FlowTrigger;
  steps: FlowStep[];
  /** Set once the flow has been turned into a real backend scheduled task. */
  scheduledTaskId?: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
}

export const STEP_KINDS: { value: StepKind; label: string; hint: string; example: string }[] = [
  {
    value: "check",
    label: "Check",
    hint: "Look something up and hold on to what you find.",
    example: "Check for new WhatsApp messages since the last run",
  },
  {
    value: "condition",
    label: "Only if",
    hint: "Everything after this runs only when it's true.",
    example: "the sender is someone in my family list",
  },
  {
    value: "action",
    label: "Do",
    hint: "The actual work.",
    example: "Reply saying I'm busy and will call back this evening",
  },
  {
    value: "notify",
    label: "Tell me",
    hint: "Report back. Results land in the Scheduled conversation.",
    example: "Summarise anything you replied to",
  },
];

export const INTERVAL_CHOICES = [
  { minutes: 10, label: "Every 10 minutes" },
  { minutes: 15, label: "Every 15 minutes" },
  { minutes: 30, label: "Every 30 minutes" },
  { minutes: 60, label: "Every hour" },
  { minutes: 180, label: "Every 3 hours" },
  { minutes: 360, label: "Every 6 hours" },
  { minutes: 720, label: "Every 12 hours" },
];

/** The backend refuses anything under 5 minutes: the scheduler wakes once a
 * minute, and a tighter loop would start a fresh agent run before the last
 * one has plausibly finished. */
export const MIN_INTERVAL_MINUTES = 5;

export function describeTrigger(trigger: FlowTrigger): string {
  if (trigger.kind === "manual") return "Only when you run it";
  if (trigger.kind === "daily") return `Every day at ${trigger.atTime ?? "09:00"}`;
  const minutes = trigger.everyMinutes ?? 60;
  const known = INTERVAL_CHOICES.find((c) => c.minutes === minutes);
  if (known) return known.label;
  return minutes % 60 === 0 ? `Every ${minutes / 60} hours` : `Every ${minutes} minutes`;
}

/** "09:30" local -> "09:30:00" UTC, since the backend stores daily times in UTC. */
export function localTimeToUtc(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const local = new Date();
  local.setHours(h, m, 0, 0);
  const utcH = String(local.getUTCHours()).padStart(2, "0");
  const utcM = String(local.getUTCMinutes()).padStart(2, "0");
  return `${utcH}:${utcM}:00`;
}

export function utcTimeToLocal(hhmmss: string): string {
  const [h, m] = hhmmss.split(":").map(Number);
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function stepLine(step: FlowStep, index: number): string {
  const text = step.text.trim();
  switch (step.kind) {
    case "condition":
      return `${index}. Only continue if ${text}.${step.otherwise?.trim() ? ` If not: ${step.otherwise.trim()}.` : " If not, stop here and do nothing."}`;
    case "check":
      return `${index}. Check: ${text}.`;
    case "notify":
      return `${index}. Report back: ${text}.`;
    default:
      return `${index}. Do: ${text}.`;
  }
}

/**
 * Turns the flow into the single prompt the scheduler will run.
 *
 * The rules at the end are not padding. This runs unattended, so a risky tool
 * call is auto-denied with nobody to ask, and a run that invents an outcome
 * is worse than one that reports it could not proceed.
 */
export function compileFlow(flow: Flow): string {
  const steps = flow.steps.filter((s) => s.text.trim());
  const lines: string[] = [];

  lines.push(`Run the flow "${flow.name.trim() || "Untitled"}".`);
  if (flow.goal?.trim()) lines.push(`Purpose: ${flow.goal.trim()}`);
  lines.push("");
  lines.push("Steps, in order:");
  steps.forEach((step, i) => lines.push(stepLine(step, i + 1)));
  lines.push("");
  lines.push("Rules for this run:");
  lines.push("- Use your tools to find things out. Never guess at or invent a result.");
  lines.push("- If a step can't be completed, stop and say which step and why. Don't carry on as if it worked.");
  lines.push("- If a condition isn't met, that's a normal outcome: say so briefly and stop.");
  lines.push("- You're running unattended, so anything needing my approval will be refused. Report it instead.");
  lines.push("- Keep the report short. A few lines, no tables.");

  return lines.join("\n");
}

/** Enough to run, without nagging about a half-written draft. */
export function flowProblems(flow: Flow): string[] {
  const problems: string[] = [];
  if (!flow.name.trim()) problems.push("Give the flow a name.");
  const usable = flow.steps.filter((s) => s.text.trim());
  if (!usable.length) problems.push("Add at least one step.");
  if (usable.length && usable.every((s) => s.kind === "condition")) {
    problems.push("A flow made only of conditions never does anything — add a step that acts.");
  }
  if (flow.trigger.kind === "interval") {
    const minutes = flow.trigger.everyMinutes ?? 0;
    if (minutes < MIN_INTERVAL_MINUTES) problems.push(`The shortest interval the scheduler accepts is ${MIN_INTERVAL_MINUTES} minutes.`);
  }
  if (flow.trigger.kind === "daily" && !flow.trigger.atTime) problems.push("Pick a time of day.");
  return problems;
}

export function newFlow(id: string): Flow {
  return {
    id,
    name: "",
    trigger: { kind: "manual" },
    steps: [],
    enabled: false,
    createdAt: new Date().toISOString(),
  };
}
