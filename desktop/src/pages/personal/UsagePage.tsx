import { Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SectionTabs, ASSISTANT_TABS } from "@/components/shared/SectionTabs";
import { useTokenUsage, sumRange, type DayUsage } from "@/lib/token-usage";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-medium text-foreground">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function RangeCard({ title, range, rate }: { title: string; range: DayUsage; rate: number }) {
  const total = range.sentTokens + range.receivedTokens;
  const cost = rate > 0 ? (total / 1_000_000) * rate : null;
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-foreground">{title}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Estimated tokens" value={fmt(total)} hint={`${fmt(range.sentTokens)} in · ${fmt(range.receivedTokens)} out`} />
        <Stat label="AI turns" value={String(range.turns)} />
        <Stat label="Handled in-app" value={String(range.localActions)} hint="0 tokens" />
        <Stat label="Est. cost" value={cost === null ? "—" : `$${cost.toFixed(4)}`} hint={rate > 0 ? undefined : "set a rate below"} />
      </div>
    </div>
  );
}

export function UsagePage() {
  const { usage, setRate } = useTokenUsage();

  const today = sumRange(usage.days, 1);
  const week = sumRange(usage.days, 7);
  const all = sumRange(usage.days, null);
  const recent = [...usage.days].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Usage</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={ASSISTANT_TABS} />

          <p className="mb-3 text-sm text-muted-foreground">Roughly how much you're spending on AI, and how much you're not.</p>

          <Alert className="mb-5">
            <AlertDescription className="text-xs">
              These are <strong className="font-medium text-foreground">estimates</strong>, not billed usage — your
              provider is the source of truth. They're counted from the text you send and receive at about 4
              characters per token, and they <strong className="font-medium text-foreground">undercount</strong>:
              each turn also carries your profile, saved memories, and any knowledge-base passages, which aren't
              visible here. "Handled in-app" is exact — those never reached a model.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <RangeCard title="Today" range={today} rate={usage.ratePerMillion} />
            <RangeCard title="Last 7 days" range={week} rate={usage.ratePerMillion} />
            <RangeCard title="All time" range={all} rate={usage.ratePerMillion} />
          </div>

          {all.localActions > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-success-soft bg-success-soft/60 p-3">
              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              <p className="text-sm text-success">
                {all.localActions} request{all.localActions === 1 ? "" : "s"} answered inside the app without calling a
                model — things like adding a task or changing your reply language.
              </p>
            </div>
          )}

          <div className="mt-6 max-w-xs space-y-1.5">
            <Label htmlFor="rate">Your rate ($ per 1M tokens)</Label>
            <Input
              id="rate"
              type="number"
              min={0}
              step={0.01}
              value={usage.ratePerMillion || ""}
              placeholder="e.g. 2.50"
              onChange={(e) => setRate(Number(e.target.value) || 0)}
            />
            <p className="text-[11px] text-muted-foreground">
              Left blank by default — prices differ per model and change over time, so put in your own rather than
              trusting a number baked into the app.
            </p>
          </div>

          {recent.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">By day</h2>
              <div>
                {recent.map((d) => (
                  <div key={d.date} className="flex items-center justify-between border-b border-border/60 py-2 text-sm last:border-b-0">
                    <span className="text-foreground">{d.date}</span>
                    <span className="text-muted-foreground">
                      {fmt(d.sentTokens + d.receivedTokens)} tokens · {d.turns} turns · {d.localActions} free
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
