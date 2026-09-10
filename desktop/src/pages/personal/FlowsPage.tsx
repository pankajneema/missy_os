import { useEffect, useState } from "react";
import { Plus, Trash2, Play, GitBranch, Clock, Hand, Repeat, ChevronDown, ChevronRight, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SectionTabs, JOB_TABS } from "@/components/shared/SectionTabs";
import { usePrototypeCollection, newId } from "@/lib/prototype-store";
import { useAuthStore } from "@/store/auth-store";
import * as api from "@/lib/api";
import {
  INTERVAL_CHOICES,
  STEP_KINDS,
  compileFlow,
  describeTrigger,
  flowProblems,
  localTimeToUtc,
  newFlow,
  type Flow,
  type FlowStep,
  type StepKind,
  type TriggerKind,
} from "@/lib/flows";

const TRIGGER_OPTIONS: { kind: TriggerKind; icon: typeof Hand; label: string; detail: string }[] = [
  { kind: "manual", icon: Hand, label: "When I run it", detail: "Nothing happens on its own." },
  { kind: "interval", icon: Repeat, label: "On a repeat", detail: "Runs over and over, as often as you choose." },
  { kind: "daily", icon: Clock, label: "Once a day", detail: "Runs at the same time every day." },
];

function StepRow({
  step,
  index,
  onChange,
  onRemove,
}: {
  step: FlowStep;
  index: number;
  onChange: (patch: Partial<FlowStep>) => void;
  onRemove: () => void;
}) {
  const kind = STEP_KINDS.find((k) => k.value === step.kind)!;
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-[11px] font-medium text-muted-foreground">
          {index + 1}
        </span>
        <div className="flex gap-1">
          {STEP_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => onChange({ kind: k.value as StepKind })}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                step.kind === k.value
                  ? "bg-accent-soft text-primary"
                  : "text-muted-foreground hover:bg-surface-subtle"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>

      <Input
        value={step.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder={kind.example}
        className="mt-2 h-8 text-sm"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">{kind.hint}</p>

      {step.kind === "condition" && (
        <Input
          value={step.otherwise ?? ""}
          onChange={(e) => onChange({ otherwise: e.target.value })}
          placeholder="If not true — leave it for me (optional)"
          className="mt-2 h-8 text-sm"
        />
      )}
    </div>
  );
}

