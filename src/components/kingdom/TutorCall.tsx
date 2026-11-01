"use client";

// ─── Scholar's Kingdom · Task 4-b: Live AI Tutor Calling ────────────────────
// A real-time two-way VOICE conversation with Professor Sage:
//   SpeechRecognition (STT) → kingdomApi.tutor.chat → kingdomApi.tutor.voice (TTS)
//   + homework-photo understanding mid-call (tutor.vision).
// Everything degrades gracefully: no mic → text fallback, no TTS → speechSynthesis,
// no audio at all → transcript still works (voice is an enhancement, never a blocker).

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Camera, Keyboard, PhoneOff, PhoneCall, Volume2, VolumeX, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useKingdom } from "@/lib/kingdom/store";
import { kingdomApi } from "@/lib/kingdom/client";
import type { TutorMessage } from "@/lib/kingdom/types";
import { MagicDust } from "./MagicDust";

// ─── Types ───────────────────────────────────────────────────────────────────

type CallPhase = "connecting" | "live" | "ended";
type CallStatus = "idle" | "listening" | "thinking" | "speaking";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

// Minimal structural typings for the browser SpeechRecognition API (vendor-prefixed,
// not in lib.dom for all TS versions — we never touch the globals directly).

interface SRAltResult {
  transcript: string;
}
interface SRResultLike {
  isFinal: boolean;
  readonly length: number;
  [index: number]: SRAltResult;
}
interface SREventLike {
  readonly results: { readonly length: number; [index: number]: SRResultLike };
}
interface SRErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SREventLike) => void) | null;
  onerror: ((event: SRErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const THINKING_LINES = [
  "Consulting the archives…",
  "Consulting the board's blueprints…",
  "The Scribes are writing…",
  "Searching the royal library…",
];
const VISION_LINES = [
  "Studying your photo…",
  "Reading the problem carefully…",
  "Tracing every line of the diagram…",
];

const PHOTO_QUESTION = "Explain this homework problem step by step";

function fmtDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Load a File into a data URL. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/** Compress a picked photo: longest side ≤ 1280px, JPEG q=0.85 → data URL. */
async function compressPhoto(file: File): Promise<string> {
  const raw = await readFileAsDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = document.createElement("img");
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode the image"));
    el.src = raw;
  });
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (longest <= 0) return raw;
  const scale = Math.min(1, 1280 / longest);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", 0.85);
    return out.length > 64 ? out : raw;
  } catch {
    return raw;
  }
}

// ─── Small presentational bits ───────────────────────────────────────────────

