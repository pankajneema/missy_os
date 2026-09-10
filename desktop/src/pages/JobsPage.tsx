import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Play, Plus, Square, Zap } from "lucide-react";
import * as api from "@/lib/api";
import type { ProviderCredential, ScheduledTask, ScheduleType } from "@/lib/api";
import { SectionTabs, JOB_TABS } from "@/components/shared/SectionTabs";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";

const JOBS_CONVERSATION_KEY = "missy.jobsConversationId";

/** A job with no schedule is stored as a real scheduled task that's simply
 * disabled - the scheduler then never picks it up, so it only ever runs when
 * you press "Run now". That keeps manual jobs on the same real backend as
 * scheduled ones instead of inventing a second, local-only store. */
type JobSchedule = "manual" | ScheduleType;

function scheduleCaption(task: ScheduledTask): string {
  if (!task.enabled) return "Manual — runs only when you press Run now";
  if (task.schedule_type === "daily") return `Every day at ${task.run_at_time} UTC`;
  return `Every ${task.interval_hours}h`;
}

/** Reuses one conversation for every manual run so the sidebar's chat list
 * doesn't fill up with a new thread each time you press Run now. */
async function getJobsConversation(token: string): Promise<string> {
  const stored = localStorage.getItem(JOBS_CONVERSATION_KEY);
  const conversations = await api.listConversations(token);
  if (stored && conversations.some((c) => c.id === stored)) return stored;
  const created = await api.createConversation(token);
  try {
    localStorage.setItem(JOBS_CONVERSATION_KEY, created.id);
  } catch {
    /* storage disabled - we'll just make a new one next time */
  }
  return created.id;
}

