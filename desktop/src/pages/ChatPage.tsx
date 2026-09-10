import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import * as api from "@/lib/api";
import type { Conversation, Message, PendingConfirmation, ProviderCredential } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { MessageRow } from "@/components/chat/MessageRow";
import { ToolConfirmationCard } from "@/components/chat/ToolConfirmationCard";
import { Composer, type Attachment } from "@/components/chat/Composer";
import { ProviderPicker } from "@/components/chat/ProviderPicker";
import { ConversationSwitcher } from "@/components/chat/ConversationSwitcher";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { parseChatCommand } from "@/lib/chat-commands";
import { useChatCommands } from "@/lib/use-chat-commands";
import { LocalActionCard, type LocalAction } from "@/components/chat/LocalActionCard";
import { useTokenUsage } from "@/lib/token-usage";
import { useDayContext } from "@/lib/use-day-context";
import "highlight.js/styles/atom-one-light.css";

type LoadState = "loading" | "no-providers" | "all-revoked" | "ready" | "error";

const LAST_CONVERSATION_KEY = "missy.lastConversationId";

function readLastConversationId(): string | null {
  try {
    return localStorage.getItem(LAST_CONVERSATION_KEY);
  } catch {
    return null;
  }
}

function writeLastConversationId(id: string) {
  try {
    localStorage.setItem(LAST_CONVERSATION_KEY, id);
  } catch {
    // private-browsing or storage disabled - not persisting across restarts is fine
  }
}

async function getInitialConversation(token: string): Promise<{ conversation: Conversation; all: Conversation[] }> {
  const conversations = await api.listConversations(token);
  if (conversations.length === 0) {
    const created = await api.createConversation(token);
    return { conversation: created, all: [created] };
  }
  const lastId = readLastConversationId();
  const remembered = lastId ? conversations.find((c) => c.id === lastId) : undefined;
  const mostRecent = conversations.reduce((newest, c) => (c.created_at > newest.created_at ? c : newest));
  return { conversation: remembered ?? mostRecent, all: conversations };
}

