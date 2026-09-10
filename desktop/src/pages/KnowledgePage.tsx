import { useEffect, useRef, useState } from "react";
import { FileText, Link as LinkIcon, StickyNote, BookOpen, X, Upload } from "lucide-react";
import * as api from "@/lib/api";
import type { KnowledgeSource } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";

const ACCEPT = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp";

const TYPE_ICONS: Record<KnowledgeSource["source_type"], typeof FileText> = {
  file: FileText,
  url: LinkIcon,
  text: StickyNote,
};

function SourceRow({ source, onDelete }: { source: KnowledgeSource; onDelete: (id: string) => void }) {
  const Icon = TYPE_ICONS[source.source_type];
  return (
    <div className="group flex items-start gap-3 border-b border-border/60 py-3 last:border-b-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{source.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <StatusBadge status={source.status} />
          <span>·</span>
          <span>{source.chunk_count} chunks</span>
          {source.status === "failed" && source.error_message && (
            <>
              <span>·</span>
              <span className="text-error">{source.error_message}</span>
            </>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => onDelete(source.id)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function KnowledgePage() {
  const { token } = useAuthStore();
  const [sources, setSources] = useState<KnowledgeSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [busy, setBusy] = useState<"file" | "url" | "note" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    if (!token) return;
    try {
      setSources(await api.listKnowledgeSources(token));
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleAddFile() {
    if (!token || !file) return;
    setBusy("file");
    setError(null);
    try {
      await api.addKnowledgeFile(token, file.name, file);
      setFile(null);
      await refresh();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function handleAddUrl() {
    if (!token || !url.trim()) return;
    setBusy("url");
    setError(null);
    try {
      await api.addKnowledgeUrl(token, url.trim());
      setUrl("");
      await refresh();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function handleAddNote() {
    if (!token || !noteTitle.trim() || !noteContent.trim()) return;
    setBusy("note");
    setError(null);
    try {
      await api.addKnowledgeNote(token, noteTitle.trim(), noteContent);
      setNoteTitle("");
      setNoteContent("");
      await refresh();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    setSources((prev) => prev?.filter((s) => s.id !== id) ?? null);
    try {
      await api.deleteKnowledgeSource(token, id);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
      await refresh();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Knowledge Base</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <p className="mb-5 text-sm text-muted-foreground">
            Add files, web pages, or notes once — Missy can search across all of them in any conversation.
          </p>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="file">
            <TabsList className="mb-4">
              <TabsTrigger value="file">File</TabsTrigger>
              <TabsTrigger value="url">URL</TabsTrigger>
              <TabsTrigger value="note">Note</TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="space-y-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50"
              >
                <Upload className="h-4 w-4 shrink-0" />
                {file ? <span className="text-foreground">{file.name}</span> : "Choose a PDF, DOCX, TXT, MD, or image file"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button onClick={handleAddFile} disabled={!file || busy !== null}>
                {busy === "file" ? "Reading and indexing…" : "Add file"}
              </Button>
            </TabsContent>

            <TabsContent value="url" className="space-y-3">
              <Input
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button onClick={handleAddUrl} disabled={!url.trim() || busy !== null}>
                {busy === "url" ? "Fetching and indexing…" : "Add URL"}
              </Button>
            </TabsContent>

            <TabsContent value="note" className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="note-title">Title</Label>
                <Input
                  id="note-title"
                  placeholder="e.g. Project notes"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="note-content">Content</Label>
                <Textarea
                  id="note-content"
                  rows={6}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                />
              </div>
              <Button onClick={handleAddNote} disabled={!noteTitle.trim() || !noteContent.trim() || busy !== null}>
                {busy === "note" ? "Indexing…" : "Add note"}
              </Button>
            </TabsContent>
          </Tabs>

          <div className="mt-8">
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Your sources
            </h2>

            {sources === null ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : sources.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="Nothing added yet"
                description="Use the tabs above to build your knowledge base."
              />
            ) : (
              <div>
                {sources.map((s) => (
                  <SourceRow key={s.id} source={s} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