function FlowEditor({
  flow,
  onChange,
  onClose,
  onDelete,
}: {
  flow: Flow;
  onChange: (patch: Partial<Flow>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const problems = flowProblems(flow);

  const setStep = (id: string, patch: Partial<FlowStep>) =>
    onChange({ steps: flow.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const addStep = (kind: StepKind) =>
    onChange({ steps: [...flow.steps, { id: newId(), kind, text: "" }] });

  return (
    <div className="rounded-lg border border-border bg-surface-subtle/50 p-4">
      <Input
        value={flow.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Name this flow — e.g. Family WhatsApp watch"
        className="h-9 text-sm font-medium"
      />
      <Input
        value={flow.goal ?? ""}
        onChange={(e) => onChange({ goal: e.target.value })}
        placeholder="What is it for? (optional)"
        className="mt-2 h-8 text-sm"
      />

      {/* --- when --- */}
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">When it runs</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {TRIGGER_OPTIONS.map((option) => {
          const selected = flow.trigger.kind === option.kind;
          const Icon = option.icon;
          return (
            <button
              key={option.kind}
              type="button"
              onClick={() =>
                onChange({
                  trigger: {
                    kind: option.kind,
                    everyMinutes: option.kind === "interval" ? (flow.trigger.everyMinutes ?? 60) : undefined,
                    atTime: option.kind === "daily" ? (flow.trigger.atTime ?? "09:00") : undefined,
                  },
                })
              }
              className={`rounded-md border p-2.5 text-left transition-colors ${
                selected ? "border-primary bg-accent-soft" : "border-border bg-surface hover:bg-surface-subtle"
              }`}
            >
              <Icon className={`h-4 w-4 ${selected ? "text-primary" : "text-muted-foreground"}`} />
              <span className="mt-1 block text-xs font-medium text-foreground">{option.label}</span>
              <span className="block text-[11px] text-muted-foreground">{option.detail}</span>
            </button>
          );
        })}
      </div>

      {flow.trigger.kind === "interval" && (
        <select
          value={flow.trigger.everyMinutes ?? 60}
          onChange={(e) => onChange({ trigger: { ...flow.trigger, everyMinutes: Number(e.target.value) } })}
          className="mt-2 h-8 rounded-md border border-border bg-surface px-2 text-sm text-foreground"
        >
          {INTERVAL_CHOICES.map((c) => (
            <option key={c.minutes} value={c.minutes}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      {flow.trigger.kind === "daily" && (
        <Input
          type="time"
          value={flow.trigger.atTime ?? "09:00"}
          onChange={(e) => onChange({ trigger: { ...flow.trigger, atTime: e.target.value } })}
          className="mt-2 h-8 w-32 text-sm"
        />
      )}

      {/* --- steps --- */}
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Steps</p>
      <div className="mt-2 space-y-2">
        {flow.steps.map((step, i) => (
          <StepRow
            key={step.id}
            step={step}
            index={i}
            onChange={(patch) => setStep(step.id, patch)}
            onRemove={() => onChange({ steps: flow.steps.filter((s) => s.id !== step.id) })}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {STEP_KINDS.map((k) => (
          <Button key={k.value} size="sm" variant="outline" onClick={() => addStep(k.value)}>
            <Plus className="h-3 w-3" /> {k.label}
          </Button>
        ))}
      </div>

      {problems.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {problems.map((p) => (
            <li key={p} className="text-xs text-warning">
              • {p}
            </li>
          ))}
        </ul>
      )}

      {/* --- exactly what will run --- */}
      <button
        type="button"
        onClick={() => setShowPrompt((v) => !v)}
        className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {showPrompt ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        What Missy actually receives
      </button>
      {showPrompt && (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-surface p-3 font-mono text-[11px] text-foreground">
          {compileFlow(flow)}
        </pre>
      )}

      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>
    </div>
  );
}

export function FlowsPage() {
  const { token } = useAuthStore();
  const { items: flows, add, update, remove } = usePrototypeCollection<Flow>("work.flows");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [runOutput, setRunOutput] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<api.ScheduledTask[]>([]);

  useEffect(() => {
    if (!token) return;
    api.listScheduledTasks(token).then(setTasks).catch(() => setTasks([]));
  }, [token]);

  /** Creates (or replaces) the real backend scheduled task behind this flow. */
  async function schedule(flow: Flow, enabled: boolean) {
    if (!token) return;
    setBusyId(flow.id);
    setError(null);
    try {
      if (flow.scheduledTaskId) {
        await api.deleteScheduledTask(token, flow.scheduledTaskId).catch(() => {
          /* already gone */
        });
      }
      if (!enabled || flow.trigger.kind === "manual") {
        update(flow.id, { enabled: false, scheduledTaskId: undefined });
      } else {
        const created =
          flow.trigger.kind === "daily"
            ? await api.addScheduledTask(token, compileFlow(flow), "daily", localTimeToUtc(flow.trigger.atTime ?? "09:00"))
            : await api.addScheduledTask(token, compileFlow(flow), "interval", null, null, flow.trigger.everyMinutes ?? 60);
        update(flow.id, { enabled: true, scheduledTaskId: created.id });
      }
      setTasks(await api.listScheduledTasks(token));
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Couldn't save the schedule.");
      update(flow.id, { enabled: false });
    } finally {
      setBusyId(null);
    }
  }

  /** Runs the flow now, through the same agent the scheduler uses. */
  async function runNow(flow: Flow) {
    if (!token) return;
    setBusyId(flow.id);
    setError(null);
    setRunOutput((prev) => ({ ...prev, [flow.id]: "" }));
    try {
      const providers = (await api.listProviders(token)).filter((p) => !p.is_revoked);
      const provider = providers.find((p) => p.is_active)?.provider ?? providers[0]?.provider;
      if (!provider) throw new api.ApiError("Connect an AI provider first — a flow needs one to run.");

      const stored = localStorage.getItem("missy.flowsConversationId");
      const conversations = await api.listConversations(token);
      const conversationId =
        stored && conversations.some((c) => c.id === stored) ? stored : (await api.createConversation(token)).id;
      localStorage.setItem("missy.flowsConversationId", conversationId);

      let text = "";
      for await (const event of api.streamMessage(token, conversationId, compileFlow(flow), provider)) {
        if (event.type === "token") {
          text += event.text;
          setRunOutput((prev) => ({ ...prev, [flow.id]: text }));
        } else if (event.type === "error") {
          throw new api.ApiError(event.detail);
        }
      }
      update(flow.id, { lastRunAt: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "The run failed.");
    } finally {
      setBusyId(null);
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

          <div className="mb-4 flex items-start justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              A job written as steps. Missy runs them in order — on a repeat, once a day, or only when you say.
            </p>
            <Button
              size="sm"
              onClick={() => {
                const flow = newFlow(newId());
                add(flow);
                setEditingId(flow.id);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> New flow
            </Button>
          </div>

          <Alert className="mb-4">
            <AlertDescription className="text-xs">
              Steps aren't run by a workflow engine — they're compiled into one instruction that the same agent behind
              chat carries out, using whatever tools it has. So a flow can only do what Missy can already do: connect
              the tools it needs under Apps &amp; Connections first. Open{" "}
              <span className="font-medium text-foreground">What Missy actually receives</span> on any flow to see
              exactly what gets sent.
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {flows.length === 0 && (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <GitBranch className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm text-foreground">No flows yet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Try: check WhatsApp every 10 minutes → only if it's family → reply → tell me.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {flows.map((flow) => {
              const task = tasks.find((t) => t.id === flow.scheduledTaskId);
              const problems = flowProblems(flow);
              const output = runOutput[flow.id];

              if (editingId === flow.id) {
                return (
                  <FlowEditor
                    key={flow.id}
                    flow={flow}
                    onChange={(patch) => update(flow.id, patch)}
                    onClose={() => setEditingId(null)}
                    onDelete={async () => {
                      if (flow.scheduledTaskId && token) {
                        await api.deleteScheduledTask(token, flow.scheduledTaskId).catch(() => {});
                      }
                      remove(flow.id);
                      setEditingId(null);
                    }}
                  />
                );
              }

              return (
                <div key={flow.id} className="rounded-lg border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" className="min-w-0 text-left" onClick={() => setEditingId(flow.id)}>
                      <p className="truncate text-sm font-medium text-foreground">{flow.name || "Untitled flow"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {describeTrigger(flow.trigger)} · {flow.steps.filter((s) => s.text.trim()).length} step
                        {flow.steps.filter((s) => s.text.trim()).length === 1 ? "" : "s"}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === flow.id || problems.length > 0}
                        onClick={() => runNow(flow)}
                      >
                        {busyId === flow.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        Run now
                      </Button>
                      {flow.trigger.kind !== "manual" && (
                        <Switch
                          checked={flow.enabled}
                          disabled={busyId === flow.id || problems.length > 0}
                          onCheckedChange={(v) => schedule(flow, v)}
                        />
                      )}
                    </div>
                  </div>

                  {flow.steps.filter((s) => s.text.trim()).length > 0 && (
                    <ol className="mt-2.5 space-y-0.5 border-l border-border pl-3">
                      {flow.steps
                        .filter((s) => s.text.trim())
                        .map((s) => (
                          <li key={s.id} className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {STEP_KINDS.find((k) => k.value === s.kind)!.label}
                            </span>{" "}
                            {s.text}
                          </li>
                        ))}
                    </ol>
                  )}

                  {problems.length > 0 && (
                    <p className="mt-2 text-xs text-warning">Not runnable yet: {problems.join(" ")}</p>
                  )}

                  {flow.enabled && task && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-success">
                      <Check className="h-3 w-3" /> Scheduled on the server · next run{" "}
                      {new Date(task.next_run_at).toLocaleString()}
                    </p>
                  )}

                  {output && (
                    <div className="mt-3 rounded-md border border-border bg-surface-subtle/60 p-3">
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Last run
                      </p>
                      <p className="whitespace-pre-wrap text-xs text-foreground">{output}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
