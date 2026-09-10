import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";
import { parseChatCommand } from "@/lib/chat-commands";
import { useChatCommands } from "@/lib/use-chat-commands";
import { useTokenUsage } from "@/lib/token-usage";
import { useDayContext } from "@/lib/use-day-context";
import { isSleepPhrase, matchWakeWord } from "@/lib/wake-word";

export type VoiceState = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

/** Why the microphone couldn't be used - "denied" is the one worth guiding
 * the user out of, since the fix lives in OS/browser settings, not the app. */
export type MicProblem = "denied" | "missing" | "in-use" | "unknown" | null;

export interface VoiceTurn {
  id: string;
  role: "you" | "assistant";
  text: string;
  /** Answered inside the app, without a model. */
  local?: boolean;
}

const SILENCE_RMS = 0.012; // below this counts as quiet
const SILENCE_HOLD_MS = 1600; // a real conversational pause, not a clipped one
const MIN_SPEECH_MS = 500; // ignore stray clicks and room noise
const MAX_TURN_MS = 45_000; // room to finish a longer thought
/** If nobody says anything, close the recording and open a fresh one rather
 * than holding a long file of silence. Silence sent to speech-to-text comes
 * back as invented words, so it must never leave the app. */
const NO_SPEECH_MS = 10_000;
/** How long it keeps answering after being called, so follow-ups don't need
 * the name every single time. Repeating "Missy" before each sentence is what
 * makes voice assistants feel like a machine. */
const FOLLOW_UP_MS = 45_000;

/** Splits streamed text into speakable chunks as it arrives. Waiting for the
 * whole reply before speaking is what makes voice assistants feel slow, so
 * we hand each finished sentence to the synthesiser immediately. */
