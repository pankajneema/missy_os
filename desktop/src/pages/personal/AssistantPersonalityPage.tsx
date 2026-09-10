import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { SectionTabs, ASSISTANT_TABS } from "@/components/shared/SectionTabs";

const ARCHETYPES: { label: string; blurb: string }[] = [
  { label: "Professional", blurb: "Be professional, precise, and businesslike in every response." },
  { label: "Friendly", blurb: "Be warm, friendly, and approachable — like a helpful friend." },
  { label: "Technical", blurb: "Be technical and precise. Assume strong domain knowledge and don't oversimplify." },
  { label: "Researcher", blurb: "Be thorough and evidence-based. Cite reasoning and consider multiple angles." },
  { label: "Teacher", blurb: "Explain things step by step, the way a patient teacher would." },
  { label: "Executive Assistant", blurb: "Be efficient and organized, like a top-tier executive assistant." },
  { label: "Critical Thinker", blurb: "Challenge my ideas and point out flaws instead of always agreeing with me." },
  { label: "Casual", blurb: "Keep things relaxed and casual, like chatting with a friend." },
  { label: "Coach", blurb: "Be encouraging and push me toward my goals, like a personal coach." },
];

export function AssistantPersonalityPage() {
  const { token, setProfileInfo } = useAuthStore();
  const [profile, setProfile] = useState<api.Profile | null>(null);
  const [assistantName, setAssistantName] = useState("Missy");
  const [persona, setPersona] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const p = await api.getProfile(token);
      setProfile(p);
      if (p) {
        setAssistantName(p.assistant_name);
        setPersona(p.persona_description);
      }
      setLoaded(true);
    })();
  }, [token]);

  async function handleSave(nextPersona = persona) {
    if (!token || !profile) return;
    setBusy(true);
    setError(null);
    try {
      await api.saveProfile(token, {
        ...profile,
        assistant_name: assistantName.trim() || "Missy",
        persona_description: nextPersona,
      });
      setProfile((prev) => (prev ? { ...prev, assistant_name: assistantName, persona_description: nextPersona } : prev));
      setProfileInfo(assistantName.trim() || "Missy", profile.response_language);
      setPersona(nextPersona);
      setSaved(true);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function applyArchetype(blurb: string) {
    const next = persona.trim() ? `${persona.trim()}\n\n${blurb}` : blurb;
    setPersona(next);
    setSaved(false);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Personality</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <SectionTabs items={ASSISTANT_TABS} />
          <p className="mb-5 text-sm text-muted-foreground">Choose how your assistant should think and act.</p>

          {!loaded ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
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

              <div className="mb-5 space-y-1.5">
                <Label htmlFor="assistant-name">What should your assistant be called?</Label>
                <Input
                  id="assistant-name"
                  value={assistantName}
                  onChange={(e) => {
                    setAssistantName(e.target.value);
                    setSaved(false);
                  }}
                />
              </div>

              <div className="mb-5">
                <Label className="mb-2 block">Choose a personality</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ARCHETYPES.map((a) => (
                    <Button key={a.label} type="button" variant="outline" size="sm" onClick={() => applyArchetype(a.blurb)}>
                      {a.label}
                    </Button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">Adds a starting description below — edit it freely.</p>
              </div>

              <div className="mb-5 space-y-1.5">
                <Label htmlFor="persona">What kind of assistant do you want? (Custom)</Label>
                <Textarea
                  id="persona"
                  rows={6}
                  placeholder='e.g. "I want an assistant that challenges my ideas instead of always agreeing with me."'
                  value={persona}
                  onChange={(e) => {
                    setPersona(e.target.value);
                    setSaved(false);
                  }}
                />
              </div>

              <Button onClick={() => handleSave()} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
