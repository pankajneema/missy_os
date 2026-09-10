import { cn } from "@/lib/utils";
import type { SourceStatus } from "@/lib/api";

const STYLES: Record<SourceStatus, string> = {
  ready: "bg-success-soft text-success",
  processing: "bg-warning-soft text-warning",
  failed: "bg-error-soft text-error",
};

const LABELS: Record<SourceStatus, string> = {
  ready: "Ready",
  processing: "Processing",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: SourceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        STYLES[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABELS[status]}
    </span>
  );
}
