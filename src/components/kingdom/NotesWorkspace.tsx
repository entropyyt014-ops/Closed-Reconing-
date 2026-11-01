"use client";

// ─── Task 4-d: The Scriptorium — Notes workspace with AI Co-Pilot ───────────
// Screen state machine: list → editor (existing | new) with AI dialogs layered.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  AlignLeft,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Eye,
  EyeOff,
  Feather,
  FlaskConical,
  GitBranch,
  Layers,
  ListTree,
  Loader2,
  Maximize2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { kingdomApi } from "@/lib/kingdom/client";
import { useKingdom } from "@/lib/kingdom/store";
import { REWARDS } from "@/lib/kingdom/constants";
import type {
  ConceptFlow,
  Flashcard,
  InteractiveBlocks,
  MiniQuizQuestion,
  NoteDTO,
  TapReveal,
} from "@/lib/kingdom/types";
import { MagicDust } from "./MagicDust";

// ─── Local types & constants ────────────────────────────────────────────────

type Screen = "list" | "editor";
type SaveKind = "idle" | "unsaved" | "saving" | "saved";
type AiAction = "summarize" | "expand" | "structure" | "gapfix";
type AiMode = "replace-selection" | "replace-all";

interface Draft {
  title: string;
  subject: string;
  chapter: string;
  content: string;
}

interface AiDialogState {
  phase: "working" | "result" | "error";
  action: AiAction;
  mode: AiMode;
  original: string;
  transformed: string;
  selStart: number;
  selEnd: number;
  error: string | null;
}

const COPILOT_ACTIONS: { id: AiAction; label: string; noun: string; hint: string; icon: LucideIcon }[] = [
  { id: "summarize", label: "Summarize", noun: "Summary", hint: "Condense into crisp revision notes", icon: ListTree },
  { id: "expand", label: "Expand", noun: "Expansion", hint: "Expand with deeper explanations", icon: Maximize2 },
  { id: "structure", label: "Structure", noun: "Structure", hint: "Structure & clean up", icon: AlignLeft },
  { id: "gapfix", label: "Fix gaps", noun: "Gap fix", hint: "Fix gaps vs the official syllabus", icon: ShieldCheck },
];

const ALCHEMIST_LINES: string[] = [
  "Distilling flashcards…",
  "Binding quiz questions…",
  "Weaving the concept flow…",
];

const MIN_SELECTION_CHARS = 20;
const MIN_TRANSMUTE_CHARS = 40;
const AUTOSAVE_DEBOUNCE_MS = 1200;

function emptyDraft(): Draft {
  return { title: "", subject: "", chapter: "", content: "" };
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return a.title === b.title && a.subject === b.subject && a.chapter === b.chapter && a.content === b.content;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "recently";
  return formatDistanceToNow(d, { addSuffix: true });
}

function formatElapsed(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

// ─── Small hooks ────────────────────────────────────────────────────────────

/** Rotating status line for long AI rituals (changes every ~4s, loops). */
function useRotatingLine(lines: string[], intervalMs = 4000): string {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setIdx((i) => (i + 1) % lines.length), intervalMs);
    return () => window.clearInterval(t);
  }, [lines, intervalMs]);
  return lines[idx % lines.length] ?? lines[0] ?? "";
}

