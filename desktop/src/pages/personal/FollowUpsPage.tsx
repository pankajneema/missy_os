import { useState } from "react";
import { Check, ListTodo, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeCollection, newId } from "@/lib/prototype-store";
import { ImportPanel, ImportButton } from "@/components/shared/ImportPanel";
import { todayStr, type FollowUp, type FollowUpKind } from "@/lib/daily-life";

function AddForm({ onAdd }: { onAdd: (f: FollowUp) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<FollowUpKind>("follow_up");
  const [followUpDate, setFollowUpDate] = useState("");
  const [notes, setNotes] = useState("");

  function handleAdd() {
    if (!title.trim()) return;
    onAdd({
      id: newId(),
      title: title.trim(),
      kind,
      waitingSince: todayStr(),
      followUpDate: followUpDate || undefined,
      notes: notes.trim() || undefined,
      resolved: false,
      createdAt: new Date().toISOString(),
    });
    setTitle("");
    setNotes("");
    setFollowUpDate("");
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="space-y-1.5">
        <Label htmlFor="fu-title">What are you waiting on, or what did you commit to?</Label>
        <Input id="fu-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder='e.g. "Client approval" or "Call John tomorrow"' />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as FollowUpKind)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="follow_up">Follow-up (waiting on someone)</SelectItem>
              <SelectItem value="commitment">Commitment (I promised)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fu-date">Follow up on</Label>
          <Input id="fu-date" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
        </div>
      </div>
      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
      <Button size="sm" onClick={handleAdd} disabled={!title.trim()}>
        <Plus className="h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}

export function FollowUpsPage() {
  const { items, add, update, remove } = usePrototypeCollection<FollowUp>("daily.followups");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const active = items.filter((f) => !f.resolved).sort((a, b) => (a.followUpDate ?? "9999").localeCompare(b.followUpDate ?? "9999"));
  const resolved = items.filter((f) => f.resolved);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Follow-ups</h1>
        <div className="flex items-center gap-2">
          <ImportButton onClick={() => setImportOpen(true)} />
          <Button size="sm" onClick={() => setAddOpen((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <p className="mb-1 text-sm text-muted-foreground">
            Small commitments and things you're waiting on — so they don't get forgotten.
          </p>
          <ImportPanel
            label="follow-ups"
            open={importOpen}
            onClose={() => setImportOpen(false)}
            placeholder={"Client approval\nWaiting on design sign-off\nChase the invoice"}
            onImport={(lines) =>
              lines.forEach((title) =>
                add({
                  id: newId(),
                  title,
                  kind: "follow_up",
                  waitingSince: todayStr(),
                  resolved: false,
                  createdAt: new Date().toISOString(),
                }),
              )
            }
          />
          <PrototypeNotice />

          {addOpen && (
            <div className="mb-6">
              <AddForm
                onAdd={(f) => {
                  add(f);
                  setAddOpen(false);
                }}
              />
            </div>
          )}

          {active.length === 0 && resolved.length === 0 ? (
            <EmptyState icon={ListTodo} title="Nothing to follow up on" description='Use "Add" above.' />
          ) : (
            <>
              <div>
                {active.map((f) => (
                  <div key={f.id} className="flex items-start justify-between gap-3 border-b border-border/60 py-3 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{f.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <Badge variant="outline">{f.kind === "commitment" ? "Commitment" : "Follow-up"}</Badge>
                        <span>Waiting since {f.waitingSince}</span>
                        {f.followUpDate && <span>· Follow up {f.followUpDate}</span>}
                      </div>
                      {f.notes && <p className="mt-1 text-sm text-foreground/80">{f.notes}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => update(f.id, { resolved: true })} title="Mark resolved">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(f.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {resolved.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Resolved</p>
                  {resolved.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm text-muted-foreground last:border-b-0">
                      <span className="line-through">{f.title}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(f.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
