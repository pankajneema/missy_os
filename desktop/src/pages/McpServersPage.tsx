import { useEffect, useState } from "react";
import { Blocks } from "lucide-react";
import * as api from "@/lib/api";
import type { McpServer, McpTransport } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { SectionTabs, CONNECTOR_TABS } from "@/components/shared/SectionTabs";

function parseEnv(text: string): Record<string, string> | null {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return Object.keys(env).length ? env : null;
}

function AddServerForm({ token, onAdded }: { token: string; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [envText, setEnvText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      setError("Give the server a name.");
      return;
    }
    if (transport === "stdio" && !command.trim()) {
      setError("A local (stdio) server needs a command.");
      return;
    }
    if (transport === "sse" && !url.trim()) {
      setError("A remote (sse) server needs a URL.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.addMcpServer(token, {
        name: name.trim(),
        transport,
        command: transport === "stdio" ? command.trim() : null,
        args: transport === "stdio" && args.trim() ? args.trim().split(/\s+/) : null,
        url: transport === "sse" ? url.trim() : null,
        env: parseEnv(envText),
      });
      setName("");
      setCommand("");
      setArgs("");
      setUrl("");
      setEnvText("");
      onAdded();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-muted-foreground">
        Remote (SSE) servers are a URL, similar to an API connection. Local (stdio) servers are a command Missy
        spawns on this machine — only add one you trust, since its tools run with your own file/network access.
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="mcp-name">Name</Label>
        <Input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Transport</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={transport === "stdio" ? "default" : "outline"}
            size="sm"
            onClick={() => setTransport("stdio")}
          >
            stdio (local)
          </Button>
          <Button
            type="button"
            variant={transport === "sse" ? "default" : "outline"}
            size="sm"
            onClick={() => setTransport("sse")}
          >
            sse (remote)
          </Button>
        </div>
      </div>

      {transport === "stdio" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-command">Command</Label>
            <Input id="mcp-command" placeholder="npx" value={command} onChange={(e) => setCommand(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-args">Arguments (space-separated)</Label>
            <Input
              id="mcp-args"
              placeholder="-y @modelcontextprotocol/server-filesystem /path/to/folder"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
            />
          </div>
        </>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="mcp-url">Server URL</Label>
          <Input id="mcp-url" placeholder="https://example.com/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="mcp-env">Environment variables / headers (optional, one KEY=VALUE per line)</Label>
        <Textarea id="mcp-env" rows={3} value={envText} onChange={(e) => setEnvText(e.target.value)} />
      </div>

      <Button onClick={handleSave} disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function ServerRow({
  server,
  onToggle,
  onDelete,
}: {
  server: McpServer;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const detail = server.transport === "stdio" ? server.command : server.url;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Blocks className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {server.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {server.transport} · {detail}
        </p>
      </div>
      <div className="flex flex-wrap shrink-0 items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            server.is_enabled ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {server.is_enabled ? "Enabled" : "Disabled"}
        </span>
        <Button variant="outline" size="sm" onClick={() => onToggle(server.id, !server.is_enabled)}>
          {server.is_enabled ? "Disable" : "Enable"}
        </Button>
        <ConfirmDeleteButton confirmText={`Permanently delete '${server.name}'?`} onConfirm={() => onDelete(server.id)} />
      </div>
    </div>
  );
}

export function McpServersPage() {
  const { token } = useAuthStore();
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    try {
      setServers(await api.listMcpServers(token));
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleToggle(id: string, enabled: boolean) {
    if (!token) return;
    setServers((prev) => prev?.map((s) => (s.id === id ? { ...s, is_enabled: enabled } : s)) ?? null);
    try {
      await api.setMcpServerEnabled(token, id, enabled);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
      await refresh();
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    try {
      await api.deleteMcpServer(token, id);
      setServers((prev) => prev?.filter((s) => s.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Apps &amp; Connections</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={CONNECTOR_TABS} />
          <p className="mb-5 text-sm text-muted-foreground">
            Connect Missy to external tools via the Model Context Protocol — a connected server's tools are picked
            up automatically in Chat, alongside her built-in ones, no toggle needed.
          </p>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {token && <AddServerForm token={token} onAdded={refresh} />}

          <div className="mt-8">
            {servers === null ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : servers.length === 0 ? (
              <EmptyState
                icon={Blocks}
                title="No MCP servers connected yet"
                description='Use "Add an MCP server" above.'
              />
            ) : (
              <div>
                {servers.map((s) => (
                  <ServerRow key={s.id} server={s} onToggle={handleToggle} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