export function ChatPage() {
  const { token, assistantName, responseLanguage } = useAuthStore();
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [providers, setProviders] = useState<ProviderCredential[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const [localActions, setLocalActions] = useState<LocalAction[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const { execute } = useChatCommands();
  const { recordTurn, recordLocalAction } = useTokenUsage();
  const withDayContext = useDayContext();
  const abortRef = useRef<AbortController | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, localActions, streamingText, statusText, pendingConfirmation]);

  async function bootstrap() {
    if (!token) return;
    try {
      const allProviders = await api.listProviders(token);
      const usable = allProviders.filter((p) => !p.is_revoked);

      if (allProviders.length === 0) {
        setState("no-providers");
        return;
      }
      if (usable.length === 0) {
        setState("all-revoked");
        return;
      }
      setProviders(usable);
      setSelectedProvider(usable.find((p) => p.is_active)?.provider ?? usable[0].provider);

      const { conversation: conv, all } = await getInitialConversation(token);
      setConversation(conv);
      setConversations(all);
      writeLastConversationId(conv.id);
      const [msgs, pending] = await Promise.all([
        api.getMessages(token, conv.id),
        api.getPendingConfirmation(token, conv.id),
      ]);
      setMessages(msgs);
      setPendingConfirmation(pending);
      setState("ready");
    } catch (err) {
      setErrorMessage(err instanceof api.ApiError ? err.message : "Something went wrong.");
      setState("error");
    }
  }

  async function selectConversation(target: Conversation) {
    if (!token || isGenerating || target.id === conversation?.id) return;
    setConversation(target);
    writeLastConversationId(target.id);
    setMessages([]);
    setLocalActions([]);
    setPendingConfirmation(null);
    const [msgs, pending] = await Promise.all([
      api.getMessages(token, target.id),
      api.getPendingConfirmation(token, target.id),
    ]);
    setMessages(msgs);
    setPendingConfirmation(pending);
  }

  async function handleNewChat() {
    if (!token || isGenerating) return;
    const created = await api.createConversation(token);
    setConversations((prev) => [created, ...prev]);
    setConversation(created);
    writeLastConversationId(created.id);
    setMessages([]);
    setLocalActions([]);
    setPendingConfirmation(null);
  }

  async function refreshFromServer() {
    if (!token || !conversation) return;
    const [msgs, pending] = await Promise.all([
      api.getMessages(token, conversation.id),
      api.getPendingConfirmation(token, conversation.id),
    ]);
    setMessages(msgs);
    setPendingConfirmation(pending);
  }

  async function consumeStream(events: AsyncGenerator<api.StreamEvent>): Promise<string> {
    let produced = "";
    setIsGenerating(true);
    setStreamingText("");
    // Shown immediately, before the first real event arrives - otherwise
    // there's a blank moment between hitting send and the connection
    // actually producing anything, which reads as the app hanging even
    // though the request is already in flight.
    setStatusText("Thinking…");
    try {
      for await (const event of events) {
        if (event.type === "status") {
          setStatusText(event.tool === "self-review" ? "Refining answer…" : `Using ${event.tool}…`);
        } else if (event.type === "token") {
          setStatusText(null);
          produced += event.text;
          setStreamingText((prev) => (prev ?? "") + event.text);
        } else if (event.type === "error") {
          setErrorMessage(event.detail);
          setState("error");
          return produced;
        }
        // "done" / "needs_confirmation": fall through to refresh below
      }
      await refreshFromServer();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        await refreshFromServer(); // the backend kept going server-side; sync whatever landed
      } else {
        setErrorMessage(err instanceof api.ApiError ? err.message : "Something went wrong.");
        setState("error");
      }
    } finally {
      setIsGenerating(false);
      setStreamingText(null);
      setStatusText(null);
      abortRef.current = null;
    }
    return produced;
  }

  async function handleSend(text: string, attachment: Attachment | null) {
    if (!token || !conversation) return;

    // Things like "add task X tomorrow" or "reply in Hindi" are handled right
    // here - instant, and no tokens spent. Anything unrecognised falls
    // through to the agent below exactly as before.
    const command = attachment ? null : parseChatCommand(text);
    if (command) {
      const result = await execute(command);
      setLocalActions((prev) => [...prev, { id: `local-${Date.now()}`, request: text, ...result }]);
      recordLocalAction();
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: text, created_at: new Date().toISOString() },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    const attachmentArg = attachment
      ? {
          kind: (attachment.isImage ? "image" : "document") as "image" | "document",
          filename: attachment.file.name,
          blob: attachment.file,
        }
      : undefined;

    const produced = await consumeStream(
      api.streamMessage(token, conversation.id, withDayContext(text), selectedProvider, attachmentArg, controller.signal),
    );
    recordTurn(text, produced);
  }

  async function handleConfirmationResolve(approved: boolean) {
    if (!token || !conversation || !pendingConfirmation) return;
    await consumeStream(api.streamConfirmToolCall(token, conversation.id, pendingConfirmation.id, approved));
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  async function handleListen(text: string, language: string) {
    if (!token) return;
    const buffer = await api.synthesizeSpeech(token, text, language);
    const url = URL.createObjectURL(new Blob([buffer], { type: "audio/mpeg" }));
    const audio = new Audio(url);
    await audio.play();
  }

  async function handleRecordToggle() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        if (!token) return;
        try {
          const transcribed = await api.transcribeAudio(token, "voice.webm", blob);
          if (transcribed.trim()) {
            await handleSend(transcribed.trim(), null);
          } else {
            setErrorMessage("Didn't catch any speech in that recording — try again.");
          }
        } catch (err) {
          setErrorMessage(err instanceof api.ApiError ? err.message : "Transcription failed.");
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setErrorMessage("Couldn't access the microphone.");
    }
  }

  if (state === "loading") {
    return (
      <div className="flex h-full flex-col">
        <div className="h-12 border-b border-border" />
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="h-24 w-3/4" />
          <Skeleton className="h-16 w-1/2" />
        </div>
      </div>
    );
  }

  if (state === "no-providers" || state === "all-revoked") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Alert className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{state === "no-providers" ? "No LLM provider connected yet" : "All connections are revoked"}</AlertTitle>
          <AlertDescription>
            {state === "no-providers"
              ? "Head to API Connections to add one before chatting."
              : "Head to API Connections to unrevoke one or add a new one."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="shrink-0 text-[13px] font-medium text-foreground">Chat with {assistantName}</h1>
          <ConversationSwitcher
            conversations={conversations}
            currentId={conversation?.id}
            disabled={isGenerating}
            onSelect={selectConversation}
            onNewChat={handleNewChat}
          />
        </div>
        <ProviderPicker providers={providers} value={selectedProvider} onChange={setSelectedProvider} />
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
        <div className="mx-auto max-w-2xl py-4">
          {messages.length === 0 && localActions.length === 0 && !streamingText && (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-foreground">No conversation yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Start a conversation with your AI worker.</p>
            </div>
          )}

          {messages.map((m) => (
            <MessageRow key={m.id} message={m} onListen={handleListen} responseLanguage={responseLanguage} />
          ))}

          {localActions.map((action) => (
            <LocalActionCard key={action.id} action={action} />
          ))}

          {(streamingText !== null || statusText) && (
            <div className="border-t border-border/60 py-3">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {assistantName}
              </div>
              {statusText && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {statusText}
                </p>
              )}
              {streamingText && <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{streamingText}</p>}
            </div>
          )}

          {pendingConfirmation && (
            <div className="py-3">
              <ToolConfirmationCard confirmation={pendingConfirmation} onResolve={handleConfirmationResolve} />
            </div>
          )}
        </div>
      </div>

      {!pendingConfirmation && (
        <div className="mx-auto w-full max-w-2xl">
          <Composer
            disabled={isGenerating}
            isGenerating={isGenerating}
            onSend={handleSend}
            onStop={handleStop}
            onRecordToggle={handleRecordToggle}
            isRecording={isRecording}
          />
        </div>
      )}
    </div>
  );
}
