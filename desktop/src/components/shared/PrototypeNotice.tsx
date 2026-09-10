import { Sparkles } from "lucide-react";

/** Honesty label for screens with no backend yet - the app's standing rule
 * is to never present invented data as if it were real. Shown once near the
 * top of any such page; state here is real (it's genuinely saved), just
 * local to this device instead of synced to the account. */
export function PrototypeNotice({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-2 rounded-lg border border-accent-soft bg-accent-soft/60 px-3 py-2.5 text-xs text-foreground/80">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <p>
        {children ?? (
          <>
            <strong className="font-medium text-foreground">Prototype:</strong> saved on this device only — not yet
            connected to your account or used by Missy in chat.
          </>
        )}
      </p>
    </div>
  );
}
