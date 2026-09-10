import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeValue } from "@/lib/prototype-store";
import { SectionTabs, ASSISTANT_TABS } from "@/components/shared/SectionTabs";

type PermissionLevel = "Always Ask" | "Automatically Allowed" | "Never Allowed";

const ACTIONS = [
  "Sending emails",
  "Sending messages",
  "Creating calendar events",
  "Changing calendar events",
  "Uploading files",
  "Deleting files",
  "Making purchases",
  "Contacting people",
  "External actions",
];

const LEVELS: PermissionLevel[] = ["Always Ask", "Automatically Allowed", "Never Allowed"];

const LEVEL_STYLES: Record<PermissionLevel, string> = {
  "Always Ask": "border-primary bg-accent-soft text-primary",
  "Automatically Allowed": "border-success bg-success-soft text-success",
  "Never Allowed": "border-error bg-error-soft text-error",
};

export function AssistantPermissionsPage() {
  const [permissions, setPermissions] = usePrototypeValue<Record<string, PermissionLevel>>(
    "assistant.permissions",
    Object.fromEntries(ACTIONS.map((a) => [a, "Always Ask" as PermissionLevel])),
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Permissions</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={ASSISTANT_TABS} />
          <p className="mb-1 text-sm text-muted-foreground">What your assistant can do for important actions.</p>
          <PrototypeNotice>
            <strong className="font-medium text-foreground">Prototype:</strong> saved on this device, but Missy's
            actual tool-confirmation flow in Chat is generic today — it asks before any risky action regardless of
            these settings.
          </PrototypeNotice>

          <div>
            {ACTIONS.map((action) => (
              <div key={action} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-3 last:border-b-0">
                <p className="text-sm text-foreground">{action}</p>
                <div className="flex gap-1.5">
                  {LEVELS.map((level) => (
                    <button
                      key={level}
                      onClick={() => setPermissions((prev) => ({ ...prev, [action]: level }))}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        permissions[action] === level ? LEVEL_STYLES[level] : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
