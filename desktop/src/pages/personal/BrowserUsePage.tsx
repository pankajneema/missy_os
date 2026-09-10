import { useEffect, useState } from "react";
import { Globe, Plus, Trash2, ShieldCheck, ShieldAlert, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePrototypeValue } from "@/lib/prototype-store";
import { SectionTabs, CONNECTOR_TABS } from "@/components/shared/SectionTabs";
import {
  DEFAULT_POLICY,
  canWritePolicyFile,
  isValidDomain,
  normaliseDomain,
  readPolicyFile,
  serialisePolicy,
  writePolicyFile,
  type BrowserPolicy,
  type DefaultMode,
} from "@/lib/browser-policy";

function DomainList({
  title,
  description,
  domains,
  onAdd,
  onRemove,
  placeholder,
}: {
  title: string;
  description: string;
  domains: string[];
  onAdd: (domain: string) => void;
  onRemove: (domain: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const cleaned = normaliseDomain(draft);
  const valid = isValidDomain(draft);
  const duplicate = valid && domains.includes(cleaned);

  function submit() {
    if (!valid || duplicate) return;
    onAdd(cleaned);
    setDraft("");
  }

  return (
    <div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>

      <div className="mt-3 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={placeholder}
          className="h-8 max-w-xs text-sm"
        />
        <Button size="sm" variant="outline" onClick={submit} disabled={!valid || duplicate}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      {draft.trim() && !valid && (
        <p className="mt-1.5 text-xs text-error">Enter a domain like example.com — not a full page address.</p>
      )}
      {duplicate && <p className="mt-1.5 text-xs text-muted-foreground">{cleaned} is already listed.</p>}

      <div className="mt-3 rounded-md border border-border">
        {domains.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">No sites added yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Domain
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {domains.map((domain) => (
                <tr key={domain} className="border-b border-border/60 last:border-b-0">
                  <td className="px-3 py-2 text-sm text-foreground">{domain}</td>
                  <td className="px-2">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRemove(domain)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        A domain covers its subdomains: <span className="font-mono">example.com</span> also matches{" "}
        <span className="font-mono">mail.example.com</span>.
      </p>
    </div>
  );
}

export function BrowserUsePage() {
  const [policy, setPolicy] = usePrototypeValue<BrowserPolicy>("browser.policy", DEFAULT_POLICY);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [savePath, setSavePath] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inApp = canWritePolicyFile();

  // What's on disk is what the server obeys, so start from that when it exists.
  useEffect(() => {
    if (!inApp) return;
    readPolicyFile().then((onDisk) => {
      if (onDisk) setPolicy(onDisk);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inApp]);

  async function save(next: BrowserPolicy) {
    setPolicy(next);
    if (!inApp) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      setSavePath(await writePolicyFile(next));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (err) {
      setSaveState("failed");
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  const update = (patch: Partial<BrowserPolicy>) => save({ ...policy, ...patch });

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Apps &amp; Connections</h1>
        {saveState === "saved" && (
          <span className="flex items-center gap-1.5 text-xs text-success">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        {saveState === "saving" && <span className="text-xs text-muted-foreground">Saving…</span>}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={CONNECTOR_TABS} />
        </div>
        <div className="mx-auto max-w-2xl space-y-6">
          <p className="text-sm text-muted-foreground">
            Lets Missy open web pages, read them, and click through them on your behalf — during a chat, and inside
            scheduled jobs.
          </p>

          {saveState === "failed" && (
            <Alert variant="destructive">
              <AlertDescription>
                Couldn't write the permissions file, so <strong className="font-medium">nothing changed</strong> for
                Missy — the previous permissions are still in force. {saveError}
              </AlertDescription>
            </Alert>
          )}

          {/* --- the master switch --- */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Globe className="h-4 w-4 text-primary" /> Enable browser use
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  With this off, every page request is refused no matter what the lists below say.
                </p>
              </div>
              <Switch checked={policy.enabled} onCheckedChange={(v) => update({ enabled: v })} />
            </div>
          </div>

          {/* --- default posture --- */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm font-medium text-foreground">Default for all sites</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Choose whether Missy works on all sites by default.
            </p>

            <div className="mt-3 space-y-2">
              {(
                [
                  {
                    value: "allow_all" as DefaultMode,
                    icon: ShieldAlert,
                    label: "Allow all sites",
                    detail: "Missy works everywhere except the sites you block below.",
                  },
                  {
                    value: "block_all" as DefaultMode,
                    icon: ShieldCheck,
                    label: "Block all sites",
                    detail: "Missy works only on the sites you allow below. Safer, and the default.",
                  },
                ] as const
              ).map((option) => {
                const selected = policy.defaultMode === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => update({ defaultMode: option.value })}
                    className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                      selected ? "border-primary bg-accent-soft" : "border-border hover:bg-surface-subtle"
                    }`}
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                    <span>
                      <span className="block text-sm font-medium text-foreground">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.detail}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* --- the lists --- */}
          <div className="rounded-lg border border-border bg-surface p-4">
            {policy.defaultMode === "allow_all" ? (
              <DomainList
                title="Blocked sites"
                description="Missy cannot be used on these sites."
                domains={policy.blocked}
                onAdd={(d) => update({ blocked: [...policy.blocked, d] })}
                onRemove={(d) => update({ blocked: policy.blocked.filter((x) => x !== d) })}
                placeholder="bank.example.com"
              />
            ) : (
              <DomainList
                title="Allowed sites"
                description="Missy can only be used on these sites."
                domains={policy.allowed}
                onAdd={(d) => update({ allowed: [...policy.allowed, d] })}
                onRemove={(d) => update({ allowed: policy.allowed.filter((x) => x !== d) })}
                placeholder="wikipedia.org"
              />
            )}
          </div>

          {/* --- what is enforced no matter what --- */}
          <div className="rounded-lg border border-border bg-surface-subtle/60 p-4">
            <p className="text-sm font-medium text-foreground">Always refused</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              These hold even on “Allow all sites”, because the only thing that would ask for them is an instruction
              hidden in a web page:
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>• Cloud metadata addresses (169.254.169.254 and friends), which hand out credentials</li>
              <li>• Your own machine and local network — localhost, 127.0.0.1, 192.168.x.x</li>
              <li>• Anything that isn't http or https, including file:// and javascript:</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Redirects are re-checked at the destination, so an allowed site can't forward Missy to a blocked one.
            </p>
          </div>

          {/* --- honesty about how this reaches the server --- */}
          {inApp ? (
            <p className="text-xs text-muted-foreground">
              Saved to <span className="font-mono">{savePath ?? "~/.missy/browser-policy.json"}</span>, which the
              browser MCP server reads on every request — changes take effect immediately, with no restart.
            </p>
          ) : (
            <div className="rounded-lg border border-warning/40 bg-warning-soft/40 p-4">
              <p className="text-sm font-medium text-foreground">Running in a browser tab, so this can't save itself</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                In the desktop app these settings are written straight to{" "}
                <span className="font-mono">~/.missy/browser-policy.json</span>. Here, save this yourself to that path —
                until you do, the permissions Missy actually uses are whatever is already in that file.
              </p>
              <pre className="mt-3 max-h-48 overflow-auto rounded bg-surface p-3 font-mono text-[11px] text-foreground">
                {serialisePolicy(policy)}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  navigator.clipboard.writeText(serialisePolicy(policy));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy JSON"}
              </Button>
            </div>
          )}

          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground">Connecting it</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Browsing runs through a local MCP server. Add it once under MCP Servers as a stdio command:
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-surface-subtle p-3 font-mono text-[11px] text-foreground">
              node /Users/mac/pnkj/missy_os/mcp-servers/browser/src/index.js
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              Stdio servers are gated by <span className="font-mono">ALLOW_MCP_STDIO_SERVERS</span> on the backend — if
              it's unset, the server won't be started at all.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
