import { useState } from "react";
import { Outlet } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "./Sidebar";
import { CommandPalette, useCommandPaletteState } from "./CommandPalette";
import { TeachAssistantDialog } from "./TeachAssistantDialog";

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const { open, setOpen } = useCommandPaletteState();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={open} onOpenChange={setOpen} onToggleSidebar={() => setCollapsed((v) => !v)} />
      <TeachAssistantDialog />
    </TooltipProvider>
  );
}
