"use client";

// ─── Scholar's Kingdom · Task 4-c: The Examination Hall (Mock Test Center) ──
// Autonomous PYQ Finder + Competency Mock Test + PDF Generator.
// State machine: home (config) → summoning → player → grading → result
//                | history (list) | history-detail (verdict or unfinished draft).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Crown,
  Feather,
  FileDown,
  Info,
  Loader2,
  RotateCcw,
  ScrollText,
  Swords,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { REWARDS, formatTerritory } from "@/lib/kingdom/constants";
import { MagicDust } from "./MagicDust";
import type { KingdomUser, TestAttemptDTO, TestPaper, TestQuestion } from "@/lib/kingdom/types";

// ─── Constants & helpers ────────────────────────────────────────────────────

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
const FULL_SYLLABUS = "Full Syllabus";

type Difficulty = "standard" | "challenge" | "board-elite";

interface TestConfig {
  subject: string;
  chapter: string;
  difficulty: Difficulty;
}

const DIFFICULTIES: { value: Difficulty; label: string; desc: string }[] = [
  { value: "standard", label: "Standard", desc: "Board-level PYQ practice" },
  { value: "challenge", label: "Challenge", desc: "Case-based application twists" },
  { value: "board-elite", label: "Board Elite", desc: "Topper-tier full rigour" },
];

const GRADE_LINES = [
  "The Chief Examiner is grading…",
  "Cross-checking every answer against the marking scheme…",
  "Weighing your competency profile…",
  "Tallying marks and Kingdom Coins…",
] as const;

type Stage =
  | { kind: "home" }
  | { kind: "summoning" }
  | { kind: "player"; attempt: TestAttemptDTO }
  | { kind: "grading"; attempt: TestAttemptDTO }
  | { kind: "result"; attempt: TestAttemptDTO }
  | { kind: "history" }
  | { kind: "history-detail"; attempt: TestAttemptDTO; from: "home" | "history" };

interface ChapterFetch {
  status: "loading" | "ready" | "error";
  chapters?: string[];
}

type AnswerMap = Record<string, string | number>;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function flattenPaper(paper: TestPaper): { q: TestQuestion; n: number }[] {
  const out: { q: TestQuestion; n: number }[] = [];
  let n = 1;
  for (const s of paper.sections) {
    for (const q of s.questions) out.push({ q, n: n++ });
  }
  return out;
}

function isAnswered(value: string | number | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

// ─── Tiny shared pieces ─────────────────────────────────────────────────────

/** Baby dragon mascot — glows even while the art is still generating. */
function DragonMascot({ size = 120, className = "" }: { size?: number; className?: string }) {
  const [visible, setVisible] = useState(true);
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }} aria-hidden>
      <div className="clay-well absolute inset-0" style={{ borderRadius: "999px" }} />
      {visible && (
        <Image
          src="/kingdom/dragon-mascot-clay.png"
          alt=""
          width={size}
          height={size}
          onError={() => setVisible(false)}
          className="animate-float relative select-none rounded-full object-cover"
          style={{ width: "78%", height: "78%" }}
        />
      )}
    </div>
  );
}

/** Elapsed m:ss counter for long AI waits. */
function ElapsedTimer() {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-semibold tabular-nums text-foreground">
      {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}
    </span>
  );
}

/** Rotating status line that advances every `intervalMs`. */
function useRotatingLine(lines: readonly string[], intervalMs = 4000): string {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % lines.length), intervalMs);
    return () => clearInterval(id);
  }, [lines, intervalMs]);
  return lines[Math.min(idx, lines.length - 1)] ?? "";
}

function RotatingLine({ line }: { line: string }) {
  return (
    <div className="flex min-h-[22px] items-center justify-center" role="status">
      <AnimatePresence mode="wait">
        <motion.p
          key={line}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3 }}
          className="text-sm text-lavender"
        >
          {line}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/** PDF parchment download (question paper / with answer key). */
function usePaperPdf() {
  const [busy, setBusy] = useState<"paper" | "answers" | null>(null);
  const download = useCallback(async (attemptId: string, includeAnswers: boolean) => {
    setBusy(includeAnswers ? "answers" : "paper");
    try {
      const blob = await kingdomApi.tests.pdf(attemptId, includeAnswers);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = includeAnswers ? "paper-with-answers.pdf" : "question-paper.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success("PDF parchment compiled — check your downloads");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF compilation failed — try again");
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, download };
}

/** Animated SVG score ring — gold when passed, muted red otherwise. */
function ScoreRing({ percentage, passed }: { percentage: number; passed: boolean }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div
      className="clay-well relative flex h-36 w-36 shrink-0 items-center justify-center"
      style={{ borderRadius: "999px" }}
      role="img"
      aria-label={`Score ${Math.round(percentage)} percent`}
    >
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="ring-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f9d784" />
            <stop offset="55%" stopColor="#e9a63b" />
            <stop offset="100%" stopColor="#c9821f" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={R} fill="none" stroke="#e6dbc4" strokeWidth="10" />
        <motion.circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={passed ? "url(#ring-gold)" : "#d9534f"}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - percentage / 100) }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-bold text-foreground">{Math.round(percentage)}%</span>
      </div>
    </div>
  );
}

