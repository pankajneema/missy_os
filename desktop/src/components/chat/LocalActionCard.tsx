import { Link } from "react-router-dom";
import { Check, Zap, AlertCircle } from "lucide-react";

export interface LocalAction {
  id: string;
  request: string;
  ok: boolean;
  message: string;
  link?: { to: string; label: string };
}

/** Shown for actions handled inside the app rather than by the model. Kept
 * visually distinct from real chat messages on purpose - these aren't part
 * of the saved conversation, so they shouldn't pretend to be. */
export function LocalActionCard({ action }: { action: LocalAction }) {
  return (
    <div className="border-t border-border/60 py-3">
      <p className="mb-1.5 text-right text-[14px] leading-relaxed text-foreground">{action.request}</p>
      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="flex items-start gap-2">
          {action.ok ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          ) : (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">{action.message}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Zap className="h-3 w-3" /> Done in the app · no AI credits used
              </span>
              {action.link && (
                <Link to={action.link.to} className="text-[11px] text-primary hover:underline">
                  {action.link.label}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