function takeSentences(buffer: string, flushAll: boolean): { chunks: string[]; rest: string } {
  const chunks: string[] = [];
  let rest = buffer;

  for (;;) {
    const match = rest.match(/^([\s\S]*?[.!?…]["')\]]?)(\s+)/);
    if (match && match[1].trim().length >= 2) {
      chunks.push(match[1].trim());
      rest = rest.slice(match[0].length);
      continue;
    }
    // A long clause with no punctuation yet - break it so speech can start.
    if (rest.length > 220) {
      const cut = rest.lastIndexOf(" ", 200);
      if (cut > 40) {
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut + 1);
        continue;
      }
    }
    break;
  }

  if (flushAll && rest.trim()) {
    chunks.push(rest.trim());
    rest = "";
  }
  return { chunks, rest };
}

export function useVoiceSession({
  token,
  provider,
  conversationId,
  language,
  wakeWord,
  wakeWordEnabled,
}: {
  token: string | null;
  provider: string | null;
  conversationId: string | null;
  language: string;
  /** The name it answers to. */
  wakeWord: string;
  /** When off, it replies to everything it hears. */
  wakeWordEnabled: boolean;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [micProblem, setMicProblem] = useState<MicProblem>(null);
  const [micDetail, setMicDetail] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  /** Awake = it will answer. Asleep = it hears you but stays quiet. */
  const [awake, setAwake] = useState(false);
  /** When it last heard speech that wasn't meant for it, so the UI can say so. */
  const [ignoredAt, setIgnoredAt] = useState<number | null>(null);

  const { execute } = useChatCommands();
  const { recordTurn, recordLocalAction } = useTokenUsage();
  const withDayContext = useDayContext();

  // Kept across turns so we don't pay for getUserMedia + AudioContext setup
  // every single time someone speaks.
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  /** Deliberately a timer, not requestAnimationFrame. rAF stops completely
   * while the window is hidden or behind another one - which is precisely
   * when you'd be talking hands-free - and the turn would then never end. */
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  /** True for as long as the conversation is running. */
  const sessionRef = useRef(false);
  const awakeRef = useRef(false);
  const lastExchangeRef = useRef(0);
  // Read inside a loop that outlives the render it started in, so these have
  // to be refs - a dependency would only update the next closure, not this one.
  const wakeWordRef = useRef(wakeWord);
  const wakeEnabledRef = useRef(wakeWordEnabled);
  wakeWordRef.current = wakeWord;
  wakeEnabledRef.current = wakeWordEnabled;

  const addTurn = useCallback((turn: VoiceTurn) => setTurns((prev) => [...prev, turn]), []);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, []);

  /** Synthesises each chunk while the previous one is still playing, so the
   * gap between sentences stays small. */
  const speakChunks = useCallback(
    async (getNext: () => string | undefined) => {
      if (!token) return;
      let pending: Promise<string | null> | null = null;

      const synth = async (text: string): Promise<string | null> => {
        try {
          const buffer = await api.synthesizeSpeech(token, text, language);
          return URL.createObjectURL(new Blob([buffer], { type: "audio/mpeg" }));
        } catch {
          return null; // a failed chunk shouldn't kill the whole reply
        }
      };

      let current = getNext();
      if (current === undefined) return;
      pending = synth(current);

      while (current !== undefined) {
        const url = await pending;
        const following = getNext();
        pending = following !== undefined ? synth(following) : null;

        if (url && !cancelledRef.current) {
          await new Promise<void>((resolve) => {
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            audio.play().catch(() => resolve());
          });
          URL.revokeObjectURL(url);
        }
        if (cancelledRef.current) break;
        current = following;
      }
    },
    [token, language],
  );

  /** Answering to your name alone, the way a person would. */
  const acknowledge = useCallback(async () => {
    const hindi = /hindi|hinglish|urdu|marathi|punjabi/i.test(language);
    const message = hindi ? "Haan, boliye." : "Yes?";
    addTurn({ id: `a-${Date.now()}`, role: "assistant", text: message, local: true });
    setState("speaking");
    const queue = [message];
    await speakChunks(() => queue.shift());
  }, [addTurn, speakChunks, language]);

  const handleTranscript = useCallback(
    async (text: string) => {
      if (cancelledRef.current) return;
      addTurn({ id: `you-${Date.now()}`, role: "you", text });

      // Same command layer as chat: instant, and no tokens spent.
      const command = parseChatCommand(text);
      if (command) {
        const result = await execute(command);
        recordLocalAction();
        addTurn({ id: `a-${Date.now()}`, role: "assistant", text: result.message, local: true });
        setState("speaking");
        const queue = [result.message];
        await speakChunks(() => queue.shift());
        return;
      }

      if (!provider || !conversationId) {
        const message = "I need an AI provider connected before I can answer that.";
        addTurn({ id: `a-${Date.now()}`, role: "assistant", text: message });
        setState("speaking");
        const queue = [message];
        await speakChunks(() => queue.shift());
        return;
      }

      setState("thinking");
      const controller = new AbortController();
      abortRef.current = controller;

      const queue: string[] = [];
      let buffer = "";
      let full = "";
      let speaking: Promise<void> | null = null;
      const turnId = `a-${Date.now()}`;
      addTurn({ id: turnId, role: "assistant", text: "" });

      const pump = () => {
        if (!speaking && queue.length) {
          setState("speaking");
          speaking = speakChunks(() => queue.shift()).then(() => {
            speaking = null;
            if (queue.length) pump();
          });
        }
      };

      try {
        for await (const event of api.streamMessage(token!, conversationId, withDayContext(text), provider, undefined, controller.signal)) {
          if (cancelledRef.current) break;
          if (event.type === "token") {
            full += event.text;
            buffer += event.text;
            setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, text: full } : t)));
            const { chunks, rest } = takeSentences(buffer, false);
            buffer = rest;
            if (chunks.length) {
              queue.push(...chunks);
              pump();
            }
          } else if (event.type === "error") {
            setError(event.detail);
            break;
          }
        }
        const { chunks } = takeSentences(buffer, true);
        if (chunks.length) {
          queue.push(...chunks);
          pump();
        }
        recordTurn(text, full);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
        }
      }

      if (speaking) await speaking;
    },
    [addTurn, execute, provider, conversationId, token, speakChunks, recordTurn, recordLocalAction, withDayContext],
  );

  /** Opens the mic once and keeps it, so later turns don't pay setup cost. */
  const ensureMic = useCallback(async (): Promise<boolean> => {
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          // Echo cancellation matters here: without it the assistant's own
          // speech comes back through the mic and it talks to itself.
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      }
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
        const source = audioCtxRef.current.createMediaStreamSource(streamRef.current);
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef.current = analyser;
      }
      if (audioCtxRef.current.state === "suspended") await audioCtxRef.current.resume();
      return true;
    } catch (err) {
      // getUserMedia reports the reason through DOMException.name. Only some
      // of these have a cause we can state with confidence - for the rest,
      // show the real error rather than inventing a diagnosis.
      const name = err instanceof DOMException ? err.name : "";
      setMicDetail(err instanceof Error ? `${err.name}: ${err.message}` : String(err));

      if (name === "NotAllowedError" || name === "SecurityError") {
        setMicProblem("denied");
        setError("Microphone access is blocked.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setMicProblem("missing");
        setError("No microphone was found on this device.");
      } else if (name === "NotReadableError" || name === "AbortError") {
        setMicProblem("in-use");
        setError("The system wouldn't hand over the microphone.");
      } else {
        setMicProblem("unknown");
        setError("Couldn't start the microphone.");
      }
      return false;
    }
  }, []);

  /** Records until the speaker pauses, then resolves with the audio.
   * Resolves null when nothing worth sending was captured. */
  const recordUntilPause = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      let heardSpeech = false;

      const recorder = new MediaRecorder(streamRef.current!);
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        if (tickRef.current !== null) clearInterval(tickRef.current);
        tickRef.current = null;
        setLevel(0);
        // No voice in it means there is nothing to transcribe, however many
        // bytes of room tone the encoder produced.
        if (!heardSpeech) return resolve(null);
        const blob = new Blob(chunks, { type: "audio/webm" });
        resolve(blob.size < 2000 ? null : blob);
      };
      recorder.start();
      setState("listening");

      const analyser = analyserRef.current!;
      const data = new Uint8Array(analyser.fftSize);
      const startedAt = performance.now();
      let lastLoudAt = performance.now();

      const finish = () => {
        if (tickRef.current !== null) clearInterval(tickRef.current);
        tickRef.current = null;
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
        else resolve(null);
      };

      const tick = () => {
        if (!sessionRef.current) return finish();
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(rms);

        const now = performance.now();
        if (rms > SILENCE_RMS) {
          lastLoudAt = now;
          if (now - startedAt > MIN_SPEECH_MS) heardSpeech = true;
        }
        const quietFor = now - lastLoudAt;
        const doneSpeaking = heardSpeech && quietFor > SILENCE_HOLD_MS;
        const nothingSaid = !heardSpeech && now - startedAt > NO_SPEECH_MS;
        if (doneSpeaking || nothingSaid || now - startedAt > MAX_TURN_MS) finish();
      };
      // 100ms is plenty for a 1.6s pause, and browsers clamp this to ~1s in a
      // hidden window - still frequent enough for the turn to end on its own.
      tickRef.current = setInterval(tick, 100);
    });
  }, []);

  /** The whole conversation: listen, answer, listen again - until stopped.
   * Written as a loop on purpose. The previous version restarted itself from
   * inside callbacks, and every early `return` silently ended the session,
   * which is what made you press Start again and again. */
  const runSession = useCallback(async () => {
    while (sessionRef.current) {
      const blob = await recordUntilPause();
      if (!sessionRef.current) break;
      if (!blob || !token) continue; // nothing usable - just keep listening

      setState("transcribing");
      let text = "";
      try {
        text = (await api.transcribeAudio(token, "voice.webm", blob)).trim();
      } catch (err) {
        setError(err instanceof api.ApiError ? err.message : "Transcription failed.");
        continue; // a failed turn shouldn't end the conversation
      }
      if (!text || !sessionRef.current) continue;

      let request = text;
      if (wakeEnabledRef.current) {
        const remainder = matchWakeWord(text, wakeWordRef.current);
        const addressed = remainder !== null;
        const windowOpen = Date.now() - lastExchangeRef.current < FOLLOW_UP_MS;

        // Heard, but not meant for it. Nothing is displayed or answered.
        if (!addressed && (!awakeRef.current || !windowOpen)) {
          if (awakeRef.current) {
            awakeRef.current = false;
            setAwake(false);
          }
          setIgnoredAt(Date.now());
          continue;
        }

        const body = addressed ? remainder! : text;
        if (isSleepPhrase(body) || isSleepPhrase(text)) {
          awakeRef.current = false;
          setAwake(false);
          continue;
        }

        awakeRef.current = true;
        setAwake(true);
        if (!body.trim()) {
          lastExchangeRef.current = Date.now();
          try {
            await acknowledge();
          } catch {
            /* a failed chime shouldn't end the conversation */
          }
          lastExchangeRef.current = Date.now();
          continue;
        }
        request = body;
      }

      try {
        await handleTranscript(request);
      } catch {
        /* handled inside; keep the session alive */
      }
      lastExchangeRef.current = Date.now();
    }
    setState("idle");
    setLevel(0);
  }, [token, recordUntilPause, handleTranscript, acknowledge]);

  const startListening = useCallback(async () => {
    if (sessionRef.current) return;
    setError(null);
    setMicProblem(null);
    setMicDetail(null);
    cancelledRef.current = false;
    stopPlayback();

    if (!(await ensureMic())) {
      setState("idle");
      return;
    }
    sessionRef.current = true;
    setListening(true);
    awakeRef.current = !wakeWordEnabled;
    setAwake(!wakeWordEnabled);
    setIgnoredAt(null);
    lastExchangeRef.current = 0;
    void runSession();
  }, [ensureMic, runSession, stopPlayback, wakeWordEnabled]);

  const stop = useCallback(() => {
    // Ends this session only - it must not change the user's preference,
    // which is what previously turned hands-free off for good.
    sessionRef.current = false;
    cancelledRef.current = true;
    setListening(false);
    awakeRef.current = false;
    setAwake(false);
    abortRef.current?.abort();
    stopPlayback();
    if (tickRef.current !== null) clearInterval(tickRef.current);
    tickRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setState("idle");
    setLevel(0);
  }, [stopPlayback]);

  useEffect(() => {
    return () => {
      sessionRef.current = false;
      cancelledRef.current = true;
      abortRef.current?.abort();
      if (tickRef.current !== null) clearInterval(tickRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void audioCtxRef.current?.close();
    };
  }, []);

  return {
    state,
    turns,
    level,
    error,
    micProblem,
    micDetail,
    listening,
    awake,
    ignoredAt,
    startListening,
    stop,
    clear: () => setTurns([]),
  };
}
