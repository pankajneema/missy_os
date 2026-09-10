import { useEffect, useState } from "react";
import { MessageCircle, Plus, Trash2, Check, Copy, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SectionTabs, CONNECTOR_TABS } from "@/components/shared/SectionTabs";
import { usePrototypeValue } from "@/lib/prototype-store";
import { canWritePolicyFile } from "@/lib/browser-policy";
import {
  DEFAULT_WHATSAPP_POLICY,
  formatNumber,
  isValidNumber,
  normaliseNumber,
  readWhatsAppPolicy,
  serialiseWhatsAppPolicy,
  writeWhatsAppPolicy,
  type WhatsAppPolicy,
} from "@/lib/whatsapp-policy";

function NumberField({ label, value, onChange, min, max, suffix }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
          className="h-7 w-16 text-sm"
        />
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </span>
    </label>
  );
}

export function WhatsAppPage() {
  const [policy, setPolicy] = usePrototypeValue<WhatsAppPolicy>("whatsapp.policy", DEFAULT_WHATSAPP_POLICY);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "failed">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftNumber, setDraftNumber] = useState("");
  const inApp = canWritePolicyFile();

  useEffect(() => {
    if (!inApp) return;
    readWhatsAppPolicy().then((onDisk) => {
      if (onDisk) setPolicy(onDisk);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inApp]);

  async function save(next: WhatsAppPolicy) {
    setPolicy(next);
    if (!inApp) return;
    setSaveError(null);
    try {
      await writeWhatsAppPolicy(next);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (err) {
      setSaveState("failed");
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  const update = (patch: Partial<WhatsAppPolicy>) => save({ ...policy, ...patch });

  const cleaned = normaliseNumber(draftNumber);
  const canAdd = isValidNumber(draftNumber) && !policy.allowlist.some((c) => c.number === cleaned);

  function addContact() {
    if (!canAdd) return;
    update({ allowlist: [...policy.allowlist, { number: cleaned, name: draftName.trim() }] });
    setDraftName("");
    setDraftNumber("");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Apps &amp; Connections</h1>
        {saveState === "saved" && (
          <span className="flex items-center gap-1.5 text-xs text-success">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={CONNECTOR_TABS} />
        </div>
        <div className="mx-auto max-w-2xl space-y-6">
          <p className="text-sm text-muted-foreground">
            Lets Missy read your WhatsApp and reply to the people you list — during a chat, and inside scheduled flows.
          </p>

          {/* --- the two things worth knowing before switching this on --- */}
          <Alert variant="destructive">
            <AlertDescription className="space-y-2 text-xs">
              <p className="flex items-start gap-1.5">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong className="font-medium">This runs your personal account through automation, which is
                  against WhatsApp's terms.</strong>{" "}
                  Numbers doing automated messaging do get banned. The limits below exist to keep the behaviour
                  human-shaped, but they reduce the risk — they don't remove it. Your number, your call.
                </span>
              </p>
              <p>
                Replies are written in your voice with nothing marking them as automatic, as you asked. The people you
                list will believe they're hearing from you.
              </p>
            </AlertDescription>
          </Alert>

          {saveState === "failed" && (
            <Alert variant="destructive">
              <AlertDescription>
                Couldn't write the rules file, so <strong className="font-medium">nothing changed</strong> — the
                previous rules are still in force. {saveError}
              </AlertDescription>
            </Alert>
          )}

          {/* --- master switch --- */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <MessageCircle className="h-4 w-4 text-success" /> Auto-reply
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  With this off Missy can still read WhatsApp, but never sends anything.
                </p>
              </div>
              <Switch checked={policy.enabled} onCheckedChange={(v) => update({ enabled: v })} />
            </div>
          </div>

          {/* --- who --- */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm font-medium text-foreground">Who Missy may reply to</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nobody else is ever answered. An empty list means Missy stays silent with everyone.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Name (e.g. Ma)"
                className="h-8 w-32 text-sm"
              />
              <Input
                value={draftNumber}
                onChange={(e) => setDraftNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addContact()}
                placeholder="+91 98765 43210"
                className="h-8 w-44 text-sm"
              />
              <Button size="sm" variant="outline" onClick={addContact} disabled={!canAdd}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            {draftNumber.trim() && !isValidNumber(draftNumber) && (
              <p className="mt-1.5 text-xs text-error">That doesn't look like a phone number.</p>
            )}

            <div className="mt-3 rounded-md border border-border">
              {policy.allowlist.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Nobody added yet — Missy won't reply to anyone.
                </p>
              ) : (
                policy.allowlist.map((contact) => (
                  <div
                    key={contact.number}
                    className="flex items-center justify-between border-b border-border/60 px-3 py-2 last:border-b-0"
                  >
                    <span className="text-sm text-foreground">
                      {contact.name || "Unnamed"}{" "}
                      <span className="font-mono text-xs text-muted-foreground">{formatNumber(contact.number)}</span>
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() =>
                        update({ allowlist: policy.allowlist.filter((c) => c.number !== contact.number) })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* --- how often --- */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm font-medium text-foreground">Pace</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              What keeps it looking like a person: replies that don't arrive instantly, don't repeat endlessly, and
              stop at night.
            </p>
            <div className="mt-2 divide-y divide-border/60">
              <NumberField
                label="Most replies to one person per hour"
                value={policy.maxRepliesPerContactPerHour}
                onChange={(v) => update({ maxRepliesPerContactPerHour: v })}
                min={1}
                max={20}
                suffix="replies"
              />
              <NumberField
                label="Most replies overall per hour"
                value={policy.maxRepliesPerHour}
                onChange={(v) => update({ maxRepliesPerHour: v })}
                min={1}
                max={100}
                suffix="replies"
              />
              <NumberField
                label="Wait at least"
                value={policy.minDelaySeconds}
                onChange={(v) => update({ minDelaySeconds: v })}
                min={0}
                max={120}
                suffix="seconds"
              />
              <NumberField
                label="Wait at most"
                value={policy.maxDelaySeconds}
                onChange={(v) => update({ maxDelaySeconds: v })}
                min={1}
                max={300}
                suffix="seconds"
              />
              <NumberField
                label="Go quiet from"
                value={policy.quietHoursStart}
                onChange={(v) => update({ quietHoursStart: v })}
                min={0}
                max={23}
                suffix=":00"
              />
              <NumberField
                label="Start again at"
                value={policy.quietHoursEnd}
                onChange={(v) => update({ quietHoursEnd: v })}
                min={0}
                max={23}
                suffix=":00"
              />
            </div>
          </div>

          {/* --- what it will never do --- */}
          <div className="rounded-lg border border-border bg-surface-subtle/60 p-4">
            <p className="text-sm font-medium text-foreground">What it never does</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>• Message anyone first — it only ever replies to a message you received</li>
              <li>• Reply to group chats, or to anyone not on the list above</li>
              <li>• Send a one-time code, password, card number or API key, even if asked to</li>
              <li>• Send during quiet hours, or past the limits above</li>
            </ul>
          </div>

          {/* --- setup --- */}
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground">Connecting it</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pair once by scanning a QR code with your phone — same as WhatsApp Web:
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-surface-subtle p-3 font-mono text-[11px] text-foreground">
              cd /Users/mac/pnkj/missy_os/mcp-servers/whatsapp{"\n"}npm run pair
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">Then add it under MCP Servers as a stdio command:</p>
            <pre className="mt-2 overflow-x-auto rounded bg-surface-subtle p-3 font-mono text-[11px] text-foreground">
              node /Users/mac/pnkj/missy_os/mcp-servers/whatsapp/src/index.js
            </pre>
          </div>

          {inApp ? (
            <p className="text-xs text-muted-foreground">
              Saved to <span className="font-mono">~/.missy/whatsapp-policy.json</span>, re-read on every send — changes
              take effect immediately.
            </p>
          ) : (
            <div className="rounded-lg border border-warning/40 bg-warning-soft/40 p-4">
              <p className="text-sm font-medium text-foreground">Running in a browser tab, so this can't save itself</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Save this to <span className="font-mono">~/.missy/whatsapp-policy.json</span> yourself. Until you do,
                the rules in force are whatever that file already says.
              </p>
              <pre className="mt-3 max-h-48 overflow-auto rounded bg-surface p-3 font-mono text-[11px] text-foreground">
                {serialiseWhatsAppPolicy(policy)}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  navigator.clipboard.writeText(serialiseWhatsAppPolicy(policy));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy JSON"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