/** Elapsed-seconds counter for slow AI calls. */
function useElapsed(): number {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setSec((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  return sec;
}

// ─── Save status pill (auto-polls the save machinery through refs) ──────────

function SaveStatusText({ poll }: { poll: () => SaveKind }) {
  const [kind, setKind] = useState<SaveKind>(() => poll());
  useEffect(() => {
    const t = window.setInterval(() => setKind(poll()), 700);
    return () => window.clearInterval(t);
  }, [poll]);

  let node: ReactNode = null;
  if (kind === "saving") {
    node = (
      <span className="flex items-center gap-1 text-lavender">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  } else if (kind === "unsaved") {
    node = <span className="gold-text">Unsaved</span>;
  } else if (kind === "saved") {
    node = <span className="text-[#63ad5c]">Saved ✧</span>;
  }

  return (
    <span className="flex w-[74px] shrink-0 items-center justify-end text-right text-[11px] font-medium" aria-live="polite">
      {node}
    </span>
  );
}

// ─── Shared "ritual in progress" body for slow AI dialogs ───────────────────

function RitualBody({ icon: Icon, title, lines, meta }: { icon: LucideIcon; title: string; lines: string[]; meta?: string | null }) {
  const line = useRotatingLine(lines);
  const elapsed = useElapsed();
  return (
    <div className="flex flex-col items-center py-2 text-center">
      <div className="clay-well flex h-14 w-14 items-center justify-center rounded-2xl">
        <Icon className="h-6 w-6 text-lavender" strokeWidth={1.6} />
      </div>
      <DialogTitle className="font-display mt-4 text-lg font-bold text-foreground">{title}</DialogTitle>
      {meta && <p className="mt-1 text-[11px] text-muted-foreground/70">{meta}</p>}
      <div className="mt-3 h-5 overflow-hidden" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.p
            key={line}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="text-[13px] text-lavender"
          >
            {line}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="mt-5 w-full space-y-2" aria-hidden>
        <div className="shimmer h-3.5 w-full rounded-full" />
        <div className="shimmer h-3.5 w-4/5 rounded-full" />
        <div className="shimmer h-3.5 w-3/5 rounded-full" />
      </div>
      <p className="mt-4 text-[11px] tabular-nums text-muted-foreground/70">
        {formatElapsed(elapsed)} elapsed · deep magic takes a while
      </p>
    </div>
  );
}

// ─── Interactive module: header ─────────────────────────────────────────────

function ModuleHeader({ icon: Icon, title, count }: { icon: LucideIcon; title: string; count?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="clay-well flex h-9 w-9 shrink-0 items-center justify-center">
        <Icon className="h-4 w-4 text-lavender" strokeWidth={1.8} />
      </span>
      <h3 className="font-display text-[15px] font-bold text-foreground">{title}</h3>
      {count && (
        <span className="clay-chip ml-auto px-2.5 py-1 text-[11px] tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Interactive module 1: Flashcards (3D flip deck) ────────────────────────

function FlashcardDeck({ cards }: { cards: Flashcard[] }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const total = cards.length;
  if (total === 0) return null;
  const card = cards[Math.min(idx, total - 1)];

  function go(delta: number) {
    setFlipped(false);
    setIdx((i) => Math.max(0, Math.min(i + delta, total - 1)));
  }

  function flip() {
    setFlipped((f) => !f);
  }

  return (
    <section aria-label="Flashcards">
      <ModuleHeader icon={Layers} title="Flashcards" count={`${total} cards`} />
      <div className="relative mx-auto mt-4 h-56 w-full max-w-sm [perspective:1200px]">
        <motion.div
          role="button"
          tabIndex={0}
          aria-label={`Flashcard ${idx + 1} of ${total} — tap to flip`}
          onClick={flip}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              flip();
            }
          }}
          className="absolute inset-0 cursor-pointer outline-none"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <div className="clay absolute inset-0 flex flex-col items-center justify-center overflow-y-auto kingdom-scroll p-5 text-center [backface-visibility:hidden]">
            <p className="text-[10px] uppercase tracking-widest text-lavender/70">Front</p>
            <p className="mt-2.5 text-[15px] font-medium leading-relaxed text-foreground">{card.front}</p>
            <p className="mt-3.5 text-[10px] text-muted-foreground/60">Tap card to flip</p>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto kingdom-scroll rounded-[1.75rem] bg-primary p-5 text-center text-primary-foreground [box-shadow:var(--clay-btn)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <p className="text-[10px] uppercase tracking-widest text-primary-foreground/70">Back</p>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-primary-foreground">{card.back}</p>
            <p className="mt-3.5 text-[10px] text-primary-foreground/60">Tap card to flip</p>
          </div>
        </motion.div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={idx === 0}
          aria-label="Previous flashcard"
          className="ghost-btn flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-35"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-display w-16 text-center text-[13px] tabular-nums text-muted-foreground">
          {idx + 1} / {total}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={idx === total - 1}
          aria-label="Next flashcard"
          className="ghost-btn flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-35"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {total > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
          {cards.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === idx ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Interactive module 2: Tap to Reveal ────────────────────────────────────

const SCRAMBLE_GLYPHS = "✧✦✧✦✧✦✧✦✧✦✧✦✧✦✧✦✧✦✧✦✧✦✧✦";

function TapRevealGrid({ items }: { items: TapReveal[] }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <section aria-label="Tap to reveal">
      <ModuleHeader icon={Eye} title="Tap to Reveal" count={`${revealed.size}/${items.length} revealed`} />
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {items.map((item, i) => {
          const shown = revealed.has(i);
          const mask = SCRAMBLE_GLYPHS.slice(0, Math.max(8, Math.min(20, Math.ceil(item.definition.length / 4))));
          return (
            <motion.button
              key={i}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
              whileTap={{ scale: 0.985 }}
              onClick={() => toggle(i)}
              aria-expanded={shown}
              className={`flex min-h-[44px] items-center justify-between gap-3 rounded-[1.25rem] p-3.5 text-left transition-all ${
                shown ? "bg-primary/10 [box-shadow:var(--clay-raise-sm)]" : "clay-inset"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.term}</p>
                {shown ? (
                  <motion.p
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground"
                  >
                    {item.definition}
                  </motion.p>
                ) : (
                  <span className="mt-1.5 inline-flex select-none blur-[5px] tracking-[0.2em] text-[11px] text-muted-foreground">
                    {mask}
                  </span>
                )}
              </div>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card [box-shadow:var(--clay-raise-sm)]">
                {shown ? <EyeOff className="h-4 w-4 text-lavender" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}

// ─── Interactive module 3: Self-Check Quiz ──────────────────────────────────

function QuizModule({ questions }: { questions: MiniQuizQuestion[] }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const answeredCount = Object.keys(answers).length;
  const correctCount = questions.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0);

  function pick(qi: number, oi: number) {
    if (qi in answers) return;
    setAnswers((prev) => ({ ...prev, [qi]: oi }));
  }

  return (
    <section aria-label="Self-check quiz">
      <ModuleHeader icon={CircleHelp} title="Self-Check Quiz" count={`${correctCount}/${questions.length} correct`} />
      {answeredCount < questions.length && (
        <p className="mt-2 text-[11px] text-muted-foreground/70">Answer honestly — no one is watching ✧</p>
      )}
      <div className="mt-4 space-y-4">
        {questions.map((q, qi) => {
          const answered = qi in answers;
          const chosen = answers[qi];
          const isWrong = answered && chosen !== q.correctIndex;
          return (
            <div key={qi} className="clay-inset p-3.5 sm:p-4">
              <p className="text-sm font-medium leading-relaxed text-foreground/95">
                {qi + 1}. {q.question}
              </p>
              <div className="mt-3 space-y-2">
                {q.options.map((opt, oi) => {
                  const isCorrect = oi === q.correctIndex;
                  const isChosen = answered && chosen === oi;
                  let cls = "bg-card text-foreground [box-shadow:var(--clay-raise-sm)]";
                  let icon: ReactNode = null;
                  if (answered) {
                    if (isCorrect) {
                      cls = "bg-[#63ad5c] text-primary-foreground [box-shadow:var(--clay-raise-sm)]";
                      icon = <Check className="h-4 w-4 shrink-0 text-primary-foreground" />;
                    } else if (isChosen) {
                      cls = "bg-destructive text-primary-foreground [box-shadow:var(--clay-raise-sm)]";
                      icon = <X className="h-4 w-4 shrink-0 text-primary-foreground" />;
                    } else {
                      cls = "bg-secondary/60 opacity-70";
                    }
                  }
                  return (
                    <motion.button
                      key={oi}
                      type="button"
                      animate={isChosen && isWrong ? { x: [0, -7, 7, -4, 4, 0] } : { x: 0 }}
                      transition={{ duration: 0.4 }}
                      whileTap={answered ? undefined : { scale: 0.985 }}
                      onClick={() => pick(qi, oi)}
                      aria-disabled={answered}
                      className={`flex w-full min-h-[44px] items-center justify-between gap-3 rounded-[1.25rem] px-3.5 py-2.5 text-left text-[13px] leading-relaxed transition-all ${cls}`}
                    >
                      <span className={answered && (isCorrect || isChosen) ? "font-medium text-primary-foreground" : "text-secondary-foreground"}>
                        {opt}
                      </span>
                      {icon}
                    </motion.button>
                  );
                })}
              </div>
              {answered && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-3 rounded-xl bg-card/70 p-2.5 text-[12px] leading-relaxed text-secondary-foreground"
                >
                  {isWrong ? "Not quite — " : "Correct ✧ "}
                  {q.explanation}
                </motion.p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Interactive module 4: Concept Flow (vertical stepper) ──────────────────

function ConceptFlowModule({ flow }: { flow: ConceptFlow }) {
  return (
    <section aria-label="Concept flow">
      <ModuleHeader icon={GitBranch} title="Concept Flow" count={`${flow.nodes.length} steps`} />
      {flow.title && <p className="mt-2 text-[12px] text-lavender/80">{flow.title}</p>}
      <div className="relative mt-4">
        <div aria-hidden className="absolute bottom-3 left-[21px] top-3 w-px rounded-full bg-gold/50" />
        <ol className="space-y-3">
          {flow.nodes.map((node, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i, duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
              className="relative flex items-start gap-3"
            >
              <span className="clay-chip lavender-text relative z-10 flex h-11 w-11 shrink-0 items-center justify-center font-display text-[15px] font-bold">
                {i + 1}
              </span>
              <div className="clay-inset min-w-0 flex-1 p-3.5 text-[13px] leading-relaxed text-secondary-foreground">
                {node}
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ─── The interactive section (below the editor) ─────────────────────────────

function InteractiveSection({
  blocks,
  mastered,
  completing,
  onComplete,
  onRetransmute,
}: {
  blocks: InteractiveBlocks;
  mastered: boolean;
  completing: boolean;
  onComplete: () => void;
  onRetransmute: () => void;
}) {
  const modules = [
    blocks.flashcards.length > 0 ? <FlashcardDeck key="cards" cards={blocks.flashcards} /> : null,
    blocks.tapReveal.length > 0 ? <TapRevealGrid key="reveal" items={blocks.tapReveal} /> : null,
    blocks.quiz.length > 0 ? <QuizModule key="quiz" questions={blocks.quiz} /> : null,
    blocks.flow ? <ConceptFlowModule key="flow" flow={blocks.flow} /> : null,
  ].filter((m): m is Exclude<typeof m, null> => m !== null);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
      className="mt-7"
      aria-label="Interactive mode"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">Interactive Mode</p>
          <h2 className="font-display mt-0.5 text-lg font-bold text-foreground">
            The Alchemist&apos;s <span className="lavender-text">Creations</span>
          </h2>
        </div>
        <Button
          variant="outline"
          onClick={onRetransmute}
          className="ghost-btn h-11 shrink-0 rounded-full px-3.5 text-xs"
          aria-label="Re-transmute with the current note content"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Re-transmute
        </Button>
      </div>

      <div className="clay mt-3 p-4 sm:p-5">
        {modules.length > 0 ? (
          <div className="space-y-6">
            {modules.map((m, i) => (
              <div key={i} className="flex flex-col gap-6">
                {i > 0 && <div aria-hidden className="h-px w-full bg-border" />}
                {m}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm leading-relaxed text-muted-foreground">
            The transmutation produced little — enrich your notes and re-transmute.
          </p>
        )}

        <div className="mt-6">
          {mastered ? (
            <div className="clay-gold-btn flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold">
              <Check className="h-4 w-4" />
              Module mastered ✧
            </div>
          ) : (
            <Button
              onClick={onComplete}
              disabled={completing}
              className="glow-btn h-12 w-full rounded-full text-[15px] font-semibold"
            >
              {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
              I&apos;ve mastered this module · +{REWARDS.NOTE_MODULE_COMPLETE} coins
            </Button>
          )}
        </div>
      </div>
    </motion.section>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function NotesWorkspace() {
  const user = useKingdom((s) => s.user);
  const addCoins = useKingdom((s) => s.addCoins);

  // Screen state machine
  const [screen, setScreen] = useState<Screen>("list");

  // Notes list
  const [notes, setNotes] = useState<NoteDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NoteDTO | null>(null);
  const [dragonOk, setDragonOk] = useState(true);

  // Editor draft (controlled state + mirrored ref of the latest payload)
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [content, setContent] = useState("");

  // Autosave machinery (refs — the source of truth for the save loop)
  const draftRef = useRef<Draft>(emptyDraft());
  const savedRef = useRef<Draft>(emptyDraft());
  const noteIdRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const saveSeqRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  // Interactive blocks & mastery
  const [blocks, setBlocks] = useState<InteractiveBlocks | null>(null);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [completing, setCompleting] = useState(false);

  // AI Co-Pilot (selection-aware)
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const [selInfo, setSelInfo] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [ai, setAi] = useState<AiDialogState | null>(null);

  // Interactive Alchemist
  const [transmuting, setTransmuting] = useState(false);
  const [transmuteError, setTransmuteError] = useState<string | null>(null);

  const board = user?.board ?? null;
  const copilotLines = useMemo(
    () => [
      "Reading your runes…",
      board ? `Consulting the ${board} syllabus…` : "Consulting the syllabus archives…",
      "Rewriting…",
    ],
    [board]
  );

  const subjectOptions = useMemo(() => {
    const list = Array.from(new Set([subject, ...(user?.subjects ?? [])]));
    return list.filter((s) => s.trim().length > 0);
  }, [subject, user]);

  const selLen = Math.max(0, selInfo.end - selInfo.start);
  const hasSelection = selLen >= MIN_SELECTION_CHARS;
  const canTransmute = content.trim().length >= MIN_TRANSMUTE_CHARS;

  // ── Load the grimoire ────────────────────────────────────────────────────

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await kingdomApi.notes.list();
      setNotes(res.notes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The Scriptorium is unreachable";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // Fire-and-forget save when the whole workspace unmounts with a dirty draft
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (dirtyRef.current) void flushSave();
    };
  }, []);

  // ── Autosave engine ──────────────────────────────────────────────────────

  function scheduleSave(delay: number = AUTOSAVE_DEBOUNCE_MS) {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void flushSave();
    }, delay);
  }

  function markDirty() {
    dirtyRef.current = true;
    scheduleSave();
  }

  function changeTitle(v: string) {
    setTitle(v);
    draftRef.current = { ...draftRef.current, title: v };
    markDirty();
  }

  function changeSubject(v: string) {
    setSubject(v);
    draftRef.current = { ...draftRef.current, subject: v };
    markDirty();
  }

  function changeChapter(v: string) {
    setChapter(v);
    draftRef.current = { ...draftRef.current, chapter: v };
    markDirty();
  }

  function changeContent(v: string) {
    setContent(v);
    draftRef.current = { ...draftRef.current, content: v };
    setSelInfo({ start: 0, end: 0 }); // programmatic replacement collapses the selection
    markDirty();
  }

  function upsertNote(note: NoteDTO) {
    setNotes((prev) => [note, ...prev.filter((n) => n.id !== note.id)]);
  }

  /** Debounced flush: creates the note on first save, patches afterwards.
   *  Races are guarded with the latest-payload ref + a save sequence number. */
  async function flushSave(): Promise<void> {
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    if (noteIdRef.current !== null && !dirtyRef.current && !pendingRef.current) return;

    const d: Draft = { ...draftRef.current };
    if (noteIdRef.current === null && !d.title.trim() && !d.content.trim()) return;

    savingRef.current = true;
    saveSeqRef.current += 1;
    const seq = saveSeqRef.current;
    try {
      let note: NoteDTO;
      if (noteIdRef.current === null) {
        const res = await kingdomApi.notes.create({
          subject: d.subject,
          chapter: d.chapter,
          title: d.title.trim() || "Untitled scroll",
          content: d.content,
        });
        note = res.note;
        noteIdRef.current = note.id;
        setCreating(false);
      } else {
        const res = await kingdomApi.notes.update(noteIdRef.current, {
          title: d.title.trim() || "Untitled scroll",
          content: d.content,
          chapter: d.chapter,
          subject: d.subject,
        });
        note = res.note;
      }
      savedRef.current = d;
      upsertNote(note);
      if (seq === saveSeqRef.current) {
        // If the scholar kept typing while the scribes wrote, stay dirty
        dirtyRef.current = !draftsEqual(draftRef.current, savedRef.current);
      }
    } catch (err) {
      if (seq === saveSeqRef.current) {
        toast.error(err instanceof Error ? err.message : "The Scribes could not save your scroll");
      }
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        scheduleSave(350);
      }
    }
  }

  const pollStatus = useCallback((): SaveKind => {
    if (screen !== "editor") return "idle";
    if (savingRef.current || pendingRef.current) return "saving";
    if (noteIdRef.current === null && !draftRef.current.title.trim() && !draftRef.current.content.trim()) return "idle";
    if (dirtyRef.current) return "unsaved";
    return noteIdRef.current !== null ? "saved" : "idle";
  }, [screen]);

  // ── Navigation ───────────────────────────────────────────────────────────

  function newNote() {
    noteIdRef.current = null;
    setCreating(true);
    const d: Draft = { title: "", subject: user?.subjects[0] ?? "", chapter: "", content: "" };
    setTitle(d.title);
    setSubject(d.subject);
    setChapter(d.chapter);
    setContent(d.content);
    draftRef.current = { ...d };
    savedRef.current = { ...d };
    dirtyRef.current = false;
    pendingRef.current = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setBlocks(null);
    setCoinsEarned(0);
    setSelInfo({ start: 0, end: 0 });
    setScreen("editor");
    window.scrollTo(0, 0);
  }

  function openNote(note: NoteDTO) {
    noteIdRef.current = note.id;
    setCreating(false);
    const d: Draft = { title: note.title, subject: note.subject, chapter: note.chapter, content: note.content };
    setTitle(d.title);
    setSubject(d.subject);
    setChapter(d.chapter);
    setContent(d.content);
    draftRef.current = { ...d };
    savedRef.current = { ...d };
    dirtyRef.current = false;
    pendingRef.current = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setBlocks(note.blocks);
    setCoinsEarned(note.coinsEarned);
    setSelInfo({ start: 0, end: 0 });
    setScreen("editor");
    window.scrollTo(0, 0);
  }

  async function handleBack() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (dirtyRef.current || savingRef.current || pendingRef.current) {
      await flushSave();
      if (pendingRef.current || dirtyRef.current) {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        await new Promise((r) => setTimeout(r, 250));
        await flushSave();
      }
    }
    setScreen("list");
    window.scrollTo(0, 0);
  }

  // ── Delete (optimistic) ──────────────────────────────────────────────────

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    const snapshot = notes;
    setNotes((prev) => prev.filter((n) => n.id !== target.id));
    if (noteIdRef.current === target.id) noteIdRef.current = null;
    try {
      await kingdomApi.notes.delete(target.id);
      toast.success("Scroll burned to ash ✧");
    } catch (err) {
      setNotes(snapshot);
      toast.error(err instanceof Error ? err.message : "The scroll resisted the flame");
    }
  }

  // ── Selection tracking for the Co-Pilot ─────────────────────────────────

  function syncSel() {
    const el = contentRef.current;
    if (!el) return;
    setSelInfo({ start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 });
  }

  // ── AI Co-Pilot ──────────────────────────────────────────────────────────

  function runCoPilot(action: AiAction) {
    if (ai) return;
    const el = contentRef.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    const selText = content.slice(start, end);
    const useSel = end - start >= MIN_SELECTION_CHARS && selText.trim().length > 0;
    const input = useSel ? selText : content;
    if (input.trim().length < 10) {
      toast.error("Write something first — the Co-Pilot needs runes to read.");
      return;
    }
    startAi(action, input, useSel ? "replace-selection" : "replace-all", start, end);
  }

  function startAi(action: AiAction, input: string, mode: AiMode, selStart: number, selEnd: number) {
    setAi({ phase: "working", action, mode, original: input, transformed: "", selStart, selEnd, error: null });
    const { subject: subj, chapter: chap } = draftRef.current;
    kingdomApi
      .notes.ai(action, input, subj, chap)
      .then((res) => {
        setAi((prev) => (prev && prev.phase === "working" ? { ...prev, phase: "result", transformed: res.text } : prev));
      })
      .catch((err: unknown) => {
        setAi((prev) =>
          prev ? { ...prev, phase: "error", error: err instanceof Error ? err.message : "The Co-Pilot lost connection" } : prev
        );
      });
  }

  function retryAi() {
    if (!ai) return;
    startAi(ai.action, ai.original, ai.mode, ai.selStart, ai.selEnd);
  }

  function applyAi() {
    if (!ai || ai.phase !== "result") return;
    const next =
      ai.mode === "replace-selection"
        ? content.slice(0, ai.selStart) + ai.transformed + content.slice(ai.selEnd)
        : ai.transformed;
    changeContent(next);
    setAi(null);
    toast.success("Notes enhanced by the Co-Pilot ✦");
  }

  // ── Interactive Alchemist ────────────────────────────────────────────────

  async function runTransmute() {
    if (transmuting) return;
    if (draftRef.current.content.trim().length < MIN_TRANSMUTE_CHARS) {
      toast.error(`Write at least ${MIN_TRANSMUTE_CHARS} characters before transmuting.`);
      return;
    }
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setTransmuteError(null);
    setTransmuting(true);
    try {
      await flushSave(); // make sure the note exists server-side before binding blocks
      const { content: text, subject: subj, chapter: chap } = draftRef.current;
      const res = await kingdomApi.notes.interactive({ noteId: noteIdRef.current, text, subject: subj, chapter: chap });
      setBlocks(res.blocks);
      const id = noteIdRef.current;
      if (id) setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, blocks: res.blocks } : n)));
      toast.success("Transmutation complete — your scroll is interactive ✦");
    } catch (err) {
      setTransmuteError(err instanceof Error ? err.message : "The Alchemist's crucible cracked");
    } finally {
      setTransmuting(false);
    }
  }

  // ── Module mastery (+10 coins, once) ────────────────────────────────────

  async function completeModule() {
    if (coinsEarned > 0 || completing) return;
    setCompleting(true);
    try {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await flushSave();
      const id = noteIdRef.current;
      if (!id) throw new Error("Write something in this scroll first");
      const res = await kingdomApi.notes.complete(id);
      if (res.coinsEarned > 0) {
        addCoins(res.coinsEarned);
        setCoinsEarned(res.coinsEarned);
        setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, coinsEarned: res.coinsEarned } : n)));
        toast.success(`✦ +${res.coinsEarned} Kingdom Coins — territory expanded!`);
      } else {
        setCoinsEarned(REWARDS.NOTE_MODULE_COMPLETE);
        setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, coinsEarned: REWARDS.NOTE_MODULE_COMPLETE } : n)));
        toast.info("This module was already mastered ✧");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The kingdom ledger refused");
    } finally {
      setCompleting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const aiMeta =
    subject || chapter
      ? `on ${subject || "your scroll"}${chapter.trim() ? ` · ${chapter.trim()}` : ""}`
      : null;

  return (
    <div className="relative pb-2">
      <AnimatePresence mode="wait" initial={false}>
        {screen === "list" ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.18, ease: "easeIn" } }}
            transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
          >
            {/* Header */}
            <header className="relative pt-1">
              <MagicDust count={10} />
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">Your Grimoire</p>
              <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
                    The <span className="lavender-text">Scriptorium</span>
                  </h1>
                  <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                    Write your own notes. Let the AI co-pilot sharpen them into spells.
                  </p>
                </div>
                <Button
                  onClick={newNote}
                  className="glow-btn h-12 w-full rounded-full px-5 text-[15px] font-semibold sm:w-auto"
                >
                  <Plus className="h-4 w-4" />
                  New Note
                </Button>
              </div>
            </header>

            {/* List */}
            {loading ? (
              <div className="mt-6 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="clay p-4 sm:p-5">
                    <div className="shimmer h-5 w-2/3 rounded-lg" />
                    <div className="mt-3 shimmer h-3 w-1/2 rounded" />
                    <div className="mt-3 shimmer h-3 w-full rounded" />
                    <div className="mt-2 shimmer h-3 w-4/5 rounded" />
                  </div>
                ))}
              </div>
            ) : notes.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
                className="clay mt-6 flex flex-col items-center px-6 py-10 text-center sm:py-14"
              >
                <div className="clay-well relative flex h-36 w-36 items-center justify-center overflow-hidden" style={{ borderRadius: "999px" }}>
                  {dragonOk ? (
                    <Image
                      src="/kingdom/dragon-mascot-clay.png"
                      alt="Baby dragon mascot dozing over an empty scroll"
                      width={144}
                      height={144}
                      priority
                      className="animate-float relative select-none rounded-full object-cover"
                      style={{ width: "80%", height: "80%" }}
                      onError={() => setDragonOk(false)}
                    />
                  ) : (
                    <Feather className="h-16 w-16 text-primary/60" strokeWidth={1.5} />
                  )}
                </div>
                <p className="font-display mt-5 text-lg font-bold text-foreground">No scrolls yet</p>
                <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                  write your first note — the Co-Pilot will sharpen it into spells.
                </p>
                <Button onClick={newNote} className="glow-btn mt-6 h-12 rounded-full px-6 text-[15px] font-semibold">
                  <Plus className="h-4 w-4" />
                  Write your first scroll
                </Button>
              </motion.div>
            ) : (
              <div className="mt-5 max-h-[70dvh] space-y-3 overflow-y-auto kingdom-scroll pb-2 pr-1">
                {notes.map((note, i) => (
                  <motion.article
                    key={note.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
                    className="clay clay-hover cursor-pointer p-4 sm:p-5"
                    role="button"
                    tabIndex={0}
                    aria-label={`Open note: ${note.title || "Untitled scroll"}`}
                    onClick={() => openNote(note)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openNote(note);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display min-w-0 flex-1 truncate text-[16px] font-bold text-foreground">
                        {note.title || "Untitled scroll"}
                      </h3>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {note.blocks && (
                          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                            <Sparkles className="h-3 w-3" />
                            Interactive
                          </span>
                        )}
                        {note.coinsEarned > 0 && (
                          <span
                            className="clay-chip gold-text rounded-full px-2 py-1 text-[10px] font-bold"
                            style={{ boxShadow: "var(--clay-gold)" }}
                          >
                            +{note.coinsEarned}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="clay-chip rounded-full px-2 py-0.5">
                        {note.subject || "No subject"}
                      </span>
                      {note.chapter && (
                        <>
                          <span aria-hidden className="text-muted-foreground/50">
                            ·
                          </span>
                          <span className="clay-chip max-w-[55%] truncate rounded-full px-2 py-0.5">
                            {note.chapter}
                          </span>
                        </>
                      )}
                      <span className="ml-auto text-muted-foreground/60">{timeAgo(note.updatedAt)}</span>
                    </div>
                    <p className="mt-2.5 line-clamp-2 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
                      {note.content?.trim() || "An empty scroll awaits your runes…"}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-[11px] font-medium text-lavender/80">
                        Open scroll
                        <ArrowRight className="h-3 w-3" />
                      </span>
                      <Button
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(note);
                        }}
                        className="ghost-btn h-11 w-11 rounded-full p-0"
                        aria-label={`Delete note: ${note.title || "Untitled scroll"}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.article>
                ))}
              </div>
            )}

            {loadError && notes.length === 0 && !loading && (
              <div className="clay mt-4 flex flex-col items-center gap-3 p-6 text-center">
                <p className="text-sm leading-relaxed text-muted-foreground">{loadError}</p>
                <Button onClick={() => void loadNotes()} className="glow-btn h-11 rounded-full px-5 text-sm font-semibold">
                  Try again
                </Button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="editor"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.18, ease: "easeIn" } }}
            transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
          >
            {/* Top bar */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleBack()}
                className="ghost-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                aria-label="Back to your grimoire (saves first)"
              >
                <ArrowLeft className="h-4.5 w-4.5" />
              </button>
              <Input
                value={title}
                onChange={(e) => changeTitle(e.target.value)}
                placeholder="Untitled scroll"
                autoFocus={creating}
                aria-label="Note title"
                className="h-11 min-w-0 flex-1 border-0 bg-transparent px-2 font-display text-lg font-bold text-foreground shadow-none placeholder:text-muted-foreground/40 focus-visible:ring-0 md:text-lg"
              />
              <SaveStatusText poll={pollStatus} />
            </div>

            {/* Meta row */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="note-subject"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70"
                >
                  Subject
                </label>
                <Select value={subject} onValueChange={(v) => changeSubject(v)}>
                  <SelectTrigger
                    id="note-subject"
                    className="h-11 w-full rounded-2xl border-border bg-input text-sm"
                    aria-label="Subject"
                  >
                    <SelectValue placeholder="Choose subject" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {subjectOptions.map((s) => (
                      <SelectItem key={s} value={s} className="rounded-lg">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label
                  htmlFor="note-chapter"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70"
                >
                  Chapter
                </label>
                <Input
                  id="note-chapter"
                  value={chapter}
                  onChange={(e) => changeChapter(e.target.value)}
                  placeholder="e.g. Metals & Non-metals"
                  className="h-11 rounded-2xl border-border bg-input text-sm"
                />
              </div>
            </div>

            {/* Co-Pilot sticky toolbar (selection-aware) */}
            <div
              className="sticky top-16 z-10 -mx-1 mt-4 rounded-2xl bg-card px-1 py-2"
              style={{ boxShadow: "var(--clay-raise-sm)" }}
            >
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="flex items-center gap-1.5 pr-1 text-[10px] font-semibold uppercase tracking-widest text-lavender/80">
                  <Sparkles className="h-3 w-3" />
                  Co-Pilot
                </span>
                {COPILOT_ACTIONS.map(({ id, label, hint, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    title={hint}
                    onClick={() => runCoPilot(id)}
                    aria-label={`${label} — ${hint}`}
                    className="clay-chip flex h-11 items-center gap-1.5 px-3.5 text-[13px] font-medium"
                  >
                    <Icon className="h-3.5 w-3.5 text-lavender" />
                    {label}
                  </button>
                ))}
                <span
                  className={`ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] ${
                    hasSelection ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {hasSelection ? `Acting on: selection (${selLen} chars)` : "Acting on: entire note"}
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="clay mt-4 p-4 sm:p-5">
              <div className="rounded-2xl focus-within:ring-[3px] focus-within:ring-primary/45">
                <Textarea
                  ref={contentRef}
                  value={content}
                  onChange={(e) => changeContent(e.target.value)}
                  onSelect={syncSel}
                  onKeyUp={syncSel}
                  onMouseUp={syncSel}
                  onTouchEnd={syncSel}
                  placeholder="Scribe your understanding here — definitions, formulas, worked examples, doubts…"
                  aria-label="Note content"
                  className="kingdom-scroll min-h-[320px] resize-none rounded-2xl border-0 bg-input p-4 text-[15px] leading-relaxed text-foreground/95 placeholder:text-muted-foreground/60 focus-visible:ring-0"
                  style={{ boxShadow: "var(--clay-press)" }}
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/60">
                Select any passage — the Co-Pilot acts on it. No selection? It reshapes the whole scroll.
              </p>
            </div>

            {/* Alchemist */}
            <div className="mt-5 flex flex-col items-center gap-2">
              <Button
                onClick={() => void runTransmute()}
                disabled={!canTransmute || transmuting}
                className="glow-btn h-12 w-full rounded-full text-[15px] font-semibold sm:w-auto sm:px-6"
              >
                <FlaskConical className="h-4 w-4" />
                Transmute into interactive ✦
              </Button>
              {!canTransmute && (
                <p className="text-[11px] text-muted-foreground/70">
                  Write at least {MIN_TRANSMUTE_CHARS} characters to awaken the Alchemist.
                </p>
              )}
            </div>

            {/* Interactive mode (rendered as soon as blocks exist) */}
            {blocks && (
              <InteractiveSection
                blocks={blocks}
                mastered={coinsEarned > 0}
                completing={completing}
                onComplete={() => void completeModule()}
                onRetransmute={() => void runTransmute()}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent className="rounded-[1.75rem] p-5 sm:max-w-md">
          <AlertDialogHeader className="text-center sm:text-left">
            <AlertDialogTitle className="font-display text-lg font-bold text-foreground">Burn this scroll?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              &quot;{deleteTarget?.title || "Untitled scroll"}&quot; and its interactive companion will turn to ash. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="ghost-btn h-11 rounded-full">Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="h-11 rounded-full bg-destructive text-[15px] font-semibold text-primary-foreground hover:bg-destructive/90 [box-shadow:var(--clay-raise-sm)]"
            >
              Burn ✧
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── AI Co-Pilot dialog (working → result, same dialog) ── */}
      <Dialog
        open={ai !== null}
        onOpenChange={(o) => {
          if (!o && ai?.phase !== "working") setAi(null);
        }}
      >
        <DialogContent
          className="rounded-[1.75rem] p-5 sm:max-w-lg sm:p-6"
          aria-describedby={undefined}
          showCloseButton={ai?.phase !== "working"}
          onEscapeKeyDown={(e) => {
            if (ai?.phase === "working") e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (ai?.phase === "working") e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (ai?.phase === "working") e.preventDefault();
          }}
        >
          {ai?.phase === "working" && (
            <RitualBody icon={Sparkles} title="The Co-Pilot is working…" lines={copilotLines} meta={aiMeta} />
          )}

          {ai?.phase === "result" && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <DialogTitle className="font-display text-lg font-bold text-foreground">
                  {COPILOT_ACTIONS.find((a) => a.id === ai.action)?.noun ?? "Draft"}{" "}
                  <span className="lavender-text">forged ✦</span>
                </DialogTitle>
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  {ai.mode === "replace-selection" ? "Replaces your selected passage" : "Replaces the entire note content"}
                </p>
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Before</p>
                <div className="clay-inset kingdom-scroll max-h-48 overflow-y-auto whitespace-pre-wrap p-3 text-[13px] leading-relaxed text-secondary-foreground">
                  {ai.original}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-lavender/80">After ✦</p>
                <div className="kingdom-scroll max-h-64 overflow-y-auto whitespace-pre-wrap rounded-[1.25rem] bg-primary/10 p-3 text-[13px] leading-relaxed text-foreground [box-shadow:var(--clay-raise-sm)]">
                  {ai.transformed}
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setAi(null)} className="ghost-btn h-12 flex-1 rounded-full">
                  Discard
                </Button>
                <Button onClick={applyAi} className="glow-btn h-12 flex-[2] rounded-full font-semibold">
                  <Sparkles className="h-4 w-4" />
                  Apply
                </Button>
              </div>
            </div>
          )}

          {ai?.phase === "error" && (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
                <Sparkles className="h-5 w-5 text-destructive" />
              </span>
              <DialogTitle className="font-display text-lg font-bold text-foreground">The Co-Pilot faltered</DialogTitle>
              <p className="text-sm leading-relaxed text-muted-foreground">{ai.error ?? "Something went wrong"}</p>
              <div className="mt-1 flex w-full gap-3">
                <Button variant="outline" onClick={() => setAi(null)} className="ghost-btn h-11 flex-1 rounded-full">
                  Close
                </Button>
                <Button onClick={retryAi} className="glow-btn h-11 flex-[2] rounded-full font-semibold">
                  Try again
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Interactive Alchemist dialog ── */}
      <Dialog
        open={transmuting || transmuteError !== null}
        onOpenChange={(o) => {
          if (!o && !transmuting) setTransmuteError(null);
        }}
      >
        <DialogContent
          className="rounded-[1.75rem] p-5 sm:max-w-md"
          aria-describedby={undefined}
          showCloseButton={!transmuting}
          onEscapeKeyDown={(e) => {
            if (transmuting) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (transmuting) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (transmuting) e.preventDefault();
          }}
        >
          {transmuting ? (
            <RitualBody icon={FlaskConical} title="The Interactive Alchemist is transmuting…" lines={ALCHEMIST_LINES} meta={aiMeta} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
                <FlaskConical className="h-5 w-5 text-destructive" />
              </span>
              <DialogTitle className="font-display text-lg font-bold text-foreground">Transmutation failed</DialogTitle>
              <p className="text-sm leading-relaxed text-muted-foreground">{transmuteError}</p>
              <div className="mt-1 flex w-full gap-3">
                <Button variant="outline" onClick={() => setTransmuteError(null)} className="ghost-btn h-11 flex-1 rounded-full">
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setTransmuteError(null);
                    void runTransmute();
                  }}
                  className="glow-btn h-11 flex-[2] rounded-full font-semibold"
                >
                  Try again
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
