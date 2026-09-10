import { todayStr, tomorrowStr } from "@/lib/daily-life";
import { parseWhen, stripWhen as stripWhenPhrases } from "@/lib/parse-when";

/** Things the user commonly asks for in chat that don't actually need a
 * language model to work out. Matching these locally means the action is
 * instant and costs nothing - the message never leaves the app. Anything
 * that doesn't match falls through to the real agent as normal, so this
 * only ever removes cost, never capability. */
export type ChatCommand =
  | { kind: "add_task"; title: string; date: string; dateLabel: string; time?: string }
  | { kind: "add_meeting"; title: string; date: string; dateLabel: string; time?: string }
  | { kind: "set_time"; time: string }
  | { kind: "complete_task"; match: string }
  | { kind: "move_task"; match: string; date: string; dateLabel: string }
  | { kind: "add_followup"; title: string }
  | { kind: "add_plan"; title: string }
  | { kind: "add_goal"; title: string }
  | { kind: "set_language"; language: string }
  | { kind: "set_tone"; tone: string }
  | { kind: "query_today" }
  | { kind: "query_next" };

/** Anything you'd put on a calendar rather than tick off a list. */
const MEETING_NOUN =
  /\b(meetings?|meet|call|appointment|appt|sync|stand-?up|interview|catch-?up|1:1|one[- ]on[- ]one|demo|session|मीटिंग|मुलाकात)\b/i;
const ADD_VERB =
  /\b(add|schedule|set ?up|book|create|put|arrange|fix|plan|lag(?:ao|a do)|rakh(?:o|do| do)|d(?:aa|a)l do|kar ?do|kar ?lo|kr ?do|add ?k(?:r|ar)o)\b/i;
/** Asking about meetings must never create one. */
const QUESTION =
  /\?|\b(what|when|which|how many|do i have|list|show me|kya|kab|kaun|kitne|batao|bata do)\b/i;