function MetaChip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "gold" | "lavender" }) {
  const cls =
    tone === "gold"
      ? "clay-chip gold-text"
      : tone === "lavender"
        ? "clay-chip lavender-text"
        : "clay-chip";
  return <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${cls}`}>{children}</span>;
}

// ─── Past-paper card ────────────────────────────────────────────────────────

function AttemptCard({ attempt, onOpen }: { attempt: TestAttemptDTO; onOpen: (a: TestAttemptDTO) => void }) {
  const result = attempt.result;
  const title = attempt.paper?.paperTitle ?? `${attempt.subject} Paper`;
  const dateStr = formatDate(attempt.submittedAt ?? attempt.createdAt);
  return (
    <button
      type="button"
      onClick={() => onOpen(attempt)}
      className="clay clay-hover w-full p-4 text-left even:[background:#f0e7d3] even:[box-shadow:var(--clay-press)] even:[border-radius:1.25rem]"
      aria-label={`Open paper: ${title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display truncate text-sm font-bold text-foreground">{title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {attempt.subject} · {attempt.chapter}
          </p>
          {dateStr && <p className="mt-1 text-[11px] text-muted-foreground/70">{dateStr}</p>}
        </div>
        {result ? (
          <span
            className={`clay-chip shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide ${
              result.passed ? "gold-text" : ""
            }`}
            style={result.passed ? { boxShadow: "var(--clay-gold)" } : undefined}
          >
            {result.totalScored}/{result.totalMarks} · {Math.round(result.percentage)}% ·{" "}
            {result.passed ? "PASSED" : "FAILED"}
          </span>
        ) : (
          <span className="clay-chip lavender-text shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide">
            IN PROGRESS
          </span>
        )}
      </div>
    </button>
  );
}

// ─── 1. Home / config stage ─────────────────────────────────────────────────

interface HomeStageProps {
  user: KingdomUser;
  config: TestConfig;
  onPickSubject: (subject: string) => void;
  onConfigChange: (patch: Partial<TestConfig>) => void;
  chapterNames: string[];
  chapterLoading: boolean;
  chapterFailed: boolean;
  onRetryChapters: () => void;
  attempts: TestAttemptDTO[] | null;
  historyLoading: boolean;
  onRetryHistory: () => void;
  onSummon: () => void;
  onOpenAttempt: (attempt: TestAttemptDTO) => void;
  onViewAll: () => void;
}

