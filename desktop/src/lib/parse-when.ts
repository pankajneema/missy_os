import { addDaysStr, todayStr, tomorrowStr } from "@/lib/daily-life";

/** Pulls a day and a clock time out of ordinary speech, in English or
 * Hinglish, so "meeting kal 3 baje" and "meeting tomorrow at 3pm" both land
 * on a real date and time instead of being handed to the model as prose. */
export interface When {
  date: string; // yyyy-mm-dd
  /** How to say it back: "tomorrow", "Friday", "today". */
  label: string;
  /** HH:mm, absent when no time was spoken. */
  time?: string;
  /** Whether a day was actually named, as opposed to defaulting to today. */
  explicitDate: boolean;
  /** The exact phrases matched, so a title can be cleaned of them. */
  matched: string[];
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, ravivar: 0, itwar: 0,
  monday: 1, mon: 1, somvar: 1, somwar: 1,
  tuesday: 2, tue: 2, tues: 2, mangalvar: 2, mangalwar: 2,
  wednesday: 3, wed: 3, budhvar: 3, budhwar: 3,
  thursday: 4, thu: 4, thurs: 4, guruvar: 4, guruwar: 4,
  friday: 5, fri: 5, shukravar: 5, shukrawar: 5,
  saturday: 6, sat: 6, shanivar: 6, shaniwar: 6,
};

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Days ahead until the next occurrence of a weekday. Saying "Friday" on a
 * Friday means the one coming, not today - if you meant today you'd say today.
 * "next Friday" is treated the same: people overwhelmingly mean the one
 * approaching, and landing a meeting a fortnight away would be worse than
 * landing it a week early. */
function daysUntilWeekday(target: number): number {
  const current = new Date().getDay();
  const diff = (target - current + 7) % 7;
  return diff === 0 ? 7 : diff;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** A bare hour with no am/pm. People saying "meet at 3" mean the afternoon,
 * and "at 9" in a working day means the morning - this is the reading that
 * is right far more often than defaulting everything to am. */
function assumeMeridiem(hour: number): number {
  if (hour === 12) return 12;
  if (hour >= 1 && hour <= 7) return hour + 12;
  return hour;
}

function parseTime(text: string): { time: string; matched: string } | null {
  // A spoken part of day, which overrides the bare-hour guess.
  const morning = /\b(subah|savere|सुबह|morning|am|a\.m\.)\b/i.test(text);
  const evening = /\b(shaam|sham|शाम|raat|रात|night|tonight|evening|pm|p\.m\.)\b/i.test(text);
  const noonish = /\b(dopahar|दोपहर|afternoon)\b/i.test(text);

  // 3pm, 3:30 pm, 15:00, 3.30pm
  let m = text.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (m) {
    let hour = Number(m[1]);
    const mins = Number(m[2]);
    if (hour <= 23 && mins <= 59) {
      const suffix = m[3]?.toLowerCase();
      if (suffix?.startsWith("p") && hour < 12) hour += 12;
      else if (suffix?.startsWith("a") && hour === 12) hour = 0;
      else if (!suffix && hour <= 12) {
        if (evening && hour < 12) hour += 12;
        else if (noonish && hour < 12) hour += 12;
        else if (!morning) hour = assumeMeridiem(hour);
      }
      return { time: `${pad(hour)}:${pad(mins)}`, matched: m[0] };
    }
  }

  // 3pm / 3 pm / 3 o'clock / 3 baje / at 3
  m = text.match(/\b(?:at\s+)?(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.|o'?clock|baje|बजे)\b/i);
  if (!m) m = text.match(/\bat\s+(\d{1,2})\b/i);
  if (m) {
    let hour = Number(m[1]);
    if (hour > 23) return null;
    const suffix = (m[2] ?? "").toLowerCase();
    if (suffix.startsWith("p") && hour < 12) hour += 12;
    else if (suffix.startsWith("a") && hour === 12) hour = 0;
    else if (!suffix.startsWith("a") && !suffix.startsWith("p")) {
      if (evening && hour < 12) hour += 12;
      else if (noonish && hour < 12) hour += 12;
      else if (morning && hour === 12) hour = 0;
      else if (!morning) hour = assumeMeridiem(hour);
    }
    return { time: `${pad(hour)}:00`, matched: m[0] };
  }
  return null;
}

export function parseWhen(text: string): When {
  const matched: string[] = [];
  let date = todayStr();
  let label = "today";
  let explicitDate = false;

  const dayAfter = text.match(/\b(day after tomorrow|parso|parson|परसों)\b/i);
  const tomorrow = text.match(/\b(tomorrow|tmrw|kal|कल)\b/i);
  const today = text.match(/\b(today|aaj|आज|tonight|aaj raat)\b/i);
  const weekday = text.match(
    /\b(next\s+)?(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thu|friday|fri|saturday|sat|ravivar|itwar|somvar|somwar|mangalvar|mangalwar|budhvar|budhwar|guruvar|guruwar|shukravar|shukrawar|shanivar|shaniwar)\b/i,
  );

  if (dayAfter) {
    date = addDaysStr(2);
    label = "the day after tomorrow";
    explicitDate = true;
    matched.push(dayAfter[0]);
  } else if (tomorrow) {
    date = tomorrowStr();
    label = "tomorrow";
    explicitDate = true;
    matched.push(tomorrow[0]);
  } else if (weekday) {
    const target = WEEKDAYS[weekday[2].toLowerCase()];
    const days = daysUntilWeekday(target);
    date = addDaysStr(days);
    label = WEEKDAY_LABELS[target];
    explicitDate = true;
    matched.push(weekday[0]);
  } else if (today) {
    explicitDate = true;
    matched.push(today[0]);
  }

  const time = parseTime(text);
  if (time) matched.push(time.matched);

  return { date, label, time: time?.time, explicitDate, matched };
}

/** Removes the day/time wording and the filler around it, so what's left is
 * the thing itself: "meeting with Rahul", not "meeting with Rahul kal 3 baje". */
export function stripWhen(text: string, when: When): string {
  let out = text;
  for (const phrase of when.matched) {
    out = out.replace(phrase, " ");
  }
  return out
    .replace(/\b(subah|savere|सुबह|shaam|sham|शाम|raat|रात|dopahar|दोपहर|morning|evening|afternoon|night|tonight)\b/gi, " ")
    .replace(/\s*\b(hai|hain|he)\s*$/i, " ")
    .replace(/\s*\b(at|on|to|by|for|ko|pe|par|se)\s*$/i, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,–-]+|[\s,–-]+$/g, "")
    .trim();
}

/** Meetings need an end as well as a start; an hour is the ordinary default. */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

export function speakTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${pad(m)} ${suffix}`;
}
