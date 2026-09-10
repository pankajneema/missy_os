import { useState } from "react";
import { Heart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useMemories } from "@/lib/use-memories";
import { SectionTabs, MEMORY_TABS } from "@/components/shared/SectionTabs";

export function MemoryPreferencesPage() {
  const { memories, error, addMemory, deleteMemory } = useMemories();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  const preferences = memories?.filter((m) => m.category === "preference") ?? null;

  async function handleAdd() {
    if (!content.trim()) return;
    setBusy(true);
    try {
      await addMemory(content, "preference");
      setContent("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Preferences</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={MEMORY_TABS} />
          <p className="mb-5 text-sm text-muted-foreground">How you like things done — a filtered view of your real memory.</p>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="mb-6 flex flex-wrap gap-2">
            <Input
              placeholder='e.g. "I prefer detailed answers."'
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="min-w-[180px] flex-1"
            />
            <Button onClick={handleAdd} disabled={!content.trim() || busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>

          {preferences === null ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : preferences.length === 0 ? (
            <EmptyState icon={Heart} title="No preferences saved yet" description="Add one above, or say it in Chat." />
          ) : (
            <div>
              {preferences.map((m) => (
                <div key={m.id} className="group flex items-start gap-3 border-b border-border/60 py-3 last:border-b-0">
                  <p className="min-w-0 flex-1 text-sm text-foreground">{m.content}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => deleteMemory(m.id)}
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
  );
}
