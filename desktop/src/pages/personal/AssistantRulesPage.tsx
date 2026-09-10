import { useState } from "react";
import { Plus, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeCollection, newId } from "@/lib/prototype-store";
import { SectionTabs, ASSISTANT_TABS } from "@/components/shared/SectionTabs";

type RuleLevel = "Strict" | "Important" | "Preference";

interface Rule {
  id: string;
  text: string;
  level: RuleLevel;
}

const LEVEL_STYLES: Record<RuleLevel, string> = {
  Strict: "bg-error-soft text-error",
  Important: "bg-warning-soft text-warning",
  Preference: "bg-muted text-muted-foreground",
};

const LEVEL_HELP: Record<RuleLevel, string> = {
  Strict: "Must always follow",
  Important: "Should normally follow",
  Preference: "Follow when possible",
};

const EXAMPLES = [
  "Never send an email without asking me.",
  "Never delete anything without confirmation.",
  "Never make purchases for me.",
  "Always ask before contacting someone.",
  "Don't make assumptions when information is missing.",
  "If you are unsure, tell me.",
];

export function AssistantRulesPage() {
  const { items, add, remove } = usePrototypeCollection<Rule>("assistant.rules");
  const [text, setText] = useState("");
  const [level, setLevel] = useState<RuleLevel>("Important");

  function handleAdd(value = text) {
    if (!value.trim()) return;
    add({ id: newId(), text: value.trim(), level });
    setText("");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">My Rules for the Assistant</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={ASSISTANT_TABS} />
          <p className="mb-1 text-sm text-muted-foreground">Permanent instructions your assistant should follow.</p>
          <PrototypeNotice>
            <strong className="font-medium text-foreground">Prototype:</strong> rules are saved on this device, but
            Missy doesn't yet enforce them in chat — there's no rules engine wired into the agent yet.
          </PrototypeNotice>

          <div className="flex flex-wrap items-start gap-2 rounded-lg border border-border bg-surface p-4">
            <Input
              placeholder='e.g. "Never send an email without asking me."'
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="min-w-[200px] flex-1"
            />
            <div className="flex shrink-0 gap-2">
              <Select value={level} onValueChange={(v) => setLevel(v as RuleLevel)}>
                <SelectTrigger className="w-36 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Strict">Strict</SelectItem>
                  <SelectItem value="Important">Important</SelectItem>
                  <SelectItem value="Preference">Preference</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => handleAdd()} disabled={!text.trim()}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </div>

          {items.length === 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleAdd(ex)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  + {ex}
                </button>
              ))}
            </div>
          )}

          <div className="mt-8">
            {items.length === 0 ? (
              <EmptyState icon={ShieldAlert} title="No rules yet" description="Add one above, or tap an example." />
            ) : (
              <div>
                {items.map((r) => (
                  <div key={r.id} className="group flex items-start gap-3 border-b border-border/60 py-3 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">{r.text}</p>
                      <Badge className={`mt-1 ${LEVEL_STYLES[r.level]}`} variant="outline" title={LEVEL_HELP[r.level]}>
                        {r.level}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => remove(r.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
