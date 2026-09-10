import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import * as api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { usePrototypeCollection, newId } from "@/lib/prototype-store";
import { PEOPLE_CATEGORIES, type Person } from "@/lib/people";
import { guessDestination, extractTaskTitle, type TeachDestination } from "@/lib/teach-assistant";
import { todayStr, tomorrowStr, type Task, type FollowUp } from "@/lib/daily-life";

const DESTINATION_LABELS: Record<TeachDestination["kind"], string> = {
  memory: "Memory",
  rule: "A rule for the assistant",
  reminder: "A reminder",
  person: "A person",
  task: "A task",
  followup: "A follow-up",
};

export function TeachAssistantDialog() {
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [guess, setGuess] = useState<TeachDestination | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const rules = usePrototypeCollection<{ id: string; text: string; level: string }>("assistant.rules");
  const tasks = usePrototypeCollection<Task>("daily.tasks");
  const followUps = usePrototypeCollection<FollowUp>("daily.followups");
  const family = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.family.storageKey);
  const friends = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.friend.storageKey);
  const work = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.work.storageKey);
  const important = usePrototypeCollection<Person>(PEOPLE_CATEGORIES.important.storageKey);

  useEffect(() => {
    function handler() {
      setOpen(true);
    }
    window.addEventListener("missy:teach-assistant", handler);
    return () => window.removeEventListener("missy:teach-assistant", handler);
  }, []);

  useEffect(() => {
    if (!open) {
      setText("");
      setGuess(null);
      setDone(null);
    }
  }, [open]);

  function handleTextChange(value: string) {
    setText(value);
    setDone(null);
    setGuess(value.trim().length > 3 ? guessDestination(value) : null);
  }

  const peopleCollections = { family, friend: friends, work, important } as const;

  async function handleSave() {
    if (!token || !guess || !text.trim()) return;
    if (guess.kind === "memory") {
      await api.addMemory(token, text.trim(), guess.category);
      setDone("Saved to Memory.");
    } else if (guess.kind === "rule") {
      rules.add({ id: newId(), text: text.trim(), level: "Important" });
      setDone("Added to your Rules.");
    } else if (guess.kind === "reminder") {
      await api.addScheduledTask(token, text.trim(), "daily", `${guess.time}:00`, null);
      setDone("Added to your Reminders.");
    } else if (guess.kind === "person") {
      peopleCollections[guess.category].add({
        id: newId(),
        category: guess.category,
        name: guess.name,
        relationship: guess.relationship,
      });
      setDone(`Added ${guess.name} to ${PEOPLE_CATEGORIES[guess.category].title}.`);
    } else if (guess.kind === "task") {
      const date = guess.date === "today" ? todayStr() : tomorrowStr();
      tasks.add({
        id: newId(),
        title: extractTaskTitle(text),
        date,
        priority: "medium",
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      setDone(`Added as a task for ${guess.date}.`);
    } else if (guess.kind === "followup") {
      followUps.add({
        id: newId(),
        title: text.trim(),
        kind: "follow_up",
        waitingSince: todayStr(),
        resolved: false,
        createdAt: new Date().toISOString(),
      });
      setDone("Added to your Follow-ups.");
    }
  }

  function goToDestination() {
    if (!guess) return;
    setOpen(false);
    if (guess.kind === "rule") navigate("/assistant/rules");
    else if (guess.kind === "reminder") navigate("/work/jobs");
    else if (guess.kind === "person") navigate(`/about/${guess.category === "important" ? "important-people" : guess.category === "work" ? "work" : guess.category === "family" ? "family" : "friends"}`);
    else if (guess.kind === "task") navigate("/daily/tasks");
    else if (guess.kind === "followup") navigate("/daily/follow-ups");
    else navigate("/memory/memories");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-5 z-40 flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        <Sparkles className="h-4 w-4" /> Teach Assistant
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" /> Teach Assistant
            </DialogTitle>
            <DialogDescription>Tell Missy anything — she'll guess where it belongs.</DialogDescription>
          </DialogHeader>

          <Textarea
            autoFocus
            rows={3}
            placeholder={'e.g. "My mother\'s birthday is 10 June." or "Never send emails without asking me."'}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
          />

          {guess && !done && (
            <div className="flex items-center gap-2 rounded-lg border border-accent-soft bg-accent-soft/60 px-3 py-2 text-sm">
              <span className="text-foreground/80">Best guess:</span>
              <Badge>{DESTINATION_LABELS[guess.kind]}</Badge>
              {guess.kind === "person" && <span className="text-xs text-muted-foreground">({guess.relationship})</span>}
            </div>
          )}
          {done && (
            <div className="rounded-lg border border-success-soft bg-success-soft px-3 py-2 text-sm text-success">{done}</div>
          )}

          <DialogFooter>
            {guess && !done && (
              <>
                <Button variant="outline" onClick={goToDestination}>
                  Choose a different spot
                </Button>
                <Button onClick={handleSave}>Save here</Button>
              </>
            )}
            {done && <Button onClick={() => setOpen(false)}>Done</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
