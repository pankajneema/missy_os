import { useState } from "react";
import { Eraser, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { useMemories } from "@/lib/use-memories";
import { SectionTabs, MEMORY_TABS } from "@/components/shared/SectionTabs";

export function MemoryForgetPage() {
  const { memories, error, deleteMemory, deleteMany } = useMemories();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const matches = memories?.filter((m) => m.content.toLowerCase().includes(query.toLowerCase())) ?? null;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  async function forgetSelected() {
    await deleteMany(selected);
    setSelected([]);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Forget</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={MEMORY_TABS} />
          <p className="mb-5 text-sm text-muted-foreground">
            Search your memory, then remove one thing or a whole group at once — e.g. "forget everything about
            Sarah."
          </p>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="relative mb-4">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search memories to forget…" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {matches === null ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : matches.length === 0 ? (
            <EmptyState icon={Eraser} title={query ? "No matches" : "Nothing to forget"} description={query ? "Try a different search." : "Search above to find something to remove."} />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {matches.length} {matches.length === 1 ? "memory" : "memories"} match
                  {selected.length > 0 && ` · ${selected.length} selected`}
                </p>
                {selected.length > 0 && (
                  <ConfirmDeleteButton
                    label={`Forget ${selected.length} selected`}
                    confirmText={`Permanently forget ${selected.length} ${selected.length === 1 ? "memory" : "memories"}?`}
                    onConfirm={forgetSelected}
                  />
                )}
                {selected.length === 0 && query && (
                  <ConfirmDeleteButton
                    label={`Forget all ${matches.length} matching`}
                    confirmText={`Permanently forget everything matching "${query}"?`}
                    onConfirm={() => deleteMany(matches.map((m) => m.id))}
                  />
                )}
              </div>
              <div>
                {matches.map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-start gap-3 border-b border-border/60 py-3 last:border-b-0">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.includes(m.id)}
                      onChange={() => toggle(m.id)}
                    />
                    <p className="min-w-0 flex-1 text-sm text-foreground">{m.content}</p>
                    <Button variant="ghost" size="sm" onClick={() => deleteMemory(m.id)}>
                      Forget
                    </Button>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