function HomeStage(props: HomeStageProps) {
  const {
    user,
    config,
    onPickSubject,
    onConfigChange,
    chapterNames,
    chapterLoading,
    chapterFailed,
    onRetryChapters,
    attempts,
    historyLoading,
    onRetryHistory,
    onSummon,
    onOpenAttempt,
    onViewAll,
  } = props;

  const canSummon = config.subject.length > 0 && config.chapter.trim().length > 0;
  const recent = attempts?.slice(0, 3) ?? [];

  return (
    <div>
      <header>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
          Mock Test · {user.board ?? "Your Board"}
        </p>
        <h2 className="font-display mt-1 text-2xl font-bold text-foreground">
          The <span className="lavender-text">Examination Hall</span>
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Competency-focused questions replicating authentic PYQ (Previous Year Question) patterns
          {user.grade !== null ? ` for Grade ${user.grade}` : ""}. Pick a subject and chapter — the Examination
          Sage drafts the paper, you sit it, the Chief Examiner grades it.
        </p>
      </header>

      {/* ── Config card ── */}
      <section className="clay relative mt-4 overflow-hidden p-5" aria-label="Test configuration">
        <MagicDust count={8} />
        <div className="relative">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">Summon a paper</p>

          {/* Subject */}
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground">Subject</p>
            {user.subjects.length === 0 ? (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground/70">
                No subjects enlisted yet — add subjects from your profile to summon papers.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Subject">
                {user.subjects.map((s) => {
                  const active = config.subject === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onPickSubject(s)}
                      className={`rounded-full px-3.5 py-2.5 text-[13px] font-medium transition-all ${
                        active
                          ? "bg-primary text-primary-foreground [box-shadow:var(--clay-btn)]"
                          : "clay-chip hover:text-primary"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chapter */}
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground">Chapter</p>
            <div className="mt-2">
              {!config.subject ? (
                <p className="text-xs text-muted-foreground/70">Choose a subject to load its chapters.</p>
              ) : chapterLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-lavender" />
                  fetching chapters…
                </div>
              ) : chapterFailed || chapterNames.length === 0 ? (
                <div className="flex gap-2">
                  <Input
                    value={config.chapter}
                    onChange={(e) => onConfigChange({ chapter: e.target.value })}
                    placeholder="Type the chapter name…"
                    aria-label="Chapter (free text)"
                    className="h-11 rounded-2xl border-border bg-input text-base"
                  />
                  <Button
                    variant="outline"
                    onClick={onRetryChapters}
                    className="ghost-btn h-11 shrink-0 rounded-xl px-3"
                    aria-label="Retry fetching chapters"
                    title="Retry fetching chapters"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Select
                  value={config.chapter || undefined}
                  onValueChange={(v) => onConfigChange({ chapter: v })}
                >
                  <SelectTrigger className="h-11 w-full rounded-2xl border-border bg-input text-base" aria-label="Chapter">
                    <SelectValue placeholder="Pick a chapter" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value={FULL_SYLLABUS}>Full Syllabus / mixed</SelectItem>
                    {chapterNames.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Difficulty */}
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground">Difficulty</p>
            <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Difficulty">
              {DIFFICULTIES.map((d) => {
                const active = config.difficulty === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onConfigChange({ difficulty: d.value })}
                    className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-[1.25rem] px-2 py-2.5 text-center transition-all ${
                      active
                        ? "bg-primary [box-shadow:var(--clay-btn)]"
                        : "clay-inset hover:-translate-y-0.5 hover:[box-shadow:var(--clay-raise-sm)]"
                    }`}
                  >
                    <span className={`text-[13px] font-semibold ${active ? "text-primary-foreground" : "text-foreground"}`}>
                      {d.label}
                    </span>
                    <span className={`text-[10px] leading-tight ${active ? "text-primary-foreground/80" : "text-muted-foreground/80"}`}>
                      {d.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CTA */}
          <Button
            onClick={onSummon}
            disabled={!canSummon}
            className="glow-btn mt-5 h-12 w-full rounded-full text-[15px] font-semibold"
            aria-label="Summon the test paper"
          >
            <Swords className="h-4.5 w-4.5" /> Summon the Paper
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
            {canSummon
              ? "Sit it in-app — or export a printable PDF parchment from the verdict."
              : "Pick a subject and chapter to summon your paper."}
          </p>
        </div>
      </section>

      {/* ── Past papers ── */}
      <section className="mt-6" aria-label="Past papers">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">The archive</p>
            <h3 className="font-display mt-0.5 text-lg font-bold text-foreground">Past Papers</h3>
          </div>
          {attempts !== null && attempts.length > 3 && (
            <button
              type="button"
              onClick={onViewAll}
              className="min-h-[44px] px-2 text-xs font-medium text-lavender transition-colors hover:text-lavender/80"
              aria-label={`View all ${attempts.length} past papers`}
            >
              View all ({attempts.length})
            </button>
          )}
        </div>

        <div className="mt-3 space-y-2.5">
          {attempts === null && historyLoading && (
            <>
              <div className="shimmer h-20 w-full rounded-2xl" />
              <div className="shimmer h-20 w-full rounded-2xl" />
              <div className="shimmer h-20 w-full rounded-2xl" />
            </>
          )}
          {attempts === null && !historyLoading && (
            <div className="clay flex flex-col items-center gap-3 p-5 text-center">
              <p className="text-sm text-muted-foreground">The archive wouldn&apos;t open.</p>
              <Button variant="outline" onClick={onRetryHistory} className="ghost-btn h-11 rounded-full">
                <RotateCcw className="h-4 w-4" /> Retry
              </Button>
            </div>
          )}
          {attempts !== null && attempts.length === 0 && (
            <div className="clay flex flex-col items-center gap-2 p-6 text-center">
              <DragonMascot size={110} />
              <p className="font-display text-base font-bold text-foreground">No papers in the archive yet</p>
              <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                Summon your first paper above — the Examination Sage keeps every attempt on record, forever.
              </p>
            </div>
          )}
          {recent.map((a) => (
            <AttemptCard key={a.id} attempt={a} onOpen={onOpenAttempt} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── 2. Summoning stage (long AI generation) ────────────────────────────────

function SummoningScreen({ user, config, onCancel }: { user: KingdomUser; config: TestConfig; onCancel: () => void }) {
  const lines = useMemo(() => {
    const board = user.board ?? "your board";
    const grade = user.grade !== null ? `Grade ${user.grade}` : "your grade";
    return [
      `Locating authentic PYQ patterns for ${board} ${grade} ${config.subject}…`,
      "The Examination Sage is setting case-based questions…",
      "Balancing marks and competency mix…",
      "Finalising the paper…",
    ];
  }, [user.board, user.grade, config.subject]);
  const line = useRotatingLine(lines, 4000);

  return (
    <div className="clay relative overflow-hidden p-6 sm:p-8">
      <MagicDust count={16} />
      <div className="relative flex flex-col items-center text-center">
        <DragonMascot size={130} />
        <p className="mt-3 text-[11px] uppercase tracking-widest text-muted-foreground/70">The Examination Sage</p>
        <h3 className="font-display mt-1 text-xl font-bold text-foreground">Summoning your paper…</h3>
        <div className="mt-3">
          <RotatingLine line={line} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground/70">
          <ElapsedTimer /> elapsed · first summon per chapter is slow — cached forever after
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          <MetaChip tone="lavender">{config.subject}</MetaChip>
          <MetaChip>{config.chapter}</MetaChip>
          <MetaChip>{DIFFICULTIES.find((d) => d.value === config.difficulty)?.label ?? config.difficulty}</MetaChip>
        </div>
      </div>
      <div className="mt-6 space-y-3" aria-hidden>
        <div className="shimmer h-16 w-full rounded-xl" />
        <div className="shimmer h-5 w-2/3 rounded-lg" />
        <div className="shimmer h-11 w-full rounded-xl" />
        <div className="shimmer h-11 w-full rounded-xl" />
        <div className="shimmer h-5 w-1/2 rounded-lg" />
        <div className="shimmer h-11 w-11/12 rounded-xl" />
      </div>
      <Button variant="outline" onClick={onCancel} className="ghost-btn mt-6 h-11 w-full rounded-full">
        <ArrowLeft className="h-4 w-4" /> Back to the Hall
      </Button>
      <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
        The Sage keeps drafting — the paper will wait for you under Past Papers.
      </p>
    </div>
  );
}

// ─── 3. Player stage (in-app interactive test) ──────────────────────────────

function QuestionCard({
  q,
  n,
  value,
  onAnswer,
}: {
  q: TestQuestion;
  n: number;
  value: string | number | undefined;
  onAnswer: (id: number, value: string | number) => void;
}) {
  // Choice questions need valid options; otherwise fall back to a written answer
  const isChoice = (q.type === "mcq" || q.type === "case") && (q.options?.length ?? 0) >= 2;
  const textValue = typeof value === "string" ? value : "";
  return (
    <article className="clay p-4 sm:p-5" aria-label={`Question ${n}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-display text-sm font-bold text-lavender">Q{n}</span>
          <span className="truncate rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {q.competency}
          </span>
        </div>
        <span className="gold-text shrink-0 text-xs font-bold">[{q.marks} marks]</span>
      </div>

      {q.type === "case" && q.context && (
        <div className="clay-inset mt-3 p-4">
          <div className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-lavender" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-lavender">Case Study</p>
          </div>
          <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-secondary-foreground/90">{q.context}</p>
        </div>
      )}

      <p className="mt-3 whitespace-pre-line text-[15px] font-medium leading-relaxed text-foreground">{q.text}</p>

      {isChoice && (
        <div className="mt-3 space-y-2" role="radiogroup" aria-label={`Answer options for question ${n}`}>
          {(q.options ?? []).map((opt, i) => {
            const selected = value === i;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onAnswer(q.id, i)}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-[1.25rem] px-3 py-2.5 text-left transition-all ${
                  selected
                    ? "bg-primary text-primary-foreground [box-shadow:var(--clay-btn)]"
                    : "clay-inset hover:-translate-y-0.5 hover:[box-shadow:var(--clay-raise-sm)]"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    selected ? "bg-primary-foreground text-primary" : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {LETTERS[i] ?? String(i + 1)}
                </span>
                <span className={`text-sm leading-relaxed ${selected ? "text-primary-foreground" : "text-foreground"}`}>{opt}</span>
              </button>
            );
          })}
        </div>
      )}

      {!isChoice && (
        <div className="mt-3">
          <Textarea
            rows={q.type === "short" ? 3 : 6}
            value={textValue}
            onChange={(e) => onAnswer(q.id, e.target.value)}
            aria-label={`Answer for question ${n}`}
            placeholder={q.type === "short" ? "Write your answer (2–3 lines)…" : "Write your detailed answer…"}
            className={`rounded-2xl border-transparent bg-input text-base leading-relaxed placeholder:text-muted-foreground/60 ${
              q.type === "long" ? "min-h-[140px]" : "min-h-[80px]"
            }`}
          />
          <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground/70">{textValue.length} characters</p>
        </div>
      )}
    </article>
  );
}

interface PlayerScreenProps {
  attempt: TestAttemptDTO;
  answers: AnswerMap;
  onAnswer: (id: number, value: string | number) => void;
  onSubmitPaper: () => void;
}

function PlayerScreen({ attempt, answers, onAnswer, onSubmitPaper }: PlayerScreenProps) {
  const paper = attempt.paper;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() => Math.max(1, paper?.durationMins ?? 30) * 60);
  const timeUpNotified = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setTimeLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (timeLeft === 0 && !timeUpNotified.current) {
      timeUpNotified.current = true;
      setConfirmOpen(true);
    }
  }, [timeLeft]);

  const sections = useMemo(() => {
    let n = 1;
    return (paper?.sections ?? []).map((s) => ({
      name: s.name,
      instructions: s.instructions,
      questions: s.questions.map((q) => ({ q, n: n++ })),
    }));
  }, [paper]);

  const flat = useMemo(() => sections.flatMap((s) => s.questions), [sections]);
  const totalQuestions = flat.length;
  const answeredCount = flat.filter(({ q }) => isAnswered(answers[String(q.id)])).length;
  const unanswered = totalQuestions - answeredCount;

  const mmss = `${String(Math.floor(timeLeft / 60)).padStart(2, "0")}:${String(timeLeft % 60).padStart(2, "0")}`;
  const timerClass =
    timeLeft < 60
      ? "animate-pulse bg-destructive/15 text-destructive"
      : timeLeft < 300
        ? "bg-gold/20 gold-text"
        : "bg-secondary text-foreground";

  if (!paper) {
    return (
      <div className="clay p-6 text-center">
        <p className="font-display text-lg font-bold text-foreground">The parchment is blank</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This paper could not be loaded. Head back to the hall and summon a fresh one.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Sticky sub-header */}
      <div
        className="sticky top-16 z-10 -mx-4 bg-background px-4 py-2.5"
        style={{ boxShadow: "0 14px 22px -18px rgba(74, 53, 85, 0.55)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display truncate text-sm font-bold text-foreground">{paper.paperTitle}</p>
            <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground/70">
              {answeredCount}/{totalQuestions} answered · {attempt.subject}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold tabular-nums [box-shadow:var(--clay-press)] ${timerClass}`}
              role="timer"
              aria-label={`Time remaining ${mmss}`}
            >
              <Timer className="h-3.5 w-3.5" />
              {mmss}
            </span>
            <Button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="glow-btn h-9 rounded-full px-4 text-xs font-semibold"
            >
              Submit
            </Button>
          </div>
        </div>
      </div>

      {/* Paper meta */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <MetaChip tone="gold">{paper.totalMarks} marks</MetaChip>
        <MetaChip>{totalQuestions} questions</MetaChip>
        <MetaChip>{paper.durationMins} min</MetaChip>
      </div>

      {/* PYQ pattern callout */}
      <div className="clay mt-3 p-4">
        <div className="flex gap-3">
          <ScrollText className="mt-0.5 h-5 w-5 shrink-0 text-lavender" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">Pattern based on authentic PYQ analysis:</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{paper.pyqPattern}</p>
          </div>
        </div>
      </div>

      {/* General instructions */}
      <Collapsible className="mt-3">
        <CollapsibleTrigger className="clay-inset group flex min-h-[44px] w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors">
          <span className="flex items-center gap-2 text-sm text-secondary-foreground">
            <Info className="h-4 w-4 text-lavender" /> General instructions
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="clay-inset mt-2 p-4">
          <p className="text-[13px] leading-relaxed text-muted-foreground">{paper.instructions}</p>
        </CollapsibleContent>
      </Collapsible>

      {/* Sections & questions */}
      {sections.map((s, si) => (
        <motion.section
          key={`${s.name}-${si}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(0.08 * si, 0.4), duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
          className="mt-6"
        >
          <h3 className="font-display text-lg font-bold text-foreground">{s.name}</h3>
          {s.instructions && (
            <p className="mt-1 text-xs italic leading-relaxed text-muted-foreground/80">{s.instructions}</p>
          )}
          <div className="mt-3 space-y-4">
            {s.questions.map(({ q, n }) => (
              <QuestionCard key={q.id} q={q} n={n} value={answers[String(q.id)]} onAnswer={onAnswer} />
            ))}
          </div>
        </motion.section>
      ))}

      {/* Bottom submit */}
      <Button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="glow-btn mt-6 h-12 w-full rounded-full text-[15px] font-semibold"
      >
        Submit for grading
      </Button>
      <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
        {unanswered === 0 ? "All questions answered" : `${unanswered} unanswered — blanks score zero`}
      </p>

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-[1.75rem] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Submit for AI grading?</AlertDialogTitle>
            <AlertDialogDescription>
              {timeLeft === 0 ? "Time is up — the paper must go to the Chief Examiner. " : ""}
              {unanswered === 0
                ? "Every question is answered. "
                : `${unanswered} question${unanswered === 1 ? "" : "s"} still unanswered — blanks score zero. `}
              The Chief Examiner takes a minute or two to grade and deliver your verdict. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-between">
            <AlertDialogCancel className="ghost-btn h-11 rounded-full">Keep writing</AlertDialogCancel>
            <AlertDialogAction className="glow-btn h-11 rounded-full px-6 font-semibold" onClick={onSubmitPaper}>
              Submit paper
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Grading stage ──────────────────────────────────────────────────────────

interface GradingScreenProps {
  attempt: TestAttemptDTO;
  answers: AnswerMap;
  addCoins: (delta: number) => void;
  onGraded: (attempt: TestAttemptDTO) => void;
  onFailed: () => void;
}

function GradingScreen({ attempt, answers, addCoins, onGraded, onFailed }: GradingScreenProps) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const { result } = await kingdomApi.tests.submit(attempt.id, answers);
        if (cancelled) return;
        if (result.coinReward > 0) {
          addCoins(result.coinReward);
          toast.success(`✦ +${result.coinReward} Kingdom Coins — territory expanded!`);
        }
        onGraded({ ...attempt, result, status: "submitted", submittedAt: new Date().toISOString() });
      } catch (err) {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "Grading failed — try submitting again");
        onFailed();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, answers, addCoins, onGraded, onFailed]);

  const line = useRotatingLine(GRADE_LINES, 4000);

  return (
    <div className="clay relative overflow-hidden p-6 sm:p-8">
      <MagicDust count={12} />
      <div className="relative flex flex-col items-center text-center">
        <div className="clay-well relative flex h-20 w-20 items-center justify-center" style={{ borderRadius: "999px" }}>
          <div className="shimmer absolute inset-0 rounded-full" aria-hidden />
          <Feather className="animate-float h-8 w-8 text-lavender" strokeWidth={1.6} />
        </div>
        <p className="mt-4 text-[11px] uppercase tracking-widest text-muted-foreground/70">The Chief Examiner</p>
        <h3 className="font-display mt-1 text-xl font-bold text-foreground">Dipping the quill…</h3>
        <div className="mt-3">
          <RotatingLine line={line} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground/70">
          <ElapsedTimer /> elapsed · your answers are sealed
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          <MetaChip tone="lavender">{attempt.subject}</MetaChip>
          <MetaChip>{attempt.chapter}</MetaChip>
        </div>
      </div>
      <div className="mt-6 space-y-3" aria-hidden>
        <div className="shimmer h-5 w-1/3 rounded-lg" />
        <div className="shimmer h-4 w-full rounded-lg" />
        <div className="shimmer h-4 w-11/12 rounded-lg" />
        <div className="shimmer h-4 w-full rounded-lg" />
        <div className="shimmer h-5 w-1/4 rounded-lg" />
      </div>
    </div>
  );
}

// ─── 4. Result view (fresh result + history-detail) ─────────────────────────

function ResultView({ attempt, onBack }: { attempt: TestAttemptDTO; onBack: () => void }) {
  const result = attempt.result;
  const { busy, download } = usePaperPdf();

  const flat = useMemo(() => (attempt.paper ? flattenPaper(attempt.paper) : []), [attempt.paper]);
  const byId = useMemo(() => {
    const m = new Map<number, { q: TestQuestion; n: number }>();
    for (const f of flat) m.set(f.q.id, f);
    return m;
  }, [flat]);

  if (!result) {
    return (
      <div className="clay p-6 text-center">
        <p className="font-display text-lg font-bold text-foreground">No verdict yet</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This paper hasn&apos;t been graded. Submit it to earn a verdict.
        </p>
        <Button variant="outline" onClick={onBack} className="ghost-btn mt-4 h-11 rounded-full">
          Back
        </Button>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, result.percentage));
  const title = attempt.paper?.paperTitle ?? `${attempt.subject} Paper`;
  const dateStr = formatDate(attempt.submittedAt ?? attempt.createdAt);

  return (
    <div>
      <div>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">Examination result</p>
        <h2 className="font-display mt-1 text-2xl font-bold text-foreground">
          The <span className="lavender-text">Verdict</span>
        </h2>
      </div>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
        className="clay relative mt-4 overflow-hidden p-5 sm:p-6"
      >
        <MagicDust count={14} />
        <div className="relative flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
          <ScoreRing percentage={pct} passed={result.passed} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold tracking-widest ${
                result.passed ? "clay-gold-btn" : "bg-destructive/10 text-destructive"
              }`}
            >
              {result.passed ? <Crown className="h-3.5 w-3.5" /> : <Swords className="h-3.5 w-3.5" />}
              {result.passed ? "PASSED" : "KEEP TRAINING"}
            </span>
            <h3 className="font-display mt-2 truncate text-lg font-bold text-foreground">{title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {attempt.subject} · {attempt.chapter}
              {dateStr ? ` · ${dateStr}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {result.totalScored}/{result.totalMarks} marks scored
            </p>
            {result.coinReward > 0 ? (
              <p className="mt-2.5 text-sm text-muted-foreground">
                <span
                  className="clay-chip gold-text inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold"
                  style={{ boxShadow: "var(--clay-gold)" }}
                >
                  +{result.coinReward} Kingdom Coins
                </span>{" "}
                earned —{" "}
                {formatTerritory(result.coinReward)} of territory expanded.
              </p>
            ) : (
              <p className="mt-2.5 text-sm text-muted-foreground">
                No coins this time — pass the paper to earn {REWARDS.TEST_PASS_BASE}+ Kingdom Coins.
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Examiner's verdict */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1, ease: [0.34, 1.56, 0.64, 1] }}
        className="clay mt-4 p-5"
      >
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">Examiner&apos;s notes</p>
        <h3 className="font-display mt-0.5 text-lg font-bold text-foreground">Examiner&apos;s Verdict</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#63ad5c]">Strengths</p>
            <ul className="mt-2 space-y-1.5">
              {result.strengths.length > 0 ? (
                result.strengths.map((s) => (
                  <li key={s} className="clay-inset flex items-start gap-2 px-3 py-2 text-[13px] leading-relaxed text-secondary-foreground">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#63ad5c]" /> {s}
                  </li>
                ))
              ) : (
                <li className="text-[13px] text-muted-foreground/70">No standout strengths recorded.</li>
              )}
            </ul>
          </div>
          <div>
            <p className="gold-text text-xs font-semibold uppercase tracking-wider">Weak areas</p>
            <ul className="mt-2 space-y-1.5">
              {result.weakAreas.length > 0 ? (
                result.weakAreas.map((w) => (
                  <li key={w} className="clay-inset flex items-start gap-2 px-3 py-2 text-[13px] leading-relaxed text-secondary-foreground">
                    <AlertCircle className="gold-text mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                  </li>
                ))
              ) : (
                <li className="text-[13px] text-muted-foreground/70">No weak areas flagged — impressive.</li>
              )}
            </ul>
          </div>
        </div>
        <div className="mt-4 rounded-[1.25rem] bg-primary/10 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-lavender">Study advice</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{result.studyAdvice}</p>
        </div>
      </motion.div>

      {/* Per-question feedback */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
        className="clay mt-4 p-5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-foreground">Question Feedback</h3>
          <span className="text-[11px] text-muted-foreground/70">{result.perQuestion.length} graded</span>
        </div>
        <div className="mt-3 max-h-96 space-y-2 overflow-y-auto kingdom-scroll pr-1">
          {result.perQuestion.map((r, i) => {
            const f = byId.get(r.id);
            const n = f?.n ?? i + 1;
            const marks = f?.q.marks ?? 0;
            const zero = r.scored <= 0;
            return (
              <div
                key={`${r.id}-${i}`}
                className={`rounded-[1.25rem] px-3.5 py-3 ${
                  zero ? "bg-destructive/10 [box-shadow:var(--clay-press)]" : "clay-inset"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">
                    Q{n} <span className="font-normal text-muted-foreground">· {r.scored}/{marks}</span>
                  </p>
                  {zero && (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                      zero
                    </span>
                  )}
                </div>
                {r.feedback && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{r.feedback}</p>}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* PDF export */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
        className="clay mt-4 p-5"
      >
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">The parchment press</p>
        <h3 className="font-display mt-0.5 text-lg font-bold text-foreground">Export as PDF</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          Print the paper, reattempt it offline, or study the answer key&apos;s marking scheme.
        </p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <Button
            variant="outline"
            onClick={() => void download(attempt.id, false)}
            disabled={busy !== null}
            className={`ghost-btn h-11 rounded-full text-xs font-semibold ${busy === "paper" ? "[box-shadow:var(--clay-press)]" : ""}`}
          >
            {busy === "paper" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Compiling…
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4" /> Download Question Paper (PDF)
              </>
            )}
          </Button>
          <Button
            onClick={() => void download(attempt.id, true)}
            disabled={busy !== null}
            className="glow-btn h-11 rounded-full text-xs font-semibold"
          >
            {busy === "answers" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Compiling…
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4" /> Download with Answer Key (PDF)
              </>
            )}
          </Button>
        </div>
        {busy !== null && <p className="mt-2 text-center text-[11px] text-muted-foreground/70">Compiling the parchment…</p>}
      </motion.div>

      <Button variant="outline" onClick={onBack} className="ghost-btn mt-5 h-12 w-full rounded-full">
        <ArrowLeft className="h-4 w-4" /> Back to the Hall
      </Button>
    </div>
  );
}

// ─── History-detail for unfinished drafts ───────────────────────────────────

function DraftView({ attempt, onResume, onBack }: { attempt: TestAttemptDTO; onResume: () => void; onBack: () => void }) {
  const { busy, download } = usePaperPdf();
  const paper = attempt.paper;
  return (
    <div className="clay relative overflow-hidden p-5 sm:p-6">
      <MagicDust count={10} />
      <div className="relative">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">Unfinished paper</p>
        <h2 className="font-display mt-1 text-xl font-bold text-foreground">
          {paper?.paperTitle ?? `${attempt.subject} Paper`}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {attempt.subject} · {attempt.chapter}
        </p>
        {paper && (
          <div className="mt-3 flex flex-wrap gap-2">
            <MetaChip tone="gold">{paper.totalMarks} marks</MetaChip>
            <MetaChip>{paper.sections.length} sections</MetaChip>
            <MetaChip>{paper.durationMins} min</MetaChip>
          </div>
        )}
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          This paper was summoned but never submitted for grading. Resume it in-app to face the Chief Examiner — or
          download the parchment to attempt it on paper.
        </p>
        <div className="mt-5 space-y-2.5">
          <Button onClick={onResume} className="glow-btn h-12 w-full rounded-full text-[15px] font-semibold">
            <Swords className="h-4 w-4" /> Resume the paper
          </Button>
          <Button
            variant="outline"
            onClick={() => void download(attempt.id, false)}
            disabled={busy !== null}
            className="ghost-btn h-12 w-full rounded-full"
          >
            {busy === "paper" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Compiling…
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4" /> Download Question Paper (PDF)
              </>
            )}
          </Button>
          <Button variant="outline" onClick={onBack} className="ghost-btn h-12 w-full rounded-full">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── History stage (full list) ──────────────────────────────────────────────

function HistoryStage({
  attempts,
  onOpenAttempt,
  onBack,
}: {
  attempts: TestAttemptDTO[];
  onOpenAttempt: (attempt: TestAttemptDTO) => void;
  onBack: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          className="ghost-btn h-11 w-11 shrink-0 rounded-full p-0"
          aria-label="Back to the Examination Hall"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">The archive</p>
          <h2 className="font-display text-lg font-bold text-foreground">
            Past Papers <span className="text-sm font-normal text-muted-foreground">({attempts.length})</span>
          </h2>
        </div>
      </div>
      {attempts.length === 0 ? (
        <div className="clay mt-4 flex flex-col items-center gap-2 p-6 text-center">
          <DragonMascot size={110} />
          <p className="font-display text-base font-bold text-foreground">The archive is empty</p>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            Summon a paper in the hall — every attempt is kept here, forever.
          </p>
        </div>
      ) : (
        <div className="mt-4 max-h-[68vh] space-y-2.5 overflow-y-auto kingdom-scroll pr-1">
          {attempts.map((a) => (
            <AttemptCard key={a.id} attempt={a} onOpen={onOpenAttempt} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component: state machine ──────────────────────────────────────────

export function TestCenter() {
  const user = useKingdom((s) => s.user);
  const syllabi = useKingdom((s) => s.syllabi);
  const setSyllabi = useKingdom((s) => s.setSyllabi);
  const addCoins = useKingdom((s) => s.addCoins);

  const [stage, setStage] = useState<Stage>({ kind: "home" });
  const [config, setConfig] = useState<TestConfig>({ subject: "", chapter: "", difficulty: "standard" });
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [chapterState, setChapterState] = useState<Record<string, ChapterFetch>>({});
  const [attempts, setAttempts] = useState<TestAttemptDTO[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const requestedRef = useRef<Set<string>>(new Set());
  const summonTokenRef = useRef(0);

  // ── History ──
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await kingdomApi.tests.list();
      setAttempts([...res.attempts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open the archive");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    void loadHistory();
  }, [userId, loadHistory]);

  // Scroll to top on every stage change.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stage]);

  // ── Chapters (lazy per subject, cached in store + local state) ──
  const loadChapters = useCallback(
    async (subject: string, force = false) => {
      if (!force && requestedRef.current.has(subject)) return;
      requestedRef.current.add(subject);
      setChapterState((prev) => ({ ...prev, [subject]: { status: "loading" } }));
      try {
        const { syllabus } = await kingdomApi.syllabus.getSubject(subject);
        setChapterState((prev) => ({
          ...prev,
          [subject]: { status: "ready", chapters: syllabus.chapters.map((c) => c.title) },
        }));
        const existing = useKingdom.getState().syllabi ?? [];
        if (!existing.some((x) => x.subject === subject)) setSyllabi([...existing, syllabus]);
      } catch (err) {
        setChapterState((prev) => ({ ...prev, [subject]: { status: "error" } }));
        toast.error(err instanceof Error ? err.message : "Couldn't fetch the syllabus");
      }
    },
    [setSyllabi],
  );

  const chapterNames = useMemo(() => {
    if (!config.subject) return [];
    const fromStore = syllabi?.find((s) => s.subject === config.subject)?.chapters.map((c) => c.title) ?? [];
    if (fromStore.length > 0) return [...new Set(fromStore)];
    const entry = chapterState[config.subject];
    return entry?.status === "ready" ? [...new Set(entry.chapters ?? [])] : [];
  }, [config.subject, syllabi, chapterState]);

  const chapterFetch = config.subject ? chapterState[config.subject] : undefined;
  const chapterLoading = chapterFetch?.status === "loading";
  const chapterFailed = chapterFetch?.status === "error";

  const pickSubject = useCallback(
    (subject: string) => {
      setConfig((c) => (c.subject === subject ? c : { ...c, subject, chapter: "" }));
      const inStore = (syllabi ?? []).some((x) => x.subject === subject);
      if (inStore) return;
      const st = chapterState[subject]?.status;
      if (st === "loading" || st === "ready") return;
      void loadChapters(subject, st === "error");
    },
    [syllabi, chapterState, loadChapters],
  );

  const patchConfig = useCallback((patch: Partial<TestConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
  }, []);

  const retryChapters = useCallback(() => {
    if (config.subject) void loadChapters(config.subject, true);
  }, [config.subject, loadChapters]);

  // ── Summoning ──
  const summon = useCallback(async (cfg: TestConfig) => {
    const chapter = cfg.chapter.trim();
    if (!cfg.subject || !chapter) {
      toast.error("Choose a subject and chapter before summoning the paper");
      return;
    }
    const token = ++summonTokenRef.current;
    setStage({ kind: "summoning" });
    try {
      const { attempt } = await kingdomApi.tests.generate(cfg.subject, chapter, cfg.difficulty);
      if (summonTokenRef.current !== token) return;
      setAnswers({});
      setStage({ kind: "player", attempt });
    } catch (err) {
      if (summonTokenRef.current !== token) return;
      toast.error(err instanceof Error ? err.message : "The summoning failed — try again");
      setStage({ kind: "home" });
    }
  }, []);

  const handleSummon = useCallback(() => {
    void summon(config);
  }, [summon, config]);

  const cancelSummon = useCallback(() => {
    summonTokenRef.current += 1;
    setStage({ kind: "home" });
  }, []);

  // ── Player / grading ──
  const handleAnswer = useCallback((id: number, value: string | number) => {
    setAnswers((prev) => ({ ...prev, [String(id)]: value }));
  }, []);

  const beginGrading = useCallback(() => {
    setStage((s) => (s.kind === "player" ? { kind: "grading", attempt: s.attempt } : s));
  }, []);

  const handleGraded = useCallback((graded: TestAttemptDTO) => {
    setStage({ kind: "result", attempt: graded });
  }, []);

  const handleGradeFailed = useCallback(() => {
    setStage((s) => (s.kind === "grading" ? { kind: "player", attempt: s.attempt } : s));
  }, []);

  // ── Navigation ──
  const backToHall = useCallback(() => {
    setStage({ kind: "home" });
    void loadHistory();
  }, [loadHistory]);

  const backToHistory = useCallback(() => setStage({ kind: "history" }), []);

  const openFromHome = useCallback((attempt: TestAttemptDTO) => {
    setStage({ kind: "history-detail", attempt, from: "home" });
  }, []);

  const openFromHistory = useCallback((attempt: TestAttemptDTO) => {
    setStage({ kind: "history-detail", attempt, from: "history" });
  }, []);

  const resumeAttempt = useCallback((attempt: TestAttemptDTO) => {
    setAnswers({});
    setStage({ kind: "player", attempt });
  }, []);

  if (!user) return null;

  const stageKey = stage.kind + ("attempt" in stage ? `:${stage.attempt.id}` : "");
  const detailBack = stage.kind === "history-detail" && stage.from === "history" ? backToHistory : backToHall;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stageKey}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10, transition: { duration: 0.18, ease: "easeIn" } }}
        transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
      >
        {stage.kind === "home" && (
          <HomeStage
            user={user}
            config={config}
            onPickSubject={pickSubject}
            onConfigChange={patchConfig}
            chapterNames={chapterNames}
            chapterLoading={chapterLoading}
            chapterFailed={chapterFailed}
            onRetryChapters={retryChapters}
            attempts={attempts}
            historyLoading={historyLoading}
            onRetryHistory={() => void loadHistory()}
            onSummon={handleSummon}
            onOpenAttempt={openFromHome}
            onViewAll={() => setStage({ kind: "history" })}
          />
        )}

        {stage.kind === "summoning" && <SummoningScreen user={user} config={config} onCancel={cancelSummon} />}

        {stage.kind === "player" && (
          <PlayerScreen
            attempt={stage.attempt}
            answers={answers}
            onAnswer={handleAnswer}
            onSubmitPaper={beginGrading}
          />
        )}

        {stage.kind === "grading" && (
          <GradingScreen
            attempt={stage.attempt}
            answers={answers}
            addCoins={addCoins}
            onGraded={handleGraded}
            onFailed={handleGradeFailed}
          />
        )}

        {stage.kind === "result" && <ResultView attempt={stage.attempt} onBack={backToHall} />}

        {stage.kind === "history" && (
          <HistoryStage attempts={attempts ?? []} onOpenAttempt={openFromHistory} onBack={backToHall} />
        )}

        {stage.kind === "history-detail" &&
          (stage.attempt.result ? (
            <ResultView attempt={stage.attempt} onBack={detailBack} />
          ) : (
            <DraftView
              attempt={stage.attempt}
              onResume={() => resumeAttempt(stage.attempt)}
              onBack={detailBack}
            />
          ))}
      </motion.div>
    </AnimatePresence>
  );
}
