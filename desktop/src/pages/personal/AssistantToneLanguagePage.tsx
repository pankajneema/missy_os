import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeValue } from "@/lib/prototype-store";
import { LANGUAGES, TONES } from "@/lib/constants";
import * as api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { SectionTabs, ASSISTANT_TABS } from "@/components/shared/SectionTabs";

interface ToneExtras {
  toneLevel: number; // 0 (soft) - 100 (direct)
  secondaryLanguages: string;
  autoDetect: boolean;
  mixedLanguageNote: string;
}

const BLANK_EXTRAS: ToneExtras = { toneLevel: 50, secondaryLanguages: "", autoDetect: false, mixedLanguageNote: "" };

export function AssistantToneLanguagePage() {
  const { token, setProfileInfo } = useAuthStore();
  const [profile, setProfile] = useState<api.Profile | null>(null);
  const [language, setLanguage] = useState("English");
  const [customLanguage, setCustomLanguage] = useState("");
  const [tone, setTone] = useState("No preference");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extras, setExtras] = usePrototypeValue<ToneExtras>("assistant.tone-extras", BLANK_EXTRAS);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const p = await api.getProfile(token);
      setProfile(p);
      if (p) {
        setLanguage(LANGUAGES.includes(p.response_language) ? p.response_language : "Other");
        if (!LANGUAGES.includes(p.response_language)) setCustomLanguage(p.response_language);
        setTone(p.tone_preference && TONES.includes(p.tone_preference) ? p.tone_preference : "No preference");
      }
      setLoaded(true);
    })();
  }, [token]);

  async function handleSave() {
    if (!token || !profile) return;
    const responseLanguage = language === "Other" ? customLanguage.trim() : language;
    if (!responseLanguage) {
      setError("Enter the language you want responses in.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.saveProfile(token, {
        ...profile,
        tone_preference: tone === "No preference" ? null : tone,
        response_language: responseLanguage,
      });
      setProfileInfo(profile.assistant_name, responseLanguage);
      setSaved(true);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Tone & Language</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={ASSISTANT_TABS} />
          <p className="mb-5 text-sm text-muted-foreground">How your assistant should sound, and which language it should reply in.</p>

          {!loaded ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {saved && (
                <Alert className="mb-4 border-success-soft bg-success-soft">
                  <AlertDescription className="text-success">Saved.</AlertDescription>
                </Alert>
              )}

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Tone</Label>
                  <Select value={tone} onValueChange={(v) => { setTone(v); setSaved(false); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Primary language (Missy replies in this)</Label>
                  <Select value={language} onValueChange={(v) => { setLanguage(v); setSaved(false); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {language === "Other" && (
                    <Input
                      className="mt-2"
                      placeholder="e.g. Bhojpuri, French, ..."
                      value={customLanguage}
                      onChange={(e) => { setCustomLanguage(e.target.value); setSaved(false); }}
                    />
                  )}
                </div>

                <Button onClick={handleSave} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </Button>
              </div>

              <div className="mt-8 border-t border-border pt-6">
                <h2 className="mb-1 text-sm font-medium text-foreground">Additional preferences</h2>
                <PrototypeNotice />

                <div className="space-y-5">
                  <div>
                    <Label className="mb-2 block">
                      Tone level: {extras.toneLevel < 35 ? "Soft" : extras.toneLevel > 65 ? "Direct" : "Balanced"}
                    </Label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={extras.toneLevel}
                      onChange={(e) => setExtras((prev) => ({ ...prev, toneLevel: Number(e.target.value) }))}
                      className="w-full accent-primary"
                    />
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Soft</span>
                      <span>Direct</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="secondary-languages">Secondary languages</Label>
                    <Input
                      id="secondary-languages"
                      placeholder="e.g. Hindi, French"
                      value={extras.secondaryLanguages}
                      onChange={(e) => setExtras((prev) => ({ ...prev, secondaryLanguages: e.target.value }))}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Automatic language detection</p>
                      <p className="text-xs text-muted-foreground">Reply in the same language you use.</p>
                    </div>
                    <Switch checked={extras.autoDetect} onCheckedChange={(v) => setExtras((prev) => ({ ...prev, autoDetect: v }))} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="mixed-language">Mixed-language preference</Label>
                    <Input
                      id="mixed-language"
                      placeholder='e.g. "Use Hinglish for normal conversation but English for professional documents."'
                      value={extras.mixedLanguageNote}
                      onChange={(e) => setExtras((prev) => ({ ...prev, mixedLanguageNote: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
