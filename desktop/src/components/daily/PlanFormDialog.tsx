import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { newId } from "@/lib/prototype-store";
import type { Plan, PlanKind } from "@/lib/daily-life";

function blankPlan(): Plan {
  return {
    id: newId(),
    title: "",
    kind: "trip",
    peopleIds: [],
    milestones: [],
    activities: [],
    createdAt: new Date().toISOString(),
  };
}

const KIND_LABELS: Record<PlanKind, string> = { trip: "Trip", event: "Event", project: "Project", other: "Other" };

export function PlanFormDialog({
  open,
  onOpenChange,
  plan,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: Plan | null;
  onSave: (plan: Plan) => void;
}) {
  const [draft, setDraft] = useState<Plan>(() => plan ?? blankPlan());

  useEffect(() => {
    if (open) setDraft(plan ?? blankPlan());
  }, [open, plan]);

  function field<K extends keyof Plan>(key: K, value: Plan[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    if (!draft.title.trim()) return;
    onSave({ ...draft, title: draft.title.trim() });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{plan ? "Edit plan" : "New plan"}</DialogTitle>
          <DialogDescription>Something bigger than a single task — a trip, event, or project.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-title">Title</Label>
              <Input id="plan-title" value={draft.title} onChange={(e) => field("title", e.target.value)} autoFocus placeholder="e.g. Goa Trip" />
            </div>
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select value={draft.kind} onValueChange={(v) => field("kind", v as PlanKind)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABELS) as PlanKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-goal">Goal</Label>
            <Input id="plan-goal" value={draft.goal ?? ""} onChange={(e) => field("goal", e.target.value)} placeholder="What's this plan for?" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-start">Start date</Label>
              <Input id="plan-start" type="date" value={draft.startDate ?? ""} onChange={(e) => field("startDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-end">End date</Label>
              <Input id="plan-end" type="date" value={draft.endDate ?? ""} onChange={(e) => field("endDate", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-notes">Notes</Label>
            <Textarea id="plan-notes" rows={3} value={draft.notes ?? ""} onChange={(e) => field("notes", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!draft.title.trim()}>
            {plan ? "Save changes" : "Create plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
