import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mic, Square, Loader2, Zap, AudioLines, Settings, Ear } from "lucide-react";
import * as api from "@/lib/api";
import type { ProviderCredential } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useVoiceSession, type VoiceState, type MicProblem } from "@/lib/use-voice-session";
import { usePrototypeValue } from "@/lib/prototype-store";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

const VOICE_CONVERSATION_KEY = "missy.voiceConversationId";

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Ready",
  listening: "Listening… pause when you're done",
  transcribing: "Transcribing…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

/** Reuses one conversation across voice turns rather than starting a new
 * thread every time. */
async function getVoiceConversation(token: string): Promise<string> {
  const stored = localStorage.getItem(VOICE_CONVERSATION_KEY);
  const conversations = await api.listConversations(token);
  if (stored && conversations.some((c) => c.id === stored)) return stored;
  const created = await api.createConversation(token);
  try {
    localStorage.setItem(VOICE_CONVERSATION_KEY, created.id);
  } catch {
    /* ignore */
  }
  return created.id;
}

function Orb({ state, level, asleep }: { state: VoiceState; level: number; asleep: boolean }) {
  const active = state === "listening";
  // Level is roughly 0–0.3 in normal speech; scale it into something visible.
  const scale = active ? 1 + Math.min(level * 3.5, 0.6) : state === "speaking" ? 1.08 : 1;
  const busy = state === "transcribing" || state === "thinking";

  return (
    <div className="relative flex h-40 w-40 items-center justify-center">
      <div
        className={`absolute inset-0 rounded-full transition-all duration-75 ${
          active ? (asleep ? "bg-muted" : "bg-accent-soft") : state === "speaking" ? "bg-success-soft" : "bg-muted"
        }`}
        style={{ transform: `scale(${scale})` }}
      />
      <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-surface ring-1 ring-border">
        {busy ? (
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        ) : state === "speaking" ? (
          <AudioLines className="h-7 w-7 text-success" />
        ) : asleep && active ? (
          <Ear className="h-7 w-7 text-muted-foreground" />
        ) : (
          <Mic className={`h-7 w-7 ${active ? "text-primary" : "text-muted-foreground"}`} />
        )}
      </div>
    </div>
  );
}

const IS_MAC = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent);

/** A blocked microphone can only be fixed outside the app, so say exactly
 * where to go rather than repeating "couldn't access the microphone". */
