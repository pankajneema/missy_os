import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Mic,
  BookOpen,
  Brain,
  Clock,
  KeyRound,
  Blocks,
  Zap,
  Home,
  User,
  Bot,
  ShieldAlert,
  LogOut,
  PanelLeftClose,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuthStore } from "@/store/auth-store";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleSidebar: () => void;
}

const NAV_COMMANDS = [
  { to: "/chat", label: "Open Chat", icon: MessageSquare },
  { to: "/voice", label: "Open Voice", icon: Mic },
  { to: "/today", label: "Open Today", icon: Home },
  { to: "/about/profile", label: "Open About You — My Profile", icon: User },
  { to: "/about/family", label: "Open About You — Family", icon: User },
  { to: "/about/friends", label: "Open About You — Friends", icon: User },
  { to: "/about/work", label: "Open About You — Work & People", icon: User },
  { to: "/about/important-people", label: "Open About You — Important People", icon: User },
  { to: "/about/life", label: "Open About You — My Life", icon: User },
  { to: "/about/important-dates", label: "Open About You — Important Dates", icon: User },
  { to: "/assistant/personality", label: "Open Assistant — Personality", icon: Bot },
  { to: "/assistant/tone-language", label: "Open Assistant — Tone & Language", icon: Bot },
  { to: "/assistant/response-style", label: "Open Assistant — Response Style", icon: Bot },
  { to: "/assistant/voice", label: "Open Assistant — Voice", icon: Bot },
  { to: "/assistant/rules", label: "Open Assistant — Rules", icon: ShieldAlert },
  { to: "/assistant/permissions", label: "Open Assistant — Permissions", icon: ShieldAlert },
  { to: "/assistant/usage", label: "Open Assistant — Usage & tokens", icon: Zap },
  { to: "/memory/memories", label: "Open Memory — Memories", icon: Brain },
  { to: "/memory/preferences", label: "Open Memory — Preferences", icon: Brain },
  { to: "/memory/people", label: "Open Memory — People", icon: Brain },
  { to: "/memory/temporary", label: "Open Memory — Temporary Context", icon: Brain },
  { to: "/memory/forget", label: "Open Memory — Forget", icon: Brain },
  { to: "/daily/tasks", label: "Open Today — Tasks", icon: Clock },
  { to: "/daily/schedule", label: "Open Today — Schedule", icon: Clock },
  { to: "/daily/morning-briefing", label: "Open Today — Morning Briefing", icon: Clock },
  { to: "/daily/news", label: "Open Today — News", icon: Clock },
  { to: "/daily/eod-reflection", label: "Open Today — End of Day", icon: Clock },
  { to: "/work/jobs", label: "Open Work — Jobs", icon: Zap },
  { to: "/work/connectors", label: "Open Work — Apps & Connections", icon: Blocks },
  { to: "/daily/plans", label: "Open Planning — Plans", icon: Clock },
  { to: "/daily/goals", label: "Open Planning — Goals", icon: Clock },
  { to: "/daily/upcoming", label: "Open Planning — Upcoming", icon: Clock },
  { to: "/daily/follow-ups", label: "Open Planning — Follow-ups", icon: Clock },
  { to: "/daily/weekly-review", label: "Open Planning — Weekly Review", icon: Clock },
  { to: "/daily/routines", label: "Open You — Routines", icon: Clock },
  { to: "/daily/habits", label: "Open You — Habits", icon: Clock },
  { to: "/knowledge", label: "Open Knowledge Base", icon: BookOpen },
  { to: "/connections", label: "Open AI Providers", icon: KeyRound },
];

export function CommandPalette({ open, onOpenChange, onToggleSidebar }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command Palette" description="Search or run a command">
      <CommandInput placeholder="Search or run a command…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAV_COMMANDS.map((cmd) => (
            <CommandItem key={cmd.to} onSelect={() => run(() => navigate(cmd.to))}>
              <cmd.icon className="h-4 w-4" />
              {cmd.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="View">
          <CommandItem onSelect={() => run(onToggleSidebar)}>
            <PanelLeftClose className="h-4 w-4" />
            Toggle sidebar
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Account">
          <CommandItem onSelect={() => run(logout)}>
            <LogOut className="h-4 w-4" />
            Log out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** ⌘K / Ctrl+K anywhere in the app opens the palette - the standard
 * convention this whole design language (Linear/Raycast) is built around. */
export function useCommandPaletteShortcut(onOpen: () => void) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpen();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}

export function useCommandPaletteState() {
  const [open, setOpen] = useState(false);
  useCommandPaletteShortcut(() => setOpen((v) => !v));
  return { open, setOpen };
}
