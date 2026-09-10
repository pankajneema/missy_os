import { useEffect, useState } from "react";
import { Plug } from "lucide-react";
import * as api from "@/lib/api";
import type { ProviderCredential } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";

const CUSTOM_OPTION = "__custom__";

interface ProviderMeta {
  key: string;
  label: string;
  models: string[];
  keyUrl: string;
  helpText: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    key: "openai",
    label: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
    keyUrl: "https://platform.openai.com/api-keys",
    helpText: "A standard API key, starts with sk-...",
  },
  {
    key: "anthropic",
    label: "Anthropic (Claude)",
    models: ["claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
    keyUrl: "https://console.anthropic.com/settings/keys",
    helpText:
      "A Developer Console API key, starts with sk-ant-api03-... A Claude.ai login or an OAuth/claude setup-token credential is a different thing and won't work here.",
  },
  {
    key: "gemini",
    label: "Google (Gemini)",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
    keyUrl: "https://aistudio.google.com/apikey",
    helpText: "Free API key from Google AI Studio.",
  },
  {
    key: "groq",
    label: "Groq",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"],
    keyUrl: "https://console.groq.com/keys",
    helpText: "One key covers both chat and voice — the same gsk-... key is used for speech-to-text (Whisper).",
  },
];
const PROVIDER_META = Object.fromEntries(PROVIDERS.map((p) => [p.key, p]));

function AddConnectionForm({ token, onAdded }: { token: string; onAdded: () => void }) {
  const [providerKey, setProviderKey] = useState(PROVIDERS[0].key);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelChoice, setModelChoice] = useState(PROVIDERS[0].models[0]);
  const [customModel, setCustomModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "verifying" | "saving">("idle");
  // The check runs a chat completion, so a deprecated or unavailable *model*
  // fails a key that is otherwise perfectly good - and for Groq that also
  // blocks voice, which never needed the chat model at all.
  const [testFailed, setTestFailed] = useState(false);

  const meta = PROVIDER_META[providerKey];

  function handleProviderChange(key: string) {
    setProviderKey(key);
    setModelChoice(PROVIDER_META[key].models[0]);
    setCustomModel("");
    setTestFailed(false);
    setError(null);
  }

  async function saveCredential(modelName: string) {
    setStatus("saving");
    await api.saveProvider(token, providerKey, apiKey, modelName, name.trim() || null);
    setName("");
    setApiKey("");
    setTestFailed(false);
    setError(null);
    onAdded();
  }

  async function handleSave() {
    const modelName = modelChoice === CUSTOM_OPTION ? customModel.trim() : modelChoice;
    if (!apiKey || !modelName) {
      setError("Both API key and model are required.");
      return;
    }
    setError(null);
    setTestFailed(false);
    setStatus("verifying");
    try {
      const result = await api.testProvider(token, providerKey, apiKey, modelName);
      if (!result.success) {
        setError(`That didn't work: ${result.message}`);
        setTestFailed(true);
        setStatus("idle");
        return;
      }
      await saveCredential(modelName);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setStatus("idle");
    }
  }

  async function handleSaveAnyway() {
    const modelName = modelChoice === CUSTOM_OPTION ? customModel.trim() : modelChoice;
    setStatus("saving");
    try {
      await saveCredential(modelName);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="space-y-1.5">
        <Label>Provider</Label>
        <Select value={providerKey} onValueChange={handleProviderChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            Get your API key
          </a>{" "}
          · {meta.helpText}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {testFailed && (
        <Alert>
          <AlertDescription className="text-xs">
            That check runs a <strong className="font-medium text-foreground">chat</strong> request against the model
            above, so a retired or unavailable model fails a key that's otherwise fine.
            {providerKey === "groq" && " Speech-to-text uses the same key but not that model, so voice can still work."}{" "}
            Save it anyway if you're confident the key is right.
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={handleSaveAnyway} disabled={status !== "idle"}>
                Save without the check
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="conn-name">Name (optional label, e.g. "Personal" or "Work")</Label>
        <Input id="conn-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="conn-key">API key</Label>
        <Input id="conn-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Model</Label>
        <Select value={modelChoice} onValueChange={setModelChoice}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {meta.models.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_OPTION}>Custom / other…</SelectItem>
          </SelectContent>
        </Select>
        {modelChoice === CUSTOM_OPTION && (
          <Input
            placeholder="e.g. gemini-2.5-flash"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
          />
        )}
      </div>

      <Button onClick={handleSave} disabled={status !== "idle"}>
        {status === "verifying" ? "Verifying connection…" : status === "saving" ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function ConnectionRow({
  credential,
  onRevoke,
  onDelete,
}: {
  credential: ProviderCredential;
  onRevoke: (provider: string, revoked: boolean) => void;
  onDelete: (provider: string) => void;
}) {
  const meta = PROVIDER_META[credential.provider];
  const displayName = credential.name || meta?.label || credential.provider;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{meta?.label ?? credential.provider} · added via API Connections</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            credential.is_revoked ? "bg-error-soft text-error" : "bg-success-soft text-success"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {credential.is_revoked ? "Revoked" : "Active"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">API key</p>
          <p className="mt-0.5 font-mono text-xs text-foreground">{credential.masked_api_key}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Model</p>
          <p className="mt-0.5 font-mono text-xs text-foreground">{credential.model_name}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onRevoke(credential.provider, !credential.is_revoked)}>
          {credential.is_revoked ? "Unrevoke" : "Revoke"}
        </Button>
        <ConfirmDeleteButton
          confirmText={`Permanently delete this ${meta?.label ?? credential.provider} connection?`}
          onConfirm={() => onDelete(credential.provider)}
        />
      </div>
    </div>
  );
}

export function ApiConnectionsPage() {
  const { token } = useAuthStore();
  const [connections, setConnections] = useState<ProviderCredential[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    try {
      setConnections(await api.listProviders(token));
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleRevoke(provider: string, revoked: boolean) {
    if (!token) return;
    try {
      await api.setProviderRevoked(token, provider, revoked);
      await refresh();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    }
  }

  async function handleDelete(provider: string) {
    if (!token) return;
    try {
      await api.deleteProvider(token, provider);
      setConnections((prev) => prev?.filter((c) => c.provider !== provider) ?? null);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">AI Providers</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <p className="mb-5 text-sm text-muted-foreground">
            Every LLM credential you've connected — revoke one to stop Missy using it without deleting it, or delete
            it entirely.
          </p>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {token && <AddConnectionForm token={token} onAdded={refresh} />}

          <div className="mt-8 space-y-3">
            {connections === null ? (
              <>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </>
            ) : connections.length === 0 ? (
              <EmptyState icon={Plug} title="Nothing connected yet" description='Use "Add a connection" above.' />
            ) : (
              connections.map((c) => (
                <ConnectionRow key={c.id} credential={c} onRevoke={handleRevoke} onDelete={handleDelete} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
