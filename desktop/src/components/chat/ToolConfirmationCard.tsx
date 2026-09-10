import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PendingConfirmation } from "@/lib/api";

export function ToolConfirmationCard({
  confirmation,
  onResolve,
}: {
  confirmation: PendingConfirmation;
  onResolve: (approved: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

  async function resolve(approved: boolean) {
    setBusy(approved ? "approve" : "deny");
    try {
      await onResolve(approved);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-warning-soft bg-warning-soft/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-warning" />
        <p className="text-sm font-medium text-foreground">
          Missy wants to run <span className="font-mono">{confirmation.tool_name}</span>
        </p>
      </div>
      <pre className="mb-3 max-h-40 overflow-auto rounded-md border border-border bg-surface p-2.5 font-mono text-xs text-secondary-foreground">
        {JSON.stringify(confirmation.tool_args, null, 2)}
      </pre>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => resolve(true)} disabled={busy !== null}>
          {busy === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => resolve(false)} disabled={busy !== null}>
          {busy === "deny" ? "Denying…" : "Deny"}
        </Button>
      </div>
    </div>
  );
}
