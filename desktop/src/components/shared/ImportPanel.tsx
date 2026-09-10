import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Plug } from "lucide-react";
import * as api from "@/lib/api";
import type { McpServer } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

/** Work often already lives somewhere else - a tracker, an email, a
 * standup note. There's no sync API for those, so rather than pretend
 * otherwise this does the honest version: paste what you're looking at and
 * it becomes real items here, one per line. */
export function ImportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      <Download className="h-3.5 w-3.5" /> Import
    </Button>
  );
}

export function ImportPanel({
  label,
  placeholder,
  open,
  onClose,
  onImport,
}: {
  label: string;
  placeholder: string;
  open: boolean;
  onClose: () => void;
  onImport: (lines: string[]) => void;
}) {
  const { token } = useAuthStore();
  const [text, setText] = useState("");
  const [servers, setServers] = useState<McpServer[]>([]);
  const [imported, setImported] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    (async () => {
      try {
        setServers((await api.listMcpServers(token)).filter((s) => s.is_enabled));
      } catch {
        /* the paste box works regardless */
      }
    })();
  }, [open, token]);

  const lines = text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•\d.)\]]+\s*/, "").trim())
    .filter(Boolean);

  function handleImport() {
    if (!lines.length) return;
    onImport(lines);
    setImported(lines.length);
    setText("");
  }

  if (!open) return null;

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">Bring in {label} from elsewhere</p>
          <p className="text-xs text-muted-foreground">One per line. Bullets and numbering are stripped.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      {servers.length > 0 && (
        <div className="rounded-md border border-accent-soft bg-accent-soft/50 p-2.5">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-foreground">
            <Plug className="h-3 w-3 shrink-0" />
            Connected:
            {servers.map((s) => (
              <Badge key={s.id} variant="outline">
                {s.name}
              </Badge>
            ))}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ask Missy in Chat — e.g. “list my open issues” — then paste her answer below. She can read these apps
            during a conversation, but there's no background sync, so nothing lands here until you confirm it.
          </p>
        </div>
      )}
      {servers.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Connect a tracker under{" "}
          <Link to="/work/connectors" className="underline">
            Apps &amp; Connections
          </Link>{" "}
          and Missy can read it in Chat, then you paste the results here.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="import-text">Paste {label}</Label>
        <Textarea id="import-text" rows={5} placeholder={placeholder} value={text} onChange={(e) => { setText(e.target.value); setImported(null); }} />
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleImport} disabled={!lines.length}>
          Add {lines.length || ""} {lines.length === 1 ? "item" : "items"}
        </Button>
        {imported !== null && <span className="text-xs text-success">Added {imported}.</span>}
      </div>
    </div>
  );
}
