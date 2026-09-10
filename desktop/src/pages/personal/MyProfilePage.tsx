import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileUp, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { PrototypeNotice } from "@/components/shared/PrototypeNotice";
import { usePrototypeValue } from "@/lib/prototype-store";
import { initials } from "@/lib/people";
import * as api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

interface BasicProfile {
  fullName: string;
  preferredName: string;
  photo?: string;
  dob: string;
  birthplace: string;
  location: string;
  languages: string;
  intro: string;
  instagram: string;
  facebook: string;
  twitter: string;
  linkedin: string;
  website: string;
}

const BLANK_BASIC: BasicProfile = {
  fullName: "",
  preferredName: "",
  dob: "",
  birthplace: "",
  location: "",
  languages: "",
  intro: "",
  instagram: "",
  facebook: "",
  twitter: "",
  linkedin: "",
  website: "",
};

const SOCIALS: { key: keyof BasicProfile; label: string; placeholder: string }[] = [
  { key: "instagram", label: "Instagram", placeholder: "@handle" },
  { key: "facebook", label: "Facebook", placeholder: "profile name or link" },
  { key: "twitter", label: "X (Twitter)", placeholder: "@handle" },
  { key: "linkedin", label: "LinkedIn", placeholder: "profile link" },
  { key: "website", label: "Website", placeholder: "https://" },
];

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function BasicProfileSection() {
  const [profile, setProfile] = usePrototypeValue<BasicProfile>("profile.basic", BLANK_BASIC);
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);

  function field<K extends keyof BasicProfile>(key: K, value: BasicProfile[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) field("photo", await fileToDataUrl(file));
  }

  function handleSave() {
    setProfile(draft);
    setSaved(true);
  }

  return (
    <section>
      <h2 className="mb-1 text-sm font-medium text-foreground">Basic Profile</h2>
      <p className="mb-4 text-sm text-muted-foreground">Tell Missy who you are. Update any of this anytime.</p>

      <div className="mb-5 flex items-center gap-3">
        <Avatar size="lg">
          <AvatarImage src={draft.photo} />
          <AvatarFallback>{initials(draft.preferredName || draft.fullName || "You")}</AvatarFallback>
        </Avatar>
        <div>
          <input id="basic-photo" type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          <Label htmlFor="basic-photo" className="cursor-pointer text-xs font-medium text-primary hover:underline">
            {draft.photo ? "Change photo" : "Add a profile photo"}
          </Label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="full-name">Full name</Label>
          <Input id="full-name" value={draft.fullName} onChange={(e) => field("fullName", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="preferred-name">Preferred name</Label>
          <Input id="preferred-name" value={draft.preferredName} onChange={(e) => field("preferredName", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dob">Date of birth</Label>
          <Input id="dob" type="date" value={draft.dob} onChange={(e) => field("dob", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="birthplace">Birthplace</Label>
          <Input id="birthplace" value={draft.birthplace} onChange={(e) => field("birthplace", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location">Current location</Label>
          <Input id="location" value={draft.location} onChange={(e) => field("location", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="languages">Languages</Label>
          <Input id="languages" placeholder="e.g. English, Hindi" value={draft.languages} onChange={(e) => field("languages", e.target.value)} />
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <Label htmlFor="intro">Short introduction</Label>
        <Textarea id="intro" rows={2} placeholder="One or two lines that sum you up." value={draft.intro} onChange={(e) => field("intro", e.target.value)} />
      </div>

      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-foreground">Social profiles</p>
        <div className="grid grid-cols-2 gap-3">
          {SOCIALS.map((social) => (
            <div key={social.key} className="space-y-1.5">
              <Label htmlFor={`social-${social.key}`}>{social.label}</Label>
              <Input
                id={`social-${social.key}`}
                placeholder={social.placeholder}
                value={(draft[social.key] as string) ?? ""}
                onChange={(e) => field(social.key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Stored so Missy knows who you are online. She can't read these accounts — see{" "}
          <Link to="/work/connectors" className="underline">
            Apps &amp; Connections
          </Link>{" "}
          for what's actually connectable.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={handleSave}>
          Save
        </Button>
        {saved && <span className="text-xs text-success">Saved.</span>}
      </div>
    </section>
  );
}

function PersonalBioSection() {
  const { token } = useAuthStore();
  const [profile, setProfile] = useState<api.Profile | null>(null);
  const [bio, setBio] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const p = await api.getProfile(token);
      setProfile(p);
      setBio(p?.user_about_me ?? "");
      setLoaded(true);
    })();
  }, [token]);

  async function handleSave() {
    if (!token || !profile) return;
    setBusy(true);
    setError(null);
    try {
      await api.saveProfile(token, { ...profile, user_about_me: bio });
      setProfile((prev) => (prev ? { ...prev, user_about_me: bio } : prev));
      setSaved(true);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-border pt-6">
      <h2 className="mb-1 text-sm font-medium text-foreground">Personal Bio</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Write as much as you want — this is the same free-text bio Missy already uses in every conversation.
      </p>
      {!loaded ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          {error && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Textarea
            rows={6}
            placeholder="Tell your assistant about yourself…"
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              setSaved(false);
            }}
          />
          <div className="mt-3 flex items-center gap-3">
            <Button size="sm" onClick={handleSave} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            {saved && <span className="text-xs text-success">Saved.</span>}
          </div>
        </>
      )}
    </section>
  );
}

function UploadYourStorySection() {
  const { token } = useAuthStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const source = await api.addKnowledgeFile(token, file.name, file);
      setResult({ title: source.title });
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="border-t border-border pt-6">
      <h2 className="mb-1 text-sm font-medium text-foreground">Upload Your Story</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Instead of typing everything by hand, upload a CV, biography, journal, or notes (PDF, DOCX, Markdown, or TXT).
        Missy reads it into her knowledge base right away and can answer questions about it in Chat — ask her there to
        pull out anything worth copying into your profile above.
      </p>

      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {result && (
        <Alert className="mb-3 border-success-soft bg-success-soft">
          <AlertDescription className="text-success">
            Added "{result.title}" to your Knowledge Base. Try asking Missy about it in Chat, or{" "}
            <Link to="/knowledge" className="underline">
              review it there
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <input ref={inputRef} type="file" accept=".pdf,.docx,.md,.txt" className="hidden" onChange={handleFile} />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
        {busy ? "Uploading…" : "Upload a document"}
      </Button>
    </section>
  );
}

export function MyProfilePage() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">My Profile</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl space-y-6">
          <PrototypeNotice>
            <strong className="font-medium text-foreground">Basic Profile</strong> is saved on this device only.
            Personal Bio and Upload Your Story below are fully real — they use your actual account.
          </PrototypeNotice>
          <BasicProfileSection />
          <PersonalBioSection />
          <UploadYourStorySection />
        </div>
      </div>
    </div>
  );
}