function useRunner(token: string | null, provider: string | null) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function run(id: string, prompt: string) {
    if (!token || !provider) return;
    setRunningId(id);
    setOutput("");
    setError(null);
    setStatus("Starting…");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const conversationId = await getJobsConversation(token);
      for await (const event of api.streamMessage(token, conversationId, prompt, provider, undefined, controller.signal)) {
        if (event.type === "status") setStatus(`Using ${event.tool}…`);
        else if (event.type === "token") {
          setStatus(null);
          setOutput((prev) => prev + event.text);
        } else if (event.type === "error") {
          setError(event.detail);
          return;
        } else if (event.type === "needs_confirmation") {
          setStatus(null);
          setError("This job wants to run a risky tool. Open it in Chat to approve or deny it.");
          return;
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
      }
    } finally {
      setRunningId(null);
      setStatus(null);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return { runningId, status, output, error, run, stop, clear: () => { setOutput(""); setError(null); } };
}

function AddJobForm({ token, onAdded, onClose }: { token: string; onAdded: () => void; onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState<JobSchedule>("manual");
  const [time, setTime] = useState("08:00");
  const [intervalHours, setIntervalHours] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (!prompt.trim()) {
      setError("Describe what this job should do.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // A manual job still needs a valid schedule shape on create; it gets
      // disabled immediately after so the scheduler never runs it.
      const type: ScheduleType = schedule === "interval" ? "interval" : "daily";
      const created = await api.addScheduledTask(
        token,
        prompt.trim(),
        type,
        type === "daily" ? `${time}:00` : null,
        type === "interval" ? intervalHours : null,
      );
      if (schedule === "manual") await api.setScheduledTaskEnabled(token, created.id, false);
      setPrompt("");
      onClose();
      onAdded();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 space-y-4 rounded-lg border border-border bg-surface p-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="job-prompt">What should this job do?</Label>
        <Textarea
          id="job-prompt"
          placeholder="e.g. Summarize what's on my plate today"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>When</Label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={schedule === "manual" ? "default" : "outline"} size="sm" onClick={() => setSchedule("manual")}>
            Only when I run it
          </Button>
          <Button type="button" variant={schedule === "daily" ? "default" : "outline"} size="sm" onClick={() => setSchedule("daily")}>
            Every day
          </Button>
          <Button type="button" variant={schedule === "interval" ? "default" : "outline"} size="sm" onClick={() => setSchedule("interval")}>
            Every N hours
          </Button>
        </div>
      </div>

      {schedule === "daily" && (
        <div className="space-y-1.5">
          <Label htmlFor="job-time">Time (UTC)</Label>
          <Input id="job-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-40" />
        </div>
      )}
      {schedule === "interval" && (
        <div className="space-y-1.5">
          <Label htmlFor="job-interval">Every how many hours</Label>
          <Input
            id="job-interval"
            type="number"
            min={1}
            max={168}
            value={intervalHours}
            onChange={(e) => setIntervalHours(Number(e.target.value))}
            className="w-40"
          />
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={busy}>
          {busy ? "Saving…" : "Save job"}
        </Button>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function JobsPage() {
  const { token } = useAuthStore();
  const [jobs, setJobs] = useState<ScheduledTask[] | null>(null);
  const [providers, setProviders] = useState<ProviderCredential[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [quickPrompt, setQuickPrompt] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const provider = providers.find((p) => p.is_active)?.provider ?? providers[0]?.provider ?? null;
  const runner = useRunner(token, provider);

  async function refresh() {
    if (!token) return;
    try {
      setJobs(await api.listScheduledTasks(token));
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        const all = await api.listProviders(token);
        setProviders(all.filter((p) => !p.is_revoked));
      } catch {
        /* provider list is only needed for Run now - the list below still works */
      }
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleToggle(id: string, enabled: boolean) {
    if (!token) return;
    setJobs((prev) => prev?.map((t) => (t.id === id ? { ...t, enabled } : t)) ?? null);
    try {
      await api.setScheduledTaskEnabled(token, id, enabled);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
      await refresh();
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    try {
      await api.deleteScheduledTask(token, id);
      setJobs((prev) => prev?.filter((t) => t.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Jobs</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={JOB_TABS} />
          <p className="mb-5 text-sm text-muted-foreground">
            Work you hand to Missy — run it right now, or save it to run on a schedule.
          </p>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!provider && (
            <Alert className="mb-4">
              <AlertDescription>
                Connect an AI provider under{" "}
                <Link to="/connections" className="underline">
                  AI Providers
                </Link>{" "}
                to run jobs.
              </AlertDescription>
            </Alert>
          )}

          {/* Run something immediately, without saving it first. */}
          <div className="mb-6 rounded-lg border border-border bg-surface p-4">
            <Label htmlFor="quick-run" className="mb-1.5 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" /> Run something now
            </Label>
            <Textarea
              id="quick-run"
              rows={2}
              placeholder="e.g. Summarize my knowledge base notes on pricing"
              value={quickPrompt}
              onChange={(e) => setQuickPrompt(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                disabled={!quickPrompt.trim() || !provider || runner.runningId !== null}
                onClick={() => runner.run("quick", quickPrompt.trim())}
              >
                {runner.runningId === "quick" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Run now
              </Button>
              {runner.runningId !== null && (
                <Button size="sm" variant="outline" onClick={runner.stop}>
                  <Square className="h-3 w-3 fill-current" /> Stop
                </Button>
              )}
            </div>
          </div>

          {(runner.status || runner.output || runner.error) && (
            <div className="mb-6 rounded-lg border border-border bg-surface p-4">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Result</p>
              {runner.status && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> {runner.status}
                </p>
              )}
              {runner.error && <p className="text-sm text-error">{runner.error}</p>}
              {runner.output && <p className="whitespace-pre-wrap text-sm text-foreground">{runner.output}</p>}
            </div>
          )}

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Saved jobs</h2>
            {!addOpen && (
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> New job
              </Button>
            )}
          </div>

          {addOpen && token && <AddJobForm token={token} onAdded={refresh} onClose={() => setAddOpen(false)} />}

          {jobs === null ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState icon={Zap} title="No saved jobs yet" description='Use "New job" to save work you repeat.' />
          ) : (
            <div>
              {jobs.map((job) => (
                <div key={job.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{job.prompt}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {scheduleCaption(job)}
                      {job.enabled && ` · next ${new Date(job.next_run_at).toLocaleString()}`}
                      {job.last_run_at && ` · last ran ${new Date(job.last_run_at).toLocaleString()}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge variant="outline">{job.enabled ? "Scheduled" : "Manual"}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!provider || runner.runningId !== null}
                      onClick={() => runner.run(job.id, job.prompt)}
                    >
                      {runner.runningId === job.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Run now
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleToggle(job.id, !job.enabled)}>
                      {job.enabled ? "Unschedule" : "Schedule"}
                    </Button>
                    <ConfirmDeleteButton confirmText="Permanently delete this job?" onConfirm={() => handleDelete(job.id)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
