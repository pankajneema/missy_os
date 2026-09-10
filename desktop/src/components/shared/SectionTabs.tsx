import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface SectionTab {
  to: string;
  label: string;
}

/** Sub-navigation that lives on the page instead of in the sidebar.
 * Four "People" rows or six "Assistant" rows in the sidebar is what made it
 * overwhelming - these are views of one thing, so they belong together on
 * one screen. Each tab keeps its own route, so deep links and the back
 * button still work (which nested <Tabs> state would break). */
export function SectionTabs({ items }: { items: SectionTab[] }) {
  const { pathname } = useLocation();

  return (
    <div className="-mx-1 mb-5 flex flex-wrap gap-1 border-b border-border pb-2">
      {items.map((item) => {
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "rounded-md px-2.5 py-1 text-[13px] transition-colors",
              active ? "bg-accent-soft font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export const PEOPLE_TABS: SectionTab[] = [
  { to: "/about/family", label: "Family" },
  { to: "/about/friends", label: "Friends" },
  { to: "/about/work", label: "Work" },
  { to: "/about/important-people", label: "Important" },
];

export const LIFE_TABS: SectionTab[] = [
  { to: "/about/life", label: "Timeline" },
  { to: "/about/important-dates", label: "Important Dates" },
];

export const MEMORY_TABS: SectionTab[] = [
  { to: "/memory/memories", label: "Memories" },
  { to: "/memory/preferences", label: "Preferences" },
  { to: "/memory/people", label: "People" },
  { to: "/memory/temporary", label: "This Session" },
  { to: "/memory/forget", label: "Forget" },
];

export const ASSISTANT_TABS: SectionTab[] = [
  { to: "/assistant/personality", label: "Personality" },
  { to: "/assistant/tone-language", label: "Tone & Language" },
  { to: "/assistant/response-style", label: "Response Style" },
  { to: "/assistant/voice", label: "Voice" },
  { to: "/assistant/rules", label: "Rules" },
  { to: "/assistant/permissions", label: "Permissions" },
  { to: "/assistant/usage", label: "Usage" },
];

export const ROUTINE_TABS: SectionTab[] = [
  { to: "/daily/routines", label: "Routines" },
  { to: "/daily/habits", label: "Habits" },
];

export const JOB_TABS: SectionTab[] = [
  { to: "/work/jobs", label: "Jobs" },
  { to: "/work/flows", label: "Flows" },
];

export const CONNECTOR_TABS: SectionTab[] = [
  { to: "/work/connectors", label: "Catalog" },
  { to: "/mcp", label: "Connected" },
  { to: "/work/browser-use", label: "Browser Use" },
  { to: "/work/whatsapp", label: "WhatsApp" },
];

export const BRIEFING_TABS: SectionTab[] = [
  { to: "/daily/morning-briefing", label: "Briefing" },
  { to: "/daily/news", label: "News" },
];
