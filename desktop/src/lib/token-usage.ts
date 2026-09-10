import { usePrototypeValue } from "@/lib/prototype-store";
import { todayStr } from "@/lib/daily-life";

/** Rough token estimate. ~4 characters per token holds up reasonably for
 * English prose; it drifts for code and other scripts. Deliberately a
 * single place so the whole app estimates the same way. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 4));
}

export interface DayUsage {
  date: string;
  sentTokens: number;
  receivedTokens: number;
  turns: number;
  /** Commands answered inside the app, which cost nothing. */
  localActions: number;
}

export interface UsageState {
  days: DayUsage[];
  /** $ per 1M tokens, user-editable since real prices change and differ per model. */
  ratePerMillion: number;
}

const BLANK: UsageState = { days: [], ratePerMillion: 0 };

function emptyDay(date: string): DayUsage {
  return { date, sentTokens: 0, receivedTokens: 0, turns: 0, localActions: 0 };
}

export function useTokenUsage() {
  const [usage, setUsage] = usePrototypeValue<UsageState>("usage.tokens", BLANK);

  function bump(patch: Partial<Omit<DayUsage, "date">>) {
    const today = todayStr();
    setUsage((prev) => {
      const days = [...prev.days];
      const i = days.findIndex((d) => d.date === today);
      const base = i >= 0 ? days[i] : emptyDay(today);
      const next: DayUsage = {
        ...base,
        sentTokens: base.sentTokens + (patch.sentTokens ?? 0),
        receivedTokens: base.receivedTokens + (patch.receivedTokens ?? 0),
        turns: base.turns + (patch.turns ?? 0),
        localActions: base.localActions + (patch.localActions ?? 0),
      };
      if (i >= 0) days[i] = next;
      else days.push(next);
      // Keep it bounded - a year of daily rows is plenty for a usage view.
      return { ...prev, days: days.slice(-365) };
    });
  }

  function recordTurn(sent: string, received: string) {
    bump({ sentTokens: estimateTokens(sent), receivedTokens: estimateTokens(received), turns: 1 });
  }

  function recordLocalAction() {
    bump({ localActions: 1 });
  }

  function setRate(ratePerMillion: number) {
    setUsage((prev) => ({ ...prev, ratePerMillion }));
  }

  return { usage, recordTurn, recordLocalAction, setRate };
}

export function sumRange(days: DayUsage[], sinceDaysAgo: number | null): DayUsage {
  const cutoff = sinceDaysAgo === null ? null : (() => {
    const d = new Date();
    d.setDate(d.getDate() - sinceDaysAgo + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  return days
    .filter((d) => cutoff === null || d.date >= cutoff)
    .reduce(
      (acc, d) => ({
        date: "range",
        sentTokens: acc.sentTokens + d.sentTokens,
        receivedTokens: acc.receivedTokens + d.receivedTokens,
        turns: acc.turns + d.turns,
        localActions: acc.localActions + d.localActions,
      }),
      { date: "range", sentTokens: 0, receivedTokens: 0, turns: 0, localActions: 0 },
    );
}