function SpeakingBars({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-end gap-[3px] ${className}`} aria-hidden>
      <span className="h-2 w-[3px] animate-bounce rounded-full bg-[#eda93f] opacity-80" />
      <span className="h-3.5 w-[3px] animate-bounce rounded-full bg-[#8e4fd0] [animation-delay:160ms]" />
      <span className="h-2 w-[3px] animate-bounce rounded-full bg-[#eda93f] opacity-60 [animation-delay:320ms]" />
    </span>
  );
}

function SageMiniAvatar() {
  return (
    <span className="clay-well mt-auto flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full">
      <Image
        src="/kingdom/tutor-owl-clay.png"
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 object-cover"
        onError={(e) => {
          e.currentTarget.style.opacity = "0";
        }}
      />
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function TutorCall() {
  const tutorContext = useKingdom((s) => s.tutorContext);

  // Call lifecycle
  const [phase, setPhase] = useState<CallPhase>("connecting");
  const [status, setStatus] = useState<CallStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [callId, setCallId] = useState(0);
  const [endOpen, setEndOpen] = useState(false);

  // Conversation
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [thinkIdx, setThinkIdx] = useState(0);

  // Input
  const [micOn, setMicOn] = useState(false);
  const [interim, setInterim] = useState("");
  const [textOpen, setTextOpen] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [muted, setMuted] = useState(false);
  const [srAvailable, setSrAvailable] = useState(true);

  // Refs — the whole voice loop is orchestrated through refs so that
  // late async callbacks (TTS onended, SR finals, fetches) always act on
  // the CURRENT truth instead of a stale render closure.
  const messagesRef = useRef<ChatMsg[]>([]);
  const phaseRef = useRef<CallPhase>("connecting");
  const statusRef = useRef<CallStatus>("idle");
  const micOnRef = useRef(false);
  const mutedRef = useRef(false);
  const userStopRef = useRef(false);
  const speakEpochRef = useRef(0); // bumped on every interrupt/end → invalidates stale voice callbacks
  const callSeqRef = useRef(0); // bumped on every new call → drops in-flight replies from a previous call
  const safetyTimersRef = useRef<number[]>([]);
  const idSeqRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const nextId = () => `m${++idSeqRef.current}`;

  // ── Ref-mirroring setters ─────────────────────────────────────────────────
  function setPhaseSafe(p: CallPhase) {
    phaseRef.current = p;
    setPhase(p);
  }
  /** Non-narrowable read — the ref can flip to "ended" across any await/callback. */
  function isCallEnded(): boolean {
    return phaseRef.current === "ended";
  }
  function setStatusSafe(s: CallStatus) {
    statusRef.current = s;
    setStatus(s);
  }
  function appendMessage(m: ChatMsg) {
    messagesRef.current = [...messagesRef.current, m];
    setMessages(messagesRef.current);
  }
  function resetTranscript() {
    messagesRef.current = [];
    setMessages([]);
  }

  /** History payload for the API (image data stripped to keep requests light). */
  function historyForApi(): TutorMessage[] {
    return messagesRef.current.slice(-16).map((m) => ({ role: m.role, content: m.content }));
  }

  // ── Playback plumbing (single reused <audio> + speechSynthesis fallback) ──

  function ensureAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      audioRef.current = a;
    }
    return audioRef.current;
  }

  /** Stop every sound Sage is making right now (no epoch bump). */
  function haltPlayback() {
    try {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.onended = null;
        a.onerror = null;
      }
    } catch {
      /* noop */
    }
    if (audioUrlRef.current) {
      try {
        URL.revokeObjectURL(audioUrlRef.current);
      } catch {
        /* noop */
      }
      audioUrlRef.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* noop */
    }
  }

  function finishSpeaking(epoch: number) {
    if (epoch !== speakEpochRef.current) return;
    setSpeakingId(null);
    setStatusSafe(micOnRef.current ? "listening" : "idle");
  }

  /** Browser speechSynthesis fallback when the Kingdom TTS voice fails. */
  function fallbackSpeak(text: string, epoch: number) {
    try {
      if (epoch !== speakEpochRef.current) return;
      if (mutedRef.current || isCallEnded()) {
        finishSpeaking(epoch);
        return;
      }
      if (typeof window === "undefined" || !window.speechSynthesis) {
        finishSpeaking(epoch);
        return;
      }
      haltPlayback();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1;
      u.pitch = 0.95;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        finishSpeaking(epoch);
      };
      u.onend = finish;
      u.onerror = finish;
      // Safety: some engines never fire onend — estimate the spoken duration.
      const est = Math.max(6000, text.length * 110);
      const t = window.setTimeout(finish, est);
      safetyTimersRef.current.push(t);
      window.speechSynthesis.speak(u);
    } catch {
      finishSpeaking(epoch);
    }
  }

  /** The voice of Professor Sage: kingdom TTS → speechSynthesis → silent (text still shows). */
  async function speak(text: string, id: string) {
    // strip markdown & typographic glyphs so they are never spoken aloud
    const clean = text
      .replace(/[*_`#>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 950);
    if (!clean) return;
    if (mutedRef.current || isCallEnded()) {
      setSpeakingId(null);
      setStatusSafe(micOnRef.current ? "listening" : "idle");
      return;
    }
    haltPlayback();
    speakEpochRef.current += 1;
    const epoch = speakEpochRef.current;
    setStatusSafe("speaking");
    setSpeakingId(id);
    try {
      const blob = await kingdomApi.tutor.voice(clean);
      if (mutedRef.current || isCallEnded() || speakEpochRef.current !== epoch) return;
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = ensureAudio();
      audio.onended = () => finishSpeaking(epoch);
      audio.onerror = () => {
        void fallbackSpeak(clean, epoch);
      };
      audio.src = url;
      try {
        await audio.play();
      } catch {
        void fallbackSpeak(clean, epoch);
      }
    } catch {
      void fallbackSpeak(clean, epoch);
    }
  }

  /** Barge-in: students can interrupt Professor Sage mid-sentence. */
  function interruptSage() {
    const wasSpeaking = statusRef.current === "speaking";
    speakEpochRef.current += 1;
    haltPlayback();
    if (wasSpeaking) {
      setSpeakingId(null);
      setStatusSafe(micOnRef.current ? "listening" : "idle");
    }
  }

  // ── Sending flow (shared by voice + text + photo) ─────────────────────────

  async function handleSend(text: string) {
    const clean = text.trim();
    if (!clean || isCallEnded()) return;
    interruptSage();
    const seq = callSeqRef.current;
    appendMessage({ id: nextId(), role: "user", content: clean });
    setStatusSafe("thinking");
    try {
      const st = useKingdom.getState();
      const { reply } = await kingdomApi.tutor.chat(
        historyForApi(),
        st.tutorContext?.subject,
        st.tutorContext?.chapter,
      );
      if (seq !== callSeqRef.current || isCallEnded()) return;
      const replyText = (reply ?? "").trim();
      if (!replyText) throw new Error("Professor Sage went quiet — try asking again.");
      const rid = nextId();
      appendMessage({ id: rid, role: "assistant", content: replyText });
      void speak(replyText, rid);
    } catch (err) {
      if (seq !== callSeqRef.current) return;
      toast.error(err instanceof Error ? err.message : "Professor Sage lost the connection…");
      setStatusSafe(micOnRef.current ? "listening" : "idle");
    }
  }

  async function handlePhotoSend(dataUrl: string) {
    if (isCallEnded()) return;
    interruptSage();
    const seq = callSeqRef.current;
    appendMessage({ id: nextId(), role: "user", content: PHOTO_QUESTION, imageUrl: dataUrl });
    setStatusSafe("thinking");
    try {
      const { reply } = await kingdomApi.tutor.vision(dataUrl, PHOTO_QUESTION, historyForApi());
      if (seq !== callSeqRef.current || isCallEnded()) return;
      const replyText = (reply ?? "").trim();
      if (!replyText) throw new Error("Professor Sage couldn't see the photo clearly — try again.");
      const rid = nextId();
      appendMessage({ id: rid, role: "assistant", content: replyText });
      void speak(replyText, rid);
    } catch (err) {
      if (seq !== callSeqRef.current) return;
      toast.error(err instanceof Error ? err.message : "Professor Sage couldn't see the photo…");
      setStatusSafe(micOnRef.current ? "listening" : "idle");
    }
  }

  function submitText() {
    const t = textDraft.trim();
    if (!t) return;
    setTextDraft("");
    void handleSend(t);
  }

  async function onPhotoPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await compressPhoto(file);
      if (isCallEnded()) return;
      void handlePhotoSend(dataUrl);
    } catch {
      toast.error("Couldn't read that photo — try another one.");
    }
  }

  // ── Speech recognition (the student's voice) ──────────────────────────────

  function resetMic() {
    micOnRef.current = false;
    setMicOn(false);
    setInterim("");
    if (statusRef.current === "listening") setStatusSafe("idle");
  }

  function ensureRecognition(): SpeechRecognitionLike | null {
    if (recognitionRef.current) return recognitionRef.current;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      try {
        const n = event.results.length;
        if (!n) return;
        const result = event.results[n - 1];
        if (!result) return;
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          setInterim("");
          const finalText = transcript.trim();
          if (!finalText) return;
          // Barge-in: a final result while Sage is talking interrupts her.
          if (statusRef.current === "speaking") interruptSage();
          void handleSend(finalText);
        } else {
          setInterim(transcript);
        }
      } catch {
        /* malformed event — ignore */
      }
    };
    rec.onerror = (event) => {
      const kind = event?.error ?? "";
      if (kind === "no-speech" || kind === "aborted") return;
      if (kind === "not-allowed" || kind === "service-not-allowed" || kind === "audio-capture") {
        toast.error("Microphone unavailable — type to Professor Sage instead.");
        setTextOpen(true);
      }
      resetMic();
    };
    rec.onend = () => {
      if (userStopRef.current) {
        userStopRef.current = false;
        return;
      }
      resetMic(); // engine stopped on its own → reset gracefully
    };
    recognitionRef.current = rec;
    return rec;
  }

  function toggleMic() {
    if (isCallEnded()) return;
    if (micOnRef.current) {
      userStopRef.current = true;
      try {
        recognitionRef.current?.stop();
      } catch {
        /* not started */
      }
      micOnRef.current = false;
      setMicOn(false);
      setInterim("");
      if (statusRef.current === "listening") setStatusSafe("idle");
      return;
    }
    // Turning the mic ON while Sage is speaking = interrupt her.
    interruptSage();
    try {
      const rec = ensureRecognition();
      if (!rec) {
        setTextOpen(true);
        toast.error("Voice input isn't available here — type to Professor Sage instead.");
        return;
      }
      micOnRef.current = true;
      setMicOn(true);
      setStatusSafe("listening");
      try {
        rec.start();
      } catch {
        /* already started — treat as listening */
      }
    } catch {
      micOnRef.current = false;
      setMicOn(false);
      toast.error("Couldn't access the microphone — type to Professor Sage instead.");
    }
  }

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      const wasSpeaking = statusRef.current === "speaking";
      speakEpochRef.current += 1;
      haltPlayback();
      if (wasSpeaking) {
        setSpeakingId(null);
        setStatusSafe(micOnRef.current ? "listening" : "idle");
      }
    }
  }

  // ── Call lifecycle ────────────────────────────────────────────────────────

  function endCall() {
    setEndOpen(false);
    speakEpochRef.current += 1;
    userStopRef.current = true;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
    try {
      recognitionRef.current?.abort();
    } catch {
      /* noop */
    }
    haltPlayback();
    safetyTimersRef.current.forEach((t) => window.clearTimeout(t));
    safetyTimersRef.current = [];
    micOnRef.current = false;
    setMicOn(false);
    setInterim("");
    setSpeakingId(null);
    setStatusSafe("idle");
    setPhaseSafe("ended");
    resetTranscript();
    setSeconds(0);
    setTextDraft("");
  }

  function restartCall() {
    setCallId((c) => c + 1);
  }

  // Fresh call: reset → "Connecting…" theatrics → live + Sage greets first.
  useEffect(() => {
    callSeqRef.current += 1;
    resetTranscript();
    setSeconds(0);
    setInterim("");
    setSpeakingId(null);
    setStatusSafe("idle");
    setPhaseSafe("connecting");
    const connectTimer = window.setTimeout(() => {
      if (phaseRef.current !== "connecting") return; // call was ended mid-connect
      setPhaseSafe("live");
      const st = useKingdom.getState();
      const first = (st.user?.name ?? "").trim().split(/\s+/)[0] || "scholar";
      const ctx = st.tutorContext;
      const greeting = ctx?.subject
        ? `Hello ${first}! Professor Sage here. I see we're studying ${ctx.subject}${ctx.chapter ? ` — ${ctx.chapter}` : ""}. Where shall we begin?`
        : `Hello ${first}! Professor Sage here. What shall we explore today?`;
      const id = nextId();
      appendMessage({ id, role: "assistant", content: greeting });
      void speak(greeting, id);
    }, 1400);
    return () => window.clearTimeout(connectTimer);
  }, [callId]);

  // Feature detection (kept out of render for SSR safety).
  useEffect(() => {
    setSrAvailable(getSpeechRecognitionCtor() !== null);
    return () => {
      speakEpochRef.current += 1;
      userStopRef.current = true;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
      haltPlayback();
      safetyTimersRef.current.forEach((t) => window.clearTimeout(t));
      safetyTimersRef.current = [];
    };
  }, []);

  // Call duration timer (mm:ss), starts when the call goes live.
  useEffect(() => {
    if (phase !== "live") return;
    const iv = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(iv);
  }, [phase]);

  // Rotating "thinking" status lines while Sage works (AI calls are slow).
  useEffect(() => {
    if (status !== "thinking") {
      setThinkIdx(0);
      return;
    }
    const iv = window.setInterval(() => setThinkIdx((i) => i + 1), 4000);
    return () => window.clearInterval(iv);
  }, [status]);

  // Auto-scroll transcript to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, interim, status]);

  // ── Derived view state ────────────────────────────────────────────────────

  const speaking = phase === "live" && status === "speaking";
  const listening = phase === "live" && status === "listening";
  const thinking = phase === "live" && status === "thinking";

  const statusText =
    phase === "connecting"
      ? "Connecting…"
      : phase === "ended"
        ? "Call ended"
        : status === "speaking"
          ? "Sage is speaking…"
          : status === "thinking"
            ? "Sage is thinking…"
            : status === "listening"
              ? "Listening…"
              : "Live";

  const chipTone =
    phase === "connecting"
      ? "text-primary"
      : phase === "ended"
        ? "text-muted-foreground"
        : status === "speaking"
          ? "text-[#a86a12]"
          : status === "listening"
            ? "text-[#4f8a4a]"
            : status === "thinking"
              ? "text-muted-foreground"
              : "text-primary";

  const dotTone =
    phase === "connecting"
      ? "bg-primary/50"
      : phase === "ended"
        ? "bg-muted-foreground/40"
        : status === "speaking"
          ? "bg-[#eda93f]"
          : status === "listening"
            ? "bg-[#63ad5c]"
            : status === "thinking"
              ? "bg-muted-foreground/60"
              : "bg-primary";

  const lastMsg = messages[messages.length - 1];
  const visionMode = thinking && lastMsg?.role === "user" && !!lastMsg.imageUrl;
  const activeThinkingLines = visionMode ? VISION_LINES : THINKING_LINES;
  const thinkingLine = activeThinkingLines[thinkIdx % activeThinkingLines.length];

  const showTextRow = phase !== "ended" && (textOpen || !srAvailable);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
      className="clay relative flex h-[calc(100dvh-11.5rem)] min-h-[430px] flex-col p-6"
    >
      <MagicDust count={8} />

      {/* ── Status row: chip + timer + voice mute ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        className="relative z-10 flex items-center justify-between gap-2 pb-2"
      >
        <div
          className="clay-chip flex min-w-0 items-center gap-2 px-3.5 py-1.5"
          role="status"
          aria-live="polite"
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotTone} ${phase !== "ended" ? "animate-pulse" : ""}`} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={statusText}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.18 }}
              className={`whitespace-nowrap text-xs font-medium ${chipTone}`}
            >
              {statusText}
            </motion.span>
          </AnimatePresence>
          {phase === "live" && (
            <span className="whitespace-nowrap text-xs tabular-nums opacity-70">— {fmtDuration(seconds)}</span>
          )}
        </div>
        {phase !== "ended" && (
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute Professor Sage's voice" : "Mute Professor Sage's voice"}
            aria-pressed={muted}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all ${
              muted ? "bg-destructive text-primary-foreground" : "ghost-btn"
            }`}
            style={
              muted
                ? {
                    boxShadow:
                      "inset 0 2px 2px rgb(255 255 255 / 0.35), inset 0 -4px 7px -4px rgba(120,20,20,0.4), 0 6px 14px -6px rgba(217,83,79,0.45)",
                  }
                : undefined
            }
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
      </motion.div>

      {/* ── Professor Sage avatar with pulsing rings ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.08, ease: [0.34, 1.56, 0.64, 1] }}
        className="relative z-10 flex flex-col items-center gap-1.5 pb-3 pt-1"
      >
        <div className="relative flex h-[118px] w-[118px] animate-float items-center justify-center sm:h-[150px] sm:w-[150px]">
          {/* ambient clay tint */}
          <div
            className={`absolute inset-0 rounded-full blur-2xl transition-colors duration-700 ${
              speaking ? "bg-[#eda93f]/20" : listening ? "bg-primary/12" : "bg-primary/10"
            }`}
          />
          {/* speaking → gold/purple pulse rings racing outward */}
          {speaking && (
            <>
              <span className="absolute -inset-2 animate-ping rounded-full border-2 border-[#eda93f]/40 [animation-duration:1.8s]" />
              <span className="absolute -inset-2 animate-ping rounded-full border border-primary/30 [animation-duration:1.8s] [animation-delay:0.6s]" />
              <span className="absolute -inset-2 animate-ping rounded-full border border-[#eda93f]/20 [animation-duration:1.8s] [animation-delay:1.2s]" />
            </>
          )}
          {/* listening → subtle breathing ring */}
          <motion.span
            className={`absolute -inset-3 rounded-full border ${listening ? "border-primary/50" : "border-border"}`}
            animate={
              listening
                ? { scale: [1, 1.07, 1], opacity: [0.35, 0.85, 0.35] }
                : { scale: 1, opacity: 0.25 }
            }
            transition={{ duration: 3.2, repeat: listening ? Infinity : 0, ease: "easeInOut" }}
            aria-hidden
          />
          {/* molded clay seat */}
          <motion.div
            animate={speaking ? { scale: [1, 1.045, 1] } : { scale: 1 }}
            transition={{ duration: 1.6, repeat: speaking ? Infinity : 0, ease: "easeInOut" }}
            className="clay-well relative flex h-full w-full items-center justify-center overflow-hidden"
            style={{ borderRadius: "9999px" }}
          >
            <Image
              src="/kingdom/tutor-owl-clay.png"
              alt="Professor Sage, the wise owl wizard tutor"
              width={150}
              height={150}
              priority
              className={`relative h-full w-full select-none object-cover transition-opacity duration-500 ${
                phase === "connecting" ? "opacity-70" : "opacity-100"
              }`}
              onError={(e) => {
                e.currentTarget.style.opacity = "0";
              }}
            />
          </motion.div>
        </div>
        <h2 className="font-display text-lg font-bold text-foreground sm:text-xl">Professor Sage</h2>
        {tutorContext?.subject ? (
          <span className="rounded-full bg-primary/10 px-3 py-0.5 text-[11px] font-medium text-primary">
            {tutorContext.subject}
            {tutorContext.chapter ? ` · ${tutorContext.chapter}` : ""}
          </span>
        ) : (
          <p className="text-xs text-muted-foreground">Ask me anything from your syllabus</p>
        )}
      </motion.div>

      {phase === "ended" ? (
        /* ── Ended panel ── */
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 text-center"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl" />
            <div
              className="clay-well relative flex h-24 w-24 items-center justify-center overflow-hidden"
              style={{ borderRadius: "9999px" }}
            >
              <Image
                src="/kingdom/tutor-owl-clay.png"
                alt="Professor Sage, the wise owl wizard tutor"
                width={96}
                height={96}
                className="h-24 w-24 object-cover opacity-60"
                onError={(e) => {
                  e.currentTarget.style.opacity = "0";
                }}
              />
            </div>
          </div>
          <div>
            <p className="font-display text-lg font-bold text-foreground">The call has ended</p>
            <p className="mt-1 max-w-[280px] text-sm leading-relaxed text-muted-foreground">
              Professor Sage has returned to the archives. Call again whenever a question strikes.
            </p>
          </div>
          <button
            type="button"
            onClick={restartCall}
            className="glow-btn flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold"
          >
            <PhoneCall className="h-4 w-4" />
            Call Professor Sage again
          </button>
        </motion.div>
      ) : (
        <>
          {/* ── Transcript ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.16, ease: [0.34, 1.56, 0.64, 1] }}
            ref={scrollRef}
            role="log"
            aria-label="Conversation transcript with Professor Sage"
            aria-live="polite"
            className="kingdom-scroll clay-inset relative z-10 min-h-0 flex-1 overflow-y-auto px-3 py-3"
          >
            {phase === "connecting" && messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary/70" aria-hidden />
                <p className="text-sm text-muted-foreground">Summoning Professor Sage…</p>
                <div className="w-full max-w-[240px] space-y-2">
                  <div className="shimmer h-3 rounded-full" />
                  <div className="shimmer h-3 w-2/3 rounded-full" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {m.role === "user" ? (
                      <div className="flex justify-end">
                        <div
                          className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 sm:max-w-[75%]"
                          style={{ boxShadow: "var(--clay-btn)" }}
                        >
                          {m.imageUrl && (
                            <img
                              src={m.imageUrl}
                              alt="Homework photo you shared with Professor Sage"
                              loading="lazy"
                              decoding="async"
                              className="mb-2 max-w-[140px] rounded-xl"
                            />
                          )}
                          <p className="break-words text-sm leading-relaxed text-primary-foreground [overflow-wrap:anywhere]">
                            {m.content}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-end gap-2">
                        <SageMiniAvatar />
                        <div
                          className="max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2.5 sm:max-w-[75%]"
                          style={{ background: "linear-gradient(180deg,#fffdf6,#fbf4e3)", boxShadow: "var(--clay-raise-sm)" }}
                        >
                          <p className="break-words text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
                            {m.content}
                          </p>
                          {speakingId === m.id && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <SpeakingBars />
                              <span className="text-[10px] font-medium tracking-wide text-[#a86a12]">Speaking…</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}

                {/* Thinking bubble with rotating status line */}
                {thinking && (
                  <div className="flex items-end gap-2">
                    <SageMiniAvatar />
                    <div
                      className="flex items-center gap-3 rounded-2xl rounded-bl-md px-4 py-3"
                      style={{ background: "linear-gradient(180deg,#fffdf6,#fbf4e3)", boxShadow: "var(--clay-raise-sm)" }}
                    >
                      <span className="flex items-center gap-1.5" aria-hidden>
                        <span className="h-2 w-2 animate-bounce rounded-full bg-primary/70" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-primary/70 [animation-delay:180ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-primary/70 [animation-delay:360ms]" />
                      </span>
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={thinkingLine}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.3 }}
                          className="text-[11px] text-muted-foreground"
                        >
                          {thinkingLine}
                        </motion.span>
                      </AnimatePresence>
                      <span className="sr-only">Professor Sage is thinking</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* ── Floating live-transcript pill (interim speech) ── */}
          <AnimatePresence>
            {interim && phase === "live" && (
              <motion.div
                key="interim-pill"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                role="status"
                className="clay-chip relative z-10 mx-auto mt-2 flex w-full max-w-[92%] items-center gap-2.5 px-4 py-2"
              >
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden />
                <p className="truncate text-sm text-foreground">{interim}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Text fallback row (always available — headless browsers have no mic) ── */}
          <AnimatePresence initial={false}>
            {showTextRow && (
              <motion.div
                key="text-row"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="relative z-10 overflow-hidden"
              >
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitText();
                  }}
                  className="pt-3"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={textDraft}
                      onChange={(e) => setTextDraft(e.target.value)}
                      placeholder="Ask Professor Sage anything…"
                      aria-label="Message for Professor Sage"
                      autoComplete="off"
                      className="h-11 flex-1 rounded-full border-border bg-secondary text-[15px]"
                    />
                    <button
                      type="submit"
                      disabled={!textDraft.trim()}
                      aria-label="Send message to Professor Sage"
                      className="glow-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                  {!srAvailable && (
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/70">
                      Voice input isn&apos;t available in this browser — type to Professor Sage.
                    </p>
                  )}
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Control bar (last flex child — sits above the shell's bottom nav) ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative z-10 flex items-start justify-center gap-4 pt-3 sm:gap-6"
          >
            <div className="flex items-start gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => setTextOpen((o) => !o)}
                aria-label="Toggle text input"
                aria-pressed={textOpen || !srAvailable}
                className={`flex h-12 w-12 items-center justify-center rounded-full ${
                  textOpen || !srAvailable ? "glow-btn" : "ghost-btn"
                }`}
              >
                <Keyboard className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={phase !== "live"}
                aria-label="Send a homework photo to Professor Sage"
                className="ghost-btn flex h-12 w-12 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Camera className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={toggleMic}
                disabled={!srAvailable || phase !== "live"}
                aria-label={micOn ? "Turn microphone off" : "Turn microphone on"}
                aria-pressed={micOn}
                className={`flex h-16 w-16 items-center justify-center rounded-full transition-all ${
                  micOn ? "glow-btn animate-pulse-glow" : "ghost-btn"
                } ${!srAvailable || phase !== "live" ? "cursor-not-allowed opacity-40" : ""}`}
              >
                {micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
              </button>
              <span className="text-center text-[10px] font-medium tracking-wide text-muted-foreground/80">
                {!srAvailable
                  ? "No voice input"
                  : micOn
                    ? "Listening…"
                    : speaking
                      ? "Tap to interrupt"
                      : phase === "live"
                        ? "Tap to talk"
                        : "Connecting"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setEndOpen(true)}
              aria-label="End the call with Professor Sage"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-primary-foreground transition-all hover:brightness-105 active:translate-y-[3px] active:scale-95"
              style={{
                boxShadow:
                  "inset 0 2px 2px rgb(255 255 255 / 0.35), inset 0 -6px 10px -5px rgba(120,20,20,0.45), 0 10px 22px -8px rgba(217,83,79,0.5)",
              }}
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </motion.div>
        </>
      )}

      {/* Hidden file input for homework photos (camera on mobile) */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onPhotoPicked}
      />

      {/* End-call confirmation */}
      <AlertDialog open={endOpen} onOpenChange={setEndOpen}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg font-bold text-foreground">
              End the call with Professor Sage?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The transcript and call timer will be cleared. You can always call again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-full">Keep talking</AlertDialogCancel>
            <AlertDialogAction
              onClick={endCall}
              className="rounded-full transition-all hover:brightness-105 active:translate-y-[2px] active:scale-95"
              style={{
                backgroundColor: "var(--destructive)",
                color: "var(--primary-foreground)",
                boxShadow:
                  "inset 0 2px 2px rgb(255 255 255 / 0.35), inset 0 -6px 10px -5px rgba(120,20,20,0.45), 0 10px 22px -8px rgba(217,83,79,0.5)",
              }}
            >
              End call
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
