import { useEffect, useState } from "react";
import { Brain, X } from "lucide-react";
import * as api from "@/lib/api";
import type { MemoryCategory, MemoryEntry } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionTabs, MEMORY_TABS } from "@/components/shared/SectionTabs";

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  fact: "Fact",
  preference: "Preference",
  episodic: "Episodic",
};

const SOURCE_LABELS: Record<MemoryEntry["source"], string> = {
  auto: "auto-learned",
  manual: "you told her",
};

function MemoryRow({ memory, onDelete }: { memory: MemoryEntry; onDelete: (id: string) => void }) {
  return (
    <div className="group flex items-start gap-3 border-b border-border/60 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{memory.content}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {CATEGORY_LABELS[memory.category]} · {SOURCE_LABELS[memory.source]}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => onDelete(memory.id)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function MemoryPage() {
  const { token } = useAuthStore();
  const [memories, setMemories] = useState<MemoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<MemoryCategory>("fact");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!token) return;
    try {
      setMemories(await api.listMemories(token));
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleAdd() {
    if (!token || !content.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.addMemory(token, content.trim(), category);
      setContent("");
      await refresh();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    setMemories((prev) => prev?.filter((m) => m.id !== id) ?? null);
    try {
      await api.deleteMemory(token, id);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
      await refresh();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Memory</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={MEMORY_TABS} />
          <p className="mb-5 text-sm text-muted-foreground">
            What Missy has picked up about you from conversation, plus anything you've told her to remember. This is
            used silently in every chat — unlike the knowledge base, there's no toggle for it.
          </p>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="mb-6 flex flex-wrap items-start gap-2">
            <Input
              placeholder="What should Missy remember?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="min-w-[180px] flex-1"
            />
            <div className="flex shrink-0 gap-2">
              <Select value={category} onValueChange={(v) => setCategory(v as MemoryCategory)}>
                <SelectTrigger className="w-36 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fact">Fact</SelectItem>
                  <SelectItem value="preference">Preference</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleAdd} disabled={!content.trim() || busy} className="shrink-0">
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          {memories === null ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : memories.length === 0 ? (
            <EmptyState
              icon={Brain}
              title="Nothing yet"
              description="Missy will pick things up automatically as you chat, or say “remember that …” in Chat, or add something above."
            />
          ) : (
            <div>
              {memories.map((m) => (
                <MemoryRow key={m.id} memory={m} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
