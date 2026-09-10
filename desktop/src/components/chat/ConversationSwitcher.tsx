import { Check, MessageSquarePlus, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Conversation } from "@/lib/api";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ConversationSwitcher({
  conversations,
  currentId,
  disabled,
  onSelect,
  onNewChat,
}: {
  conversations: Conversation[];
  currentId: string | undefined;
  disabled: boolean;
  onSelect: (conversation: Conversation) => void;
  onNewChat: () => void;
}) {
  const sorted = [...conversations].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:bg-muted"
        >
          <MessagesSquare className="h-3.5 w-3.5" />
          Conversations
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onNewChat}
          className="h-8 w-full justify-start gap-2 px-2 text-[13px] font-medium"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </Button>
        <ScrollArea className="mt-1 max-h-72">
          <div className="flex flex-col gap-0.5 pr-2">
            {sorted.map((c) => {
              const isActive = c.id === currentId;
              return (
                <button
                  key={c.id}
                  disabled={disabled}
                  onClick={() => onSelect(c)}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatTimestamp(c.created_at)}</span>
                  {isActive && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