function tidy(s: string): string {
  const t = s.replace(/\s+/g, " ").replace(/[.!]+$/, "").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function dateFrom(text: string): { date: string; label: string } {
  if (/\btomorrow\b/i.test(text)) return { date: tomorrowStr(), label: "tomorrow" };
  return { date: todayStr(), label: "today" };
}

/** Strips a trailing "today"/"tomorrow" so it doesn't end up in the title. */
function stripWhen(s: string): string {
  return s.replace(/\b(today|tomorrow)\b/gi, "").replace(/\s+/g, " ").trim();
}

const LANGUAGES = [
  "english", "hindi", "hinglish", "marathi", "telugu", "tamil", "bengali",
  "gujarati", "kannada", "punjabi", "malayalam", "urdu", "spanish", "french", "german",
];

const TONE_WORDS: Record<string, string> = {
  casual: "Warm and encouraging",
  friendly: "Warm and encouraging",
  warm: "Warm and encouraging",
  direct: "Direct and concise",
  concise: "Direct and concise",
  brief: "Direct and concise",
  short: "Direct and concise",
  formal: "Formal and precise",
  professional: "Formal and precise",
  precise: "Formal and precise",
};

export function parseChatCommand(raw: string): ChatCommand | null {
  const text = raw.trim();
  const lower = text.toLowerCase();
  let m: RegExpMatchArray | null;

  // A bare time on its own ("3 baje", "at 4pm") answers a meeting we just
  // added without one, rather than starting something new.
  if (/^(at\s+)?\d{1,2}([:.]\d{2})?\s*(am|pm|a\.m\.|p\.m\.|o'?clock|baje|बजे)?\s*$/i.test(text)) {
    const only = parseWhen(text);
    if (only.time) return { kind: "set_time", time: only.time };
  }

  // --- questions we can answer from local data, in English or Hinglish ---
  if (/^what should i (do|work on)( now| next)?\s*\??$/i.test(text)) return { kind: "query_next" };
  if (/^(ab )?(main |mai )?kya kar(u|oon|na hai)\b/i.test(text)) return { kind: "query_next" };
  if (/^(what('s| is| do i have)?\s*(on|up|planned)?\s*(for )?today|what do i have today)\s*\??$/i.test(text)) {
    return { kind: "query_today" };
  }
  if (/^what\s+(meetings?|calls?|tasks?)\s+(do i have|are there|have i got)\s*(today)?\s*\??$/i.test(text)) {
    return { kind: "query_today" };
  }
  // "aaj ke task kya hai", "mere aaj ke tasks", "aaj kya kaam hai", plus Devanagari.
  if (/(aaj|आज).*(task|kaam|काम|टास्क|plan|प्लान|schedule|शेड्यूल)/i.test(text)) return { kind: "query_today" };
  if (/(task|kaam|काम|टास्क).*(aaj|आज)/i.test(text)) return { kind: "query_today" };
  if (/^(mere|मेरे|my)\s+(aaj|आज|today).*(task|kaam|काम|टास्क)/i.test(text)) return { kind: "query_today" };

  // --- completing / moving existing work ---
  if ((m = text.match(/^(?:mark|set)\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed)\s*$/i))) {
    return { kind: "complete_task", match: m[1].trim() };
  }
  if ((m = text.match(/^(?:i\s+)?(?:finished|completed|did)\s+(?:the\s+)?(.+?)\s*$/i))) {
    return { kind: "complete_task", match: m[1].trim() };
  }
  if ((m = text.match(/^(?:move|postpone|push|reschedule)\s+(.+?)\s+to\s+(today|tomorrow)\s*$/i))) {
    const when = dateFrom(m[2]);
    return { kind: "move_task", match: m[1].trim(), date: when.date, dateLabel: when.label };
  }

  // --- creating things ---
  if ((m = text.match(/^(?:add|create|new)\s+(?:a\s+)?task[:\s]+(.+)$/i))) {
    const when = parseWhen(m[1]);
    return {
      kind: "add_task",
      title: tidy(stripWhenPhrases(m[1], when)),
      date: when.date,
      dateLabel: when.label,
      time: when.time,
    };
  }

  // Otherwise a meeting: "schedule a meeting tomorrow at 3" is a calendar entry,
  // not a note to remember. Left to the model it became a stored fact and
  // never reached the schedule at all.
  if (MEETING_NOUN.test(text) && !QUESTION.test(text)) {
    const when = parseWhen(text);
    if (ADD_VERB.test(text) || when.time || when.explicitDate) {
      const title = tidy(
        stripWhenPhrases(text, when)
          .replace(ADD_VERB, " ")
          .replace(/^\s*(a|an|the|ek|ek\s+)\b/i, " ")
          .replace(/\b(kro|karo|kar|do|de|dena|dijiye|please|plz)\b/gi, " ")
          .replace(/\s{2,}/g, " ")
          .trim(),
      );
      return {
        kind: "add_meeting",
        title: title.length > 1 ? title : "Meeting",
        date: when.date,
        dateLabel: when.label,
        time: when.time,
      };
    }
  }

  if ((m = text.match(/^(?:add|create|new)\s+(?:a\s+)?plan[:\s]+(.+)$/i))) {
    return { kind: "add_plan", title: tidy(m[1]) };
  }
  if ((m = text.match(/^(?:add|create|new|set)\s+(?:a\s+)?goal[:\s]+(.+)$/i))) {
    return { kind: "add_goal", title: tidy(m[1]) };
  }
  if (/^follow\s*up\s+/i.test(text)) {
    // Keep the whole phrase - "Follow up with the client" reads better in the
    // list than the bare object ("The client").
    return { kind: "add_followup", title: tidy(text) };
  }
  // "remind me to X tomorrow" / "tomorrow I need to X" - only treated as a
  // task when a day is actually named, so vaguer requests still reach the agent.
  if (/\b(today|tomorrow)\b/i.test(lower)) {
    if ((m = text.match(/^(?:remind me to|i need to|i have to|remember to)\s+(.+)$/i))) {
      const when = dateFrom(text);
      return { kind: "add_task", title: tidy(stripWhen(m[1])), date: when.date, dateLabel: when.label };
    }
    if ((m = text.match(/^(?:today|tomorrow)[,\s]+i\s+(?:need to|have to|must)\s+(.+)$/i))) {
      const when = dateFrom(text);
      return { kind: "add_task", title: tidy(stripWhen(m[1])), date: when.date, dateLabel: when.label };
    }
  }

  // --- settings ---
  if ((m = text.match(/^(?:reply|respond|talk|speak|answer)\s+(?:to me\s+)?in\s+([a-z]+)\s*$/i))) {
    const lang = m[1].toLowerCase();
    if (LANGUAGES.includes(lang)) {
      return { kind: "set_language", language: lang.charAt(0).toUpperCase() + lang.slice(1) };
    }
  }
  if ((m = text.match(/^be\s+(?:more\s+)?([a-z]+)\s*$/i))) {
    const tone = TONE_WORDS[m[1].toLowerCase()];
    if (tone) return { kind: "set_tone", tone };
  }

  return null;
}

export interface CommandResult {
  ok: boolean;
  message: string;
  link?: { to: string; label: string };
}
