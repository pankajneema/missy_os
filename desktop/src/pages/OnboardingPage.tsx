import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { LANGUAGES, TONES } from "@/lib/constants";

export function OnboardingPage() {
  const { token, completeOnboarding } = useAuthStore();
  const [language, setLanguage] = useState("English");
  const [customLanguage, setCustomLanguage] = useState("");
  const [tone, setTone] = useState("No preference");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const assistantName = String(form.get("assistant_name") || "").trim() || "Missy";
    const userAboutMe = String(form.get("user_about_me") || "").trim();
    const personaDescription = String(form.get("persona_description") || "").trim();

    if (!userAboutMe || !personaDescription) {
      setError("Tell Missy a bit about yourself and what you want from her before continuing.");
      return;
    }
    const responseLanguage = language === "Other" ? customLanguage.trim() : language;
    if (!responseLanguage) {
      setError("Enter the language you want responses in.");
      return;
    }

    setBusy(true);
    try {
      await api.saveProfile(token!, {
        assistant_name: assistantName,
        persona_description: personaDescription,
        user_about_me: userAboutMe,
        tone_preference: tone === "No preference" ? null : tone,
        response_language: responseLanguage,
      });
      completeOnboarding(assistantName, responseLanguage);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Let's set Missy up</h1>
        <p className="mt-1 mb-8 text-sm text-muted-foreground">
          This is a one-time setup — it shapes how your assistant talks to you from now on.
        </p>

        <div className="space-y-1.5 mb-6">
          <Label>Reply in which language?</Label>
          <Select value={language} onValueChange={setLanguage}>
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
              onChange={(e) => setCustomLanguage(e.target.value)}
            />
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="assistant_name">What should your assistant be called?</Label>
            <Input id="assistant_name" name="assistant_name" defaultValue="Missy" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="user_about_me">Tell your assistant about yourself</Label>
            <Textarea
              id="user_about_me"
              name="user_about_me"
              rows={4}
              placeholder="e.g. I'm a backend engineer, working solo on a side project. I prefer direct, technical answers."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="persona_description">What kind of assistant do you want?</Label>
            <Textarea
              id="persona_description"
              name="persona_description"
              rows={4}
              placeholder="e.g. Act like a sharp technical co-founder — push back on bad ideas, keep answers concise, help me think through architecture and code."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Preferred tone (optional)</Label>
            <Select value={tone} onValueChange={setTone}>
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

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Finish setup"}
          </Button>
        </form>
      </div>
    </div>
  );
}
