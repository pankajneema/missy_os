import type { PersonCategory } from "@/lib/people";

export type TeachDestination =
  | { kind: "memory"; category: "fact" | "preference" }
  | { kind: "rule" }
  | { kind: "reminder"; time: string }
  | { kind: "person"; category: PersonCategory; name: string; relationship: string }
  | { kind: "task"; date: "today" | "tomorrow" }
  | { kind: "followup" };

const WORK_WORDS: Record<string, PersonCategory> = {
  manager: "work",
  colleague: "work",
  employee: "work",
  founder: "work",
  "co-founder": "work",
  cofounder: "work",
  client: "work",
  investor: "work",
  recruiter: "work",
  "business partner": "work",
};
const FAMILY_WORDS = ["father", "mother", "brother", "sister", "spouse", "wife", "husband", "son", "daughter", "child", "grandmother", "grandfather", "uncle", "aunt", "cousin"];

/** A deliberately simple keyword heuristic - not real NLU. Always labeled as
 * a "best guess" in the UI; the user picks the destination either way. */
export function guessDestination(text: string): TeachDestination {
  const lower = text.toLowerCase();

  const isMatch = lower.match(/^(.+?)\s+is my\s+(.+?)[.!]?$/);
  if (isMatch) {
    const name = isMatch[1].trim();
    const relRaw = isMatch[2].trim();
    const rel = relRaw.replace(/^(a|an|the)\s+/, "");
    if (WORK_WORDS[rel]) return { kind: "person", category: "work", name, relationship: capitalize(rel) };
    if (FAMILY_WORDS.some((w) => rel.includes(w))) return { kind: "person", category: "family", name, relationship: capitalize(rel) };
    if (rel.includes("friend")) return { kind: "person", category: "friend", name, relationship: capitalize(rel) };
    return { kind: "person", category: "important", name, relationship: capitalize(rel) };
  }

  if (/\b(never|always ask|don't|do not|must not)\b/.test(lower) && /\b(you|assistant|missy)\b/.test(lower) === false) {
    return { kind: "rule" };
  }
  if (/\bnever\b|\balways ask\b/.test(lower)) return { kind: "rule" };

  if (/\bfollow up\b|\bwaiting for\b|\bwaiting since\b/.test(lower)) return { kind: "followup" };

  if (/\b(i need to|need to|have to|i must|i promised to|i'll)\b/.test(lower) && /\b(today|tomorrow)\b/.test(lower)) {
    return { kind: "task", date: /\btoday\b/.test(lower) && !/\btomorrow\b/.test(lower) ? "today" : "tomorrow" };
  }

  const timeMatch = lower.match(/\b(\d{1,2})(:\d{2})?\s*(am|pm)?\b/);
  if (/\bremind me\b|\bevery (day|morning|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower)) {
    let time = "08:00";
    if (timeMatch) {
      let hour = parseInt(timeMatch[1], 10);
      const isPm = timeMatch[3] === "pm";
      if (isPm && hour < 12) hour += 12;
      if (!isPm && timeMatch[3] === "am" && hour === 12) hour = 0;
      time = `${String(hour).padStart(2, "0")}:${(timeMatch[2] ?? ":00").slice(1)}`;
    }
    return { kind: "reminder", time };
  }

  if (/\bi prefer\b|\bi like\b|\bi'd rather\b/.test(lower)) return { kind: "memory", category: "preference" };

  return { kind: "memory", category: "fact" };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Strips the "tomorrow I need to ..." scaffolding so the task title reads
 * like a task ("Finish the report") instead of the whole sentence. */
export function extractTaskTitle(text: string): string {
  const cleaned = text
    .replace(/^(today|tomorrow)\b[,\s]*/i, "")
    .replace(/\b(today|tomorrow)\b/gi, "")
    .replace(/^(i need to|need to|have to|i must|i promised to|i'll)\b\s*/i, "")
    .replace(/[.!\s]+$/, "")
    .trim();
  return capitalize(cleaned || text.trim());
}
