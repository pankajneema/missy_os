import { useState } from "react";
import { Link } from "react-router-dom";
import { Wand2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeValue } from "@/lib/prototype-store";
import { SectionTabs, BRIEFING_TABS } from "@/components/shared/SectionTabs";
import * as api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

interface Briefing {
  time: string;
  enabled: boolean;
  parts: Record<string, boolean>;
  prompt: string;
}

const PARTS = ["Today's calendar", "Tasks", "Reminders", "News", "Weather", "Important events", "Important messages", "Personal priorities"];

const BLANK: Briefing = {
  time: "08:00",
  enabled: true,
  parts: Object.fromEntries(PARTS.map((p) => [p, true])),
  prompt: "",
};

/** Turns the on/off switches into a starting instruction, so the prompt box
 * isn't a blank page. The user edits it from there - it's the prompt, not
 * the switches, that a scheduled job actually runs. */
function buildPrompt(briefing: Briefing): string {
  const chosen = PARTS.filter((p) => briefing.parts[p]);
  const list = chosen.length ? chosen.join(", ") : "anything you think matters";
  return `Give me a short morning briefing. Cover: ${list}. Keep it scannable, lead with what needs my attention first, and say plainly when you don't have the information rather than guessing.`;
}

export function MorningBriefingPage() {
  const [briefing, setBriefing] = usePrototypeValue<Briefing>("daily.morning-briefing", BLANK);
  const { token } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function scheduleAsJob() {
    if (!token || !briefing.prompt.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.addScheduledTask(token, briefing.prompt.trim(), "daily", `${briefing.time}:00`, null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Morning Briefing</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={BRIEFING_TABS} />
          <p className="mb-1 text-sm text-muted-foreground">A daily summary of what's ahead, delivered at a time you choose.</p>
          <PrototypeNotice>
            The switches below are saved on this device. The{" "}
            <strong className="font-medium text-foreground">prompt</strong> is the real part — scheduling it creates an
            actual daily job. Missy can only cover calendar, weather or news if you've connected those under{" "}
            <Link to="/work/connectors" className="underline">
              Apps &amp; Connections
            </Link>
            ; otherwise she'll say she doesn't have them.
          </PrototypeNotice>

          <div className="mb-6 rounded-lg border border-border bg-surface p-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <Label htmlFor="briefing-prompt">What should your briefing say?</Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setBriefing((prev) => ({ ...prev, prompt: buildPrompt(prev) }))}
              >
                <Wand2 className="h-3.5 w-3.5" /> Build from my selections
              </Button>
            </div>
            <Textarea
              id="briefing-prompt"
              rows={4}
              placeholder="e.g. Give me a short morning briefing: today's tasks, anything overdue, and my top priority."
              value={briefing.prompt}
              onChange={(e) => {
                setBriefing((prev) => ({ ...prev, prompt: e.target.value }));
                setSaved(false);
              }}
            />

            {error && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {saved && (
              <Alert className="mt-3 border-success-soft bg-success-soft">
                <AlertDescription className="text-success">
                  Scheduled — it now runs daily at {briefing.time} UTC. Manage it under{" "}
                  <Link to="/work/jobs" className="underline">
                    Jobs
                  </Link>
                  .
                </AlertDescription>
              </Alert>
            )}

            <Button className="mt-3" size="sm" onClick={scheduleAsJob} disabled={!briefing.prompt.trim() || saving}>
              {saving ? "Scheduling…" : `Schedule daily at ${briefing.time}`}
            </Button>
          </div>

          <div className="mb-6 flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Morning briefing</p>
              <p className="text-xs text-muted-foreground">Turn the whole briefing on or off.</p>
            </div>
            <Switch checked={briefing.enabled} onCheckedChange={(v) => setBriefing((prev) => ({ ...prev, enabled: v }))} />
          </div>

          <div className="mb-6 space-y-1.5">
            <Label htmlFor="briefing-time">Time</Label>
            <Input
              id="briefing-time"
              type="time"
              className="w-40"
              value={briefing.time}
              onChange={(e) => setBriefing((prev) => ({ ...prev, time: e.target.value }))}
            />
          </div>

          <Label className="mb-2 block">What to include</Label>
          <div>
            {PARTS.map((part) => (
              <div key={part} className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-b-0">
                <p className="text-sm text-foreground">{part}</p>
                <Switch
                  checked={briefing.parts[part]}
                  onCheckedChange={(v) => setBriefing((prev) => ({ ...prev, parts: { ...prev.parts, [part]: v } }))}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
