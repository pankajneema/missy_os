import { Link, useLocation } from "react-router-dom";
import {
  MessageSquare,
  Mic,
  BookOpen,
  KeyRound,
  Blocks,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Home,
  User,
  Users,
  Milestone,
  Bot,
  Brain,
  Sunrise,
  Moon,
  ListChecks,
  CalendarClock,
  Sparkles,
  Target,
  CalendarCheck,
  CalendarRange,
  Repeat,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Extra path prefixes that should also light this row up - a row like
   * "People" fronts four routes (Family/Friends/Work/Important) that are
   * tabs on the page rather than separate sidebar rows. */
  match?: string[];
}

interface NavSection {
  label: string | null;
  items: NavItem[];
  /** Tints this section's icons so areas are distinguishable at a glance
   * without colouring the labels, which would get noisy fast. */
  tint?: string;
}

const SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { to: "/chat", label: "Chat", icon: MessageSquare },
      { to: "/voice", label: "Voice", icon: Mic },
    ],
  },
  {
    label: "Today",
    tint: "text-primary",
    items: [
      { to: "/today", label: "Today", icon: Home },
      { to: "/daily/tasks", label: "Tasks", icon: ListChecks },
      { to: "/daily/schedule", label: "Schedule", icon: CalendarClock },
      { to: "/daily/morning-briefing", label: "Morning Briefing", icon: Sunrise, match: ["/daily/news"] },
      { to: "/daily/eod-reflection", label: "End of Day", icon: Moon },
    ],
  },
  {
    label: "Work",
    tint: "text-coral",
    items: [
      { to: "/work/jobs", label: "Jobs", icon: Zap, match: ["/work/flows"] },
      { to: "/work/connectors", label: "Apps & Connections", icon: Blocks, match: ["/mcp", "/work/browser-use", "/work/whatsapp"] },
    ],
  },
  {
    label: "Planning",
    tint: "text-violet",
    items: [
      { to: "/daily/plans", label: "Plans", icon: Sparkles },
      { to: "/daily/goals", label: "Goals", icon: Target },
      { to: "/daily/upcoming", label: "Upcoming", icon: CalendarRange },
      { to: "/daily/follow-ups", label: "Follow-ups", icon: CalendarCheck },
      { to: "/daily/weekly-review", label: "Weekly Review", icon: CalendarCheck },
    ],
  },
  {
    label: "You",
    tint: "text-success",
    items: [
      { to: "/about/profile", label: "My Profile", icon: User },
      {
        to: "/about/family",
        label: "People",
        icon: Users,
        match: ["/about/friends", "/about/work", "/about/important-people"],
      },
      { to: "/about/life", label: "My Life", icon: Milestone, match: ["/about/important-dates"] },
      { to: "/memory/memories", label: "Memory", icon: Brain, match: ["/memory/"] },
      { to: "/daily/routines", label: "Routines & Habits", icon: Repeat, match: ["/daily/habits"] },
    ],
  },
  {
    label: "Assistant",
    tint: "text-warning",
    items: [
      { to: "/assistant/personality", label: "Assistant", icon: Bot, match: ["/assistant/"] },
      { to: "/knowledge", label: "Knowledge Base", icon: BookOpen },
      { to: "/connections", label: "AI Providers", icon: KeyRound },
    ],
  },
];

function isActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.to) return true;
  return (item.match ?? []).some((m) => (m.endsWith("/") ? pathname.startsWith(m) : pathname === m));
}

function Row({ item, collapsed, active, tint }: { item: NavItem; collapsed: boolean; active: boolean; tint?: string }) {
  const Icon = item.icon;
  const link = (
    <Link
      to={item.to}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
        collapsed && "justify-center px-0",
        active ? "bg-accent text-accent-foreground font-medium" : "text-foreground/80 hover:bg-muted",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", !active && tint)} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { username, logout } = useAuthStore();
  const { pathname } = useLocation();

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-surface transition-[width] duration-150",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className={cn("flex h-12 items-center gap-2 px-3", collapsed && "justify-center px-0")}>
        {!collapsed && (
          <span className="flex-1 truncate text-[13px] font-semibold tracking-tight text-foreground">Missy</span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onToggle}>
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
        </Tooltip>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {SECTIONS.map((section, i) => (
          <div key={section.label ?? `top-${i}`} className={i > 0 ? "mt-4" : ""}>
            {section.label &&
              (collapsed ? (
                <div className="mx-1 mb-2 border-t border-border" />
              ) : (
                <p className="mb-1 px-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </p>
              ))}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <Row key={item.to} item={item} collapsed={collapsed} active={isActive(item, pathname)} tint={section.tint} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className={cn("border-t border-border p-2", collapsed && "flex justify-center")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Log out ({username})</TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-2 px-1">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{username}</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={logout}>
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Log out</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </aside>
  );
}
