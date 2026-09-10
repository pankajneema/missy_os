import { useEffect, useState } from "react";
import { Check, Plug, Loader2 } from "lucide-react";
import * as api from "@/lib/api";
import type { McpServer } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionTabs, CONNECTOR_TABS } from "@/components/shared/SectionTabs";
import { CONNECTORS, CONNECTOR_CATEGORIES, type Connector } from "@/lib/connectors";

function StatusBadge({ connector, connected }: { connector: Connector; connected: boolean }) {
  if (connected) {
    return (
      <Badge className="bg-success-soft text-success" variant="outline">
        <Check className="h-3 w-3" /> Connected
      </Badge>
    );
  }
  if (connector.availability === "remote") return <Badge variant="outline">Ready to connect</Badge>;
  if (connector.availability === "local") return <Badge variant="outline">Needs local servers on</Badge>;
  return (
    <Badge className="bg-muted text-muted-foreground" variant="outline">
      Not available yet
    </Badge>
  );
}

function ConnectorCard({
  connector,
  connected,
  busy,
  onConnect,
}: {
  connector: Connector;
  connected: boolean;
  busy: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{connector.name}</p>
        <StatusBadge connector={connector} connected={connected} />
      </div>
      <p className="text-sm text-muted-foreground">{connector.does}</p>

      {connector.envHint && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Needs: <span className="font-mono">{connector.envHint}</span>
        </p>
      )}
      {connector.note && <p className="mt-1.5 text-xs text-muted-foreground">{connector.note}</p>}

      {!connected && connector.availability !== "none" && (
        <Button size="sm" variant="outline" className="mt-3" onClick={onConnect} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
          {connector.availability === "remote" ? "Connect" : "Add anyway"}
        </Button>
      )}
    </div>
  );
}

export function ConnectorsPage() {
  const { token } = useAuthStore();
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function isConnected(connector: Connector): boolean {
    return (servers ?? []).some((s) => s.name.toLowerCase() === connector.name.toLowerCase());
  }

  async function handleConnect(connector: Connector) {
    if (!token) return;
    setBusyId(connector.id);
    setError(null);
    setSuccess(null);
    try {
      await api.addMcpServer(token, {
        name: connector.name,
        transport: connector.availability === "remote" ? "sse" : "stdio",
        url: connector.url ?? null,
        command: connector.command ?? null,
        args: connector.args ?? null,
      });
      setSuccess(`${connector.name} added. Open "Connected" to fill in credentials or adjust it.`);
      await refresh();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Apps &amp; Connections</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <SectionTabs items={CONNECTOR_TABS} />

          <p className="mb-4 text-sm text-muted-foreground">
            Apps Missy can reach. Everything here runs through MCP — remote ones connect right away, local ones need
            your backend to allow local servers, and the rest genuinely have no server to connect to yet.
          </p>

          <Alert className="mb-5">
            <AlertDescription className="text-xs">
              Local (stdio) connectors are blocked until{" "}
              <span className="font-mono">ALLOW_MCP_STDIO_SERVERS=true</span> is set in the backend's{" "}
              <span className="font-mono">.env</span>. They give Missy access to your machine, so turn that on
              deliberately.
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="mb-4 border-success-soft bg-success-soft">
              <AlertDescription className="text-success">{success}</AlertDescription>
            </Alert>
          )}

          {servers === null ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            CONNECTOR_CATEGORIES.map((category) => {
              const items = CONNECTORS.filter((c) => c.category === category);
              if (items.length === 0) return null;
              return (
                <div key={category} className="mb-6">
                  <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {category}
                  </h2>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {items.map((c) => (
                      <ConnectorCard
                        key={c.id}
                        connector={c}
                        connected={isConnected(c)}
                        busy={busyId === c.id}
                        onConnect={() => handleConnect(c)}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
