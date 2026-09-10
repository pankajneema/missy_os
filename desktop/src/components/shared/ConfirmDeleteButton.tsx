import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function ConfirmDeleteButton({
  label = "Delete",
  confirmText,
  onConfirm,
  className,
}: {
  label?: string;
  confirmText: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <p className="mb-3 text-sm text-foreground">{confirmText}</p>
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" onClick={handleConfirm} disabled={busy}>
            {busy ? "Deleting…" : "Yes, delete"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