function MicHelp({ problem, detail, onRetry }: { problem: Exclude<MicProblem, null>; detail: string | null; onRetry: () => void }) {
  if (problem === "missing") {
    return (
      <Alert className="mb-4">
        <AlertDescription>
          No microphone was detected. Plug one in or select an input under{" "}
          {IS_MAC ? "System Settings → Sound → Input" : "your system sound settings"}, then try again.
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (problem === "in-use" || problem === "unknown") {
    return (
      <Alert className="mb-4">
        <AlertDescription>
          <p className="font-medium text-foreground">
            {problem === "in-use" ? "The system wouldn't hand over the microphone" : "The microphone wouldn't start"}
          </p>
          {IS_MAC ? (
            <ul className="mt-1 list-inside list-disc space-y-1">
              <li>
                <strong className="font-medium text-foreground">Running from `tauri dev`?</strong> The dev build is a
                bare binary, not a bundled app, so macOS asks on behalf of the terminal that launched it. Grant the
                microphone to your terminal, or test a real build (<span className="font-mono">npm run tauri build</span>).
              </li>
              <li>Another app — a call, a recorder — may genuinely be holding the device.</li>
              <li>If you just updated the app, quit and reopen it so macOS re-reads its permissions.</li>
            </ul>
          ) : (
            <p className="mt-1">Another app may be holding the microphone, or the browser blocked the device.</p>
          )}
          {detail && <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">{detail}</p>}
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="mb-4">
      <AlertDescription>
        <p className="font-medium text-foreground">Microphone access is turned off</p>
        <p className="mt-1">
          {IS_MAC
            ? "Open System Settings → Privacy & Security → Microphone and switch this app on. If Missy isn't listed there, it hasn't asked the system yet — that happens with an unbundled dev build, so grant the microphone to your terminal or run a real build. In a browser tab, use the microphone icon in the address bar."
            : "Allow microphone access for this app in your system privacy settings, or via the microphone icon in the address bar if you're in a browser."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {IS_MAC && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // macOS deep-links straight to the Microphone privacy pane.
                window.location.href = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";
              }}
            >
              <Settings className="h-3.5 w-3.5" /> Open microphone settings
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function VoicePage() {
  const { token, responseLanguage } = useAuthStore();
  const [providers, setProviders] = useState<ProviderCredential[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [wakeWordEnabled, setWakeWordEnabled] = usePrototypeValue<boolean>("voice.wakeWordEnabled", true);
  const [wakeWord, setWakeWord] = usePrototypeValue<string>("voice.wakeWord", "Missy");

  const provider = providers.find((p) => p.is_active)?.provider ?? providers[0]?.provider ?? null;
  const hasGroq = providers.some((p) => p.provider === "groq");

  const { state, turns, level, error, micProblem, micDetail, listening, awake, ignoredAt, startListening, stop, clear } =
    useVoiceSession({
      token,
      provider,
      conversationId,
      language: responseLanguage || "English",
      wakeWord,
      wakeWordEnabled,
    });

  const asleep = listening && wakeWordEnabled && !awake;
  // Fades out on its own so an old notice can't be mistaken for a live one.
  const [ignoredVisible, setIgnoredVisible] = useState(false);
  useEffect(() => {
    if (!ignoredAt) return;
    setIgnoredVisible(true);
    const timer = setTimeout(() => setIgnoredVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [ignoredAt]);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        const all = await api.listProviders(token);
        setProviders(all.filter((p) => !p.is_revoked));
        setConversationId(await getVoiceConversation(token));
      } catch (err) {
        setSetupError(err instanceof api.ApiError ? err.message : "Couldn't set up voice.");
      }
    })();
  }, [token]);


  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-6">
        <h1 className="text-[13px] font-medium text-foreground">Voice</h1>
        {listening && (
          <span className={`flex items-center gap-1.5 text-xs ${asleep ? "text-muted-foreground" : "text-success"}`}>
            <span
              className={`h-1.5 w-1.5 animate-pulse rounded-full ${asleep ? "bg-muted-foreground" : "bg-success"}`}
            />
            {asleep ? `Waiting for “${wakeWord}”` : "Conversation on"}
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl">
          {!hasGroq && (
            <Alert className="mb-4">
              <AlertDescription>
                Speech-to-text runs on Groq, so add a Groq key under{" "}
                <Link to="/connections" className="underline">
                  AI Providers
                </Link>
                . It's the <strong className="font-medium text-foreground">same</strong> Groq API key used for chat —
                one key covers both, there's no separate voice key. Replies are spoken back in{" "}
                {responseLanguage || "English"}.
              </AlertDescription>
            </Alert>
          )}
          {(error || setupError) && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error ?? setupError}</AlertDescription>
            </Alert>
          )}

          {micProblem && <MicHelp problem={micProblem} detail={micDetail} onRetry={startListening} />}

          <div className="flex flex-col items-center py-4">
            <Orb state={state} level={level} asleep={asleep} />
            <p className="mt-2 text-sm text-muted-foreground">
              {asleep && state === "listening" ? `Listening — say “${wakeWord}” when you want me` : STATE_LABEL[state]}
            </p>
            {asleep && ignoredVisible && (
              <p className="mt-1 text-xs text-muted-foreground">
                Heard that, but it wasn't addressed to me.
              </p>
            )}

            <div className="mt-4 flex gap-2">
              {!listening ? (
                <Button onClick={startListening} disabled={!token}>
                  <Mic className="h-4 w-4" /> Start conversation
                </Button>
              ) : (
                <Button variant="outline" onClick={stop}>
                  <Square className="h-3 w-3 fill-current" /> End conversation
                </Button>
              )}
              {turns.length > 0 && !listening && (
                <Button variant="ghost" onClick={clear}>
                  Clear
                </Button>
              )}
            </div>

            <p className="mt-3 max-w-sm text-center text-xs text-muted-foreground">
              {!listening
                ? "Starts a continuous conversation — you won't need to press anything between turns."
                : wakeWordEnabled
                  ? `Say “${wakeWord}” to get my attention — you can do it in one breath, like “${wakeWord}, add a meeting tomorrow at 3”. After that I stay with you for follow-ups; say “that's all” and I go quiet again.`
                  : "Just keep talking — it listens, answers, then listens again. It only stops when you end the conversation."}
            </p>
            <p className="mt-2 max-w-sm text-center text-xs text-muted-foreground">
              Commands like “add task call the client tomorrow” or “reply in Hindi” are handled instantly in the app,
              without an AI call. Anything else goes to {"Missy"} and is spoken back as it's generated.
            </p>
          </div>

          <div className="mt-5 rounded-lg border border-border bg-surface-subtle/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Only answer when called</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  It keeps listening the whole time, but stays quiet until it hears its name.
                </p>
              </div>
              <Switch checked={wakeWordEnabled} onCheckedChange={setWakeWordEnabled} />
            </div>
            {wakeWordEnabled && (
              <div className="mt-3 flex items-center gap-2">
                <label htmlFor="wake-word" className="text-xs text-muted-foreground">
                  Name
                </label>
                <Input
                  id="wake-word"
                  value={wakeWord}
                  onChange={(e) => setWakeWord(e.target.value)}
                  className="h-8 w-40 text-sm"
                  placeholder="Missy"
                />
                <span className="text-xs text-muted-foreground">
                  Near-misses count, so “Missi” or “Messy” still wake it.
                </span>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Everything you say while a conversation is on is sent to Groq to be transcribed — that is the only way it
              can tell whether it was called. Nothing is answered or shown unless it hears the name.
            </p>
          </div>

          {turns.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              {turns.map((turn) => (
                <div key={turn.id} className="border-b border-border/60 py-3 last:border-b-0">
                  <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {turn.role === "you" ? "You" : "Missy"}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{turn.text || "…"}</p>
                  {turn.local && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Zap className="h-3 w-3" /> Done in the app · no AI credits used
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
