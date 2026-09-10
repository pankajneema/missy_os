import { useEffect, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeValue } from "@/lib/prototype-store";
import * as api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { SectionTabs, ASSISTANT_TABS } from "@/components/shared/SectionTabs";

interface VoiceSettings {
  enabled: boolean;
  voice: string;
  accent: string;
  speed: number;
  mode: "always" | "requested" | "never";
}

const BLANK: VoiceSettings = { enabled: true, voice: "Default", accent: "Neutral", speed: 1, mode: "requested" };
const VOICES = ["Default", "Warm", "Crisp", "Deep"];
const ACCENTS = ["Neutral", "American", "British", "Indian"];

export function AssistantVoicePage() {
  const { token } = useAuthStore();
  const [settings, setSettings] = usePrototypeValue<VoiceSettings>("assistant.voice", BLANK);
  const [language, setLanguage] = useState("English");
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const p = await api.getProfile(token);
      if (p) setLanguage(p.response_language);
    })();
  }, [token]);

  async function handlePreview() {
    if (!token) return;
    setPreviewing(true);
    setError(null);
    try {
      const buffer = await api.synthesizeSpeech(token, "Hi, this is a preview of how I sound.", language);
      const url = URL.createObjectURL(new Blob([buffer], { type: "audio/mpeg" }));
      await new Audio(url).play();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Couldn't play a preview.");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Voice</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={ASSISTANT_TABS} />
          <p className="mb-1 text-sm text-muted-foreground">Control if and how your assistant speaks.</p>
          <PrototypeNotice>
            Saved on this device only — except <strong className="font-medium text-foreground">Preview voice</strong>,
            which really speaks using your account's voice engine in your current reply language ({language}).
          </PrototypeNotice>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Voice</p>
                <p className="text-xs text-muted-foreground">Turn spoken replies on or off entirely.</p>
              </div>
              <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings((prev) => ({ ...prev, enabled: v }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Voice selection</Label>
                <Select value={settings.voice} onValueChange={(v) => setSettings((prev) => ({ ...prev, voice: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Accent</Label>
                <Select value={settings.accent} onValueChange={(v) => setSettings((prev) => ({ ...prev, accent: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCENTS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Speaking speed: {settings.speed.toFixed(1)}×</Label>
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.1}
                value={settings.speed}
                onChange={(e) => setSettings((prev) => ({ ...prev, speed: Number(e.target.value) }))}
                className="w-full accent-primary"
              />
            </div>

            <div>
              <Label className="mb-2 block">Automatic voice responses</Label>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["always", "Always speak"],
                    ["requested", "Speak only when requested"],
                    ["never", "Never speak"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setSettings((prev) => ({ ...prev, mode: value }))}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      settings.mode === value ? "border-primary bg-accent-soft text-primary" : "border-border text-foreground/80 hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <Button variant="outline" onClick={handlePreview} disabled={previewing}>
              {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
              Preview voice
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
