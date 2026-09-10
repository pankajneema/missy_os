import { useState } from "react";
import { Clock3, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { useSessionValue, newId } from "@/lib/prototype-store";
import { useMemories } from "@/lib/use-memories";
import { SectionTabs, MEMORY_TABS } from "@/components/shared/SectionTabs";

interface SessionNote {
  id: string;
  text: string;
}

export function MemoryTemporaryPage() {
  const [notes, setNotes] = useSessionValue<SessionNote[]>("session-context", []);
  const [text, setText] = useState("");
  const { addMemory } = useMemories();
  const [savedIds, setSavedIds] = useState<string[]>([]);

  function handleAdd() {
    if (!text.trim()) return;
    setNotes((prev) => [{ id: newId(), text: text.trim() }, ...prev]);
    setText("");
  }

  function discard(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  async function savePermanently(note: SessionNote) {
    await addMemory(note.text, "episodic");
    setSavedIds((prev) => [...prev, note.id]);
    discard(note.id);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Session Context</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={MEMORY_TABS} />
          <p className="mb-1 text-sm text-muted-foreground">
            Context that should only apply to this conversation — like "For this conversation, assume I'm working on
            a startup pitch."
          </p>
          <PrototypeNotice>
            Cleared automatically when you close this tab. <strong className="font-medium text-foreground">Save permanently</strong> is
            real — it adds the note to your actual Memory.
          </PrototypeNotice>

          {savedIds.length > 0 && (
            <Alert className="mb-4 border-success-soft bg-success-soft">
              <AlertDescription className="text-success">Saved to Memory.</AlertDescription>
            </Alert>
          )}

          <div className="mb-6 flex flex-wrap gap-2">
            <Input
              placeholder={'e.g. "For this conversation, assume I\'m working on a startup pitch."'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="min-w-[200px] flex-1"
            />
            <Button onClick={handleAdd} disabled={!text.trim()}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>

          {notes.length === 0 ? (
            <EmptyState icon={Clock3} title="No session context yet" description="Add something above for this session only." />
          ) : (
            <div>
              {notes.map((n) => (
                <div key={n.id} className="flex items-start justify-between gap-3 border-b border-border/60 py-3 last:border-b-0">
                  <p className="min-w-0 flex-1 text-sm text-foreground">{n.text}</p>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => savePermanently(n)}>
                      Save permanently
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => discard(n.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
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
