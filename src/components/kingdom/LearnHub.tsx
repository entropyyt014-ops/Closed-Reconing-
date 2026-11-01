"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Atom,
  BarChart3,
  BookMarked,
  BookOpen,
  BookOpenCheck,
  Brain,
  Briefcase,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  Dna,
  FlaskConical,
  Globe2,
  Hourglass,
  Landmark,
  Languages,
  Leaf,
  Library,
  Loader2,
  MessagesSquare,
  Microscope,
  RefreshCw,
  Scale,
  ScrollText,
  Sigma,
  Sparkles,
  Trophy,
  Users,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { kingdomApi } from "@/lib/kingdom/client";
import { REWARDS, gradeLabel } from "@/lib/kingdom/constants";
import { useKingdom } from "@/lib/kingdom/store";
import type { Chapter, ChapterModule, ChapterProgressDTO, Syllabus } from "@/lib/kingdom/types";
import { MagicDust } from "./MagicDust";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SUBJECT_ICONS: Record<string, LucideIcon> = {
  Mathematics: Sigma,
  Science: Microscope,
  Physics: Atom,
  Chemistry: FlaskConical,
  Biology: Dna,
  English: BookMarked,
  History: Landmark,
  Geography: Globe2,
  "Computer Science": Cpu,
  Economics: BarChart3,
  "Business Studies": Briefcase,
  Accountancy: Calculator,
  "Environmental Science": Leaf,
  "Civics / Political Science": Scale,
  "Second Language": Languages,
  Psychology: Brain,
  Sociology: Users,
  Statistics: BarChart3,
};

function chapterKey(subject: string, chapterTitle: string): string {
  return `${subject}::${chapterTitle}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function syllabusHours(s: Syllabus): number {
  return s.chapters.reduce((acc, c) => acc + (c.estimatedHours ?? 0), 0);
}

function fmtHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "—";
  if (h < 1) return `${Math.max(5, Math.round(h * 60))}m`;
  return `~${Math.round(h)}h`;
}

type SubjectStatus = "loading" | "ready" | "error";
type ModuleState = "idle" | "loading" | "ready" | "error";
type ScreenLevel = "subjects" | "chapters" | "chapter";

interface OpenChapter {
  subject: string;
  chapter: Chapter;
  index: number;
}

// ─── Small shared pieces ─────────────────────────────────────────────────────

/** Generated mascot art framed in a molded clay portrait seat (empty seat if the asset 404s). */
function Mascot({ src, size = 96, float = true }: { src: string; size?: number; float?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className={`clay-well relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl ${float ? "animate-float" : ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {!broken && (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          draggable={false}
          onError={() => setBroken(true)}
          className="relative h-full w-full select-none object-cover"
        />
      )}
    </span>
  );
}

function Chip({ icon: Icon, label, tone = "default" }: { icon: LucideIcon; label: string; tone?: "default" | "gold" }) {
  return (
    <span
      className={`clay-chip inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium ${
        tone === "gold" ? "text-[#a86a12]" : "text-muted-foreground"
      }`}
    >
      <Icon className={`h-3 w-3 ${tone === "gold" ? "text-[#a86a12]" : "text-lavender"}`} />
      {label}
    </span>
  );
}

// ─── Level 1 · subject cards ─────────────────────────────────────────────────

function SubjectSkeletonCard({ subject }: { subject: string }) {
  return (
    <div className="clay p-5 sm:p-6" aria-busy="true" aria-label={`Summoning the ${subject} syllabus`}>
      <div className="flex items-center gap-3.5">
        <div className="shimmer h-11 w-11 shrink-0 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <div className="shimmer h-4 w-3/5 rounded-md" />
          <div className="shimmer h-3 w-2/5 rounded-md" />
        </div>
      </div>
      <div className="mt-3.5 flex gap-2">
        <div className="shimmer h-6 w-24 rounded-full" />
        <div className="shimmer h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}

function SubjectErrorCard({ subject, message, onRetry }: { subject: string; message: string; onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: [0.34, 1.56, 0.64, 1] }}
      className="clay flex items-center gap-3 p-5 sm:p-6"
      role="alert"
    >
      <span className="clay-well flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
        <AlertTriangle className="h-5 w-5 text-destructive" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display truncate text-[15px] font-bold text-foreground">{subject}</h3>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{message}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        className="ghost-btn h-10 shrink-0 rounded-full px-4 text-xs"
        aria-label={`Retry summoning the ${subject} syllabus`}
      >
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </Button>
    </motion.div>
  );
}

function SubjectCard({
  syllabus,
  board,
  grade,
  completedCount,
  index,
  onOpen,
}: {
  syllabus: Syllabus;
  board: string;
  grade: string;
  completedCount: number;
  index: number;
  onOpen: () => void;
}) {
  const Icon: LucideIcon = SUBJECT_ICONS[syllabus.subject] ?? BookOpen;
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.06, 0.3), duration: 0.42, ease: [0.34, 1.56, 0.64, 1] }}
      whileTap={{ scale: 0.985 }}
      onClick={onOpen}
      aria-label={`Open the ${syllabus.subject} syllabus — ${syllabus.chapters.length} chapters`}
      className="clay clay-hover w-full p-5 text-left sm:p-6"
    >
      <span className="flex items-center gap-3.5">
        <span className="clay-well flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
          <Icon className="h-5 w-5 text-lavender" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-display block truncate text-[15px] font-bold text-foreground sm:text-base">
            {syllabus.subject}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
            syllabus for {board} · {grade}
          </span>
        </span>
        <ChevronRight className="h-4.5 w-4.5 shrink-0 text-muted-foreground/50" />
      </span>
      <span className="mt-3 flex flex-wrap items-center gap-2">
        <Chip icon={BookOpen} label={`${syllabus.chapters.length} chapters`} />
        <Chip icon={Clock} label={fmtHours(syllabusHours(syllabus))} />
        {completedCount > 0 && (
          <Chip icon={CheckCircle2} label={`${completedCount}/${syllabus.chapters.length} mastered`} tone="gold" />
        )}
      </span>
    </motion.button>
  );
}

// ─── Level 2 · chapter rows ──────────────────────────────────────────────────

function ChapterRow({
  chapter,
  index,
  completed,
  expanded,
  onToggleTopics,
  onOpen,
}: {
  chapter: Chapter;
  index: number;
  completed: boolean;
  expanded: boolean;
  onToggleTopics: () => void;
  onOpen: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.035, 0.35), duration: 0.34, ease: [0.34, 1.56, 0.64, 1] }}
      className="clay overflow-hidden"
      role="listitem"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open chapter ${index + 1}: ${chapter.title}`}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/60 active:bg-secondary"
      >
        <span
          className={`clay-well font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold ${
            completed ? "text-[#a86a12]" : "text-lavender"
          }`}
        >
          {pad2(index + 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-foreground">
            {chapter.title}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
            {chapter.topics.length} topics · {fmtHours(chapter.estimatedHours)}
          </span>
        </span>
        {completed ? (
          <span className="clay-chip inline-flex shrink-0 items-center justify-center rounded-full p-1.5 text-[#a86a12]">
            <CheckCircle2 className="h-4 w-4" strokeWidth={2.4} />
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
        )}
      </button>
      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={onToggleTopics}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} the ${chapter.topics.length} topics of ${chapter.title}`}
          className="flex min-h-[32px] items-center gap-1 rounded-full text-[11px] font-medium text-lavender/90 transition-colors hover:text-lavender"
        >
          {expanded ? "Hide topics" : `+${chapter.topics.length} topics`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {chapter.topics.map((topic, ti) => (
                  <span
                    key={ti}
                    className="rounded-full bg-secondary px-2.5 py-1 text-[10.5px] leading-tight text-muted-foreground"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Loading theatrics ───────────────────────────────────────────────────────

function SummoningCard({ line, elapsed, forged, total }: { line: string; elapsed: number; forged: number; total: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="clay relative overflow-hidden p-5"
      role="status"
      aria-live="polite"
    >
      <MagicDust count={8} />
      <div className="relative flex items-center gap-4">
        <Mascot src="/kingdom/dragon-mascot-clay.png" size={84} />
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.p
              key={line}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="text-sm font-medium leading-snug text-foreground"
            >
              {line}
            </motion.p>
          </AnimatePresence>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
            <Hourglass className="h-3.5 w-3.5 shrink-0 text-lavender" />
            <span className="tabular-nums">{elapsed}s</span>
            <span className="text-muted-foreground/70">· this happens once — then it&rsquo;s cached forever</span>
          </p>
          <div className="mt-3 flex items-center gap-2.5">
            <Progress
              value={total > 0 ? (forged / total) * 100 : 0}
              className="[&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-indicator]]:bg-[#8e4fd0] [&_[data-slot=progress-indicator]]:shadow-[inset_0_1px_1px_#ffffff8c]"
              style={{ background: "#f0e7d3", boxShadow: "var(--clay-press)" }}
            />
            <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
              {forged}/{total} scrolls
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ModuleLoader({ line, slow }: { line: string; slow: boolean }) {
  if (!slow) {
    return (
      <div className="clay p-5" aria-busy="true" role="status">
        <div className="shimmer h-4 w-1/3 rounded-md" />
        <div className="mt-4 space-y-2.5">
          <div className="shimmer h-3.5 w-full rounded-md" />
          <div className="shimmer h-3.5 w-11/12 rounded-md" />
          <div className="shimmer h-3.5 w-4/5 rounded-md" />
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-lavender" /> Summoning from the royal archive…
        </p>
      </div>
    );
  }
  return (
    <div className="clay relative overflow-hidden p-5 sm:p-6" role="status" aria-live="polite">
      <MagicDust count={10} />
      <div className="relative flex items-center gap-4">
        <Mascot src="/kingdom/tutor-owl-clay.png" size={80} />
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.p
              key={line}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="text-sm font-medium leading-snug text-foreground"
            >
              {line}
            </motion.p>
          </AnimatePresence>
          <p className="mt-1.5 text-[11px] text-muted-foreground/70">
            First-time composition by the Master Scholar — cached forever after.
          </p>
        </div>
      </div>
      <div className="relative mt-6 grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="shimmer h-9 rounded-xl" />
        ))}
      </div>
      <div className="relative mt-4 space-y-2.5">
        <div className="shimmer h-24 w-full rounded-2xl" />
        <div className="shimmer h-3.5 w-11/12 rounded-md" />
        <div className="shimmer h-3.5 w-3/5 rounded-md" />
      </div>
    </div>
  );
}

function EmptyLibrary({ onConsult }: { onConsult: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
      className="clay relative flex flex-col items-center gap-3 overflow-hidden p-8 text-center"
    >
      <MagicDust count={10} />
      <Mascot src="/kingdom/dragon-mascot-clay.png" size={140} />
      <h2 className="font-display relative text-lg font-bold text-foreground">The library shelves lie empty</h2>
      <p className="relative max-w-xs text-sm leading-relaxed text-muted-foreground">
        No subjects are sworn to your kingdom yet. Consult Professor Sage and begin your conquest.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onConsult}
        className="ghost-btn relative mt-1 h-11 rounded-full px-5 text-sm"
      >
        <MessagesSquare className="h-4 w-4" /> Consult Professor Sage
      </Button>
    </motion.div>
  );
}

// ─── Level 3 · the AI learning module ────────────────────────────────────────

function ChapterModuleView({
  module,
  cached,
  completed,
  completing,
  onComplete,
  onAskSage,
}: {
  module: ChapterModule;
  cached: boolean;
  completed: boolean;
  completing: boolean;
  onComplete: () => void;
  onAskSage: () => void;
}) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const tabTriggerClass =
    "rounded-xl px-1 py-2.5 text-[11px] font-semibold text-muted-foreground transition-all " +
    "data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-[var(--clay-raise-sm)] " +
    "sm:text-xs";

  return (
    <div className="flex flex-col gap-5">
      <Tabs defaultValue="overview">
        <TabsList className="clay-inset grid h-auto w-full grid-cols-4 gap-1 p-1">
          <TabsTrigger value="overview" className={tabTriggerClass}>
            Overview
          </TabsTrigger>
          <TabsTrigger value="deepdive" className={tabTriggerClass}>
            Deep Dive
          </TabsTrigger>
          <TabsTrigger value="formulas" className={tabTriggerClass}>
            Formulas
          </TabsTrigger>
          <TabsTrigger value="exam" className={tabTriggerClass}>
            Exam Intel
          </TabsTrigger>
        </TabsList>

        {/* 1 · Overview */}
        <TabsContent value="overview" className="mt-4">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex flex-col gap-4">
            <div className="clay p-5 sm:p-6">
              <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                <BookOpenCheck className="h-3.5 w-3.5 text-lavender" /> Chapter Summary
              </p>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">{module.summary}</p>
            </div>
            <div className="clay p-5 sm:p-6">
              <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                <Sparkles className="h-3.5 w-3.5 text-lavender" /> Quick Revision
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground/70">Tap a point to tick it off as you revise.</p>
              <ul className="mt-3 flex flex-col gap-2">
                {module.revisionPoints.map((point, i) => {
                  const on = !!checked[i];
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setChecked((prev) => ({ ...prev, [i]: !prev[i] }))}
                        className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition-all active:scale-[0.99] ${
                          on ? "bg-[#faeccf] shadow-[var(--clay-raise-sm)]" : "bg-secondary hover:bg-primary/5"
                        }`}
                      >
                        <Sparkles
                          className={`mt-0.5 h-4 w-4 shrink-0 transition-colors ${on ? "text-[#a86a12]" : "text-lavender/80"}`}
                        />
                        <span className={`flex-1 text-sm leading-snug ${on ? "text-foreground" : "text-foreground/85"}`}>{point}</span>
                        {on && <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#a86a12]" strokeWidth={3} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </motion.div>
        </TabsContent>

        {/* 2 · Deep Dive */}
        <TabsContent value="deepdive" className="mt-4">
          <div className="flex flex-col gap-3">
            {module.deepDive.length === 0 && (
              <div className="clay flex flex-col items-center gap-2 p-6 text-center">
                <Wand2 className="h-6 w-6 text-lavender/70" />
                <p className="text-sm text-muted-foreground">No deep-dive sections for this chapter.</p>
              </div>
            )}
            {module.deepDive.map((section, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.07, 0.5), duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                className="clay p-5"
              >
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[11px] text-muted-foreground/60">{pad2(i + 1)}</span>
                  <h4 className="font-display text-base font-bold leading-snug text-lavender">{section.topic}</h4>
                </div>
                <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{section.explanation}</p>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* 3 · Formulas */}
        <TabsContent value="formulas" className="mt-4">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex flex-col gap-3">
            {module.formulas.length === 0 && (
              <div className="clay flex flex-col items-center gap-2 p-6 text-center">
                <Wand2 className="h-6 w-6 text-lavender/70" />
                <p className="text-sm text-muted-foreground">No formulas for this chapter — concepts over equations!</p>
              </div>
            )}
            {module.formulas.map((formula, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.07, 0.5), duration: 0.34, ease: [0.34, 1.56, 0.64, 1] }}
                className="clay p-5"
              >
                <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                  {formula.name}
                </p>
                <p className="clay-inset mt-3 break-words px-3 py-2.5 text-center font-mono text-lg tracking-wide text-foreground sm:text-xl">
                  {formula.expression}
                </p>
                {formula.note && (
                  <p className="mt-3 text-center text-xs italic leading-relaxed text-muted-foreground">{formula.note}</p>
                )}
              </motion.div>
            ))}
          </motion.div>
        </TabsContent>

        {/* 4 · Exam Intel */}
        <TabsContent value="exam" className="mt-4">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
            className="clay p-5 sm:p-6"
            style={{ background: "linear-gradient(180deg,#fff3d9,#faeccf)" }}
          >
            <p className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
              <ScrollText className="h-4 w-4 shrink-0 text-[#a86a12]" /> How board exams test this chapter
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#a86a12]/60">
              Exam Intel · Previous Year Questions
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
              {module.pyqInsight || "The archives hold no exam intel for this chapter yet."}
            </p>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* CTAs */}
      <div className="flex flex-col gap-2.5">
        <Button
          type="button"
          variant="outline"
          onClick={onAskSage}
          aria-label="Ask Professor Sage about this chapter"
          className="ghost-btn h-12 w-full rounded-full text-[15px] font-medium"
        >
          <Mascot src="/kingdom/tutor-owl-clay.png" size={22} float={false} /> Ask Professor Sage about this chapter
        </Button>
        {completed ? (
          <Button
            type="button"
            disabled
            aria-label="Chapter already mastered"
            className="clay-gold-btn h-12 w-full rounded-full text-[15px] font-semibold"
          >
            <CheckCircle2 className="h-5 w-5" /> Chapter mastered ♛
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onComplete}
            disabled={completing}
            aria-label={`Mark chapter revised and earn ${REWARDS.CHAPTER_COMPLETE} Kingdom Coins`}
            className="glow-btn h-12 w-full rounded-full text-[15px] font-semibold"
          >
            {completing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Claiming territory…
              </>
            ) : (
              <>
                <Coins className="h-5 w-5" /> Mark chapter revised · +{REWARDS.CHAPTER_COMPLETE} coins
              </>
            )}
          </Button>
        )}
      </div>

      {cached && (
        <p className="text-center text-[11px] text-muted-foreground/60">✧ Summoned from the royal archive — instantly, forever.</p>
      )}
    </div>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function LearnHub() {
  const user = useKingdom((s) => s.user);
  const syllabi = useKingdom((s) => s.syllabi);
  const setSyllabi = useKingdom((s) => s.setSyllabi);
  const addCoins = useKingdom((s) => s.addCoins);
  const setView = useKingdom((s) => s.setView);
  const setTutorContext = useKingdom((s) => s.setTutorContext);

  const bootRef = useRef<string | null>(null);
  const progressFetchedRef = useRef(false);
  const moduleSeqRef = useRef(0);

  // Syllabus working state (seeded from the store on mount, then filled per subject).
  const [syllabusMap, setSyllabusMap] = useState<Record<string, Syllabus>>(() => {
    const seed: Record<string, Syllabus> = {};
    for (const s of syllabi ?? []) seed[s.subject] = s;
    return seed;
  });
  const [subjectStatus, setSubjectStatus] = useState<Record<string, SubjectStatus>>(() => {
    const seeded = new Set((syllabi ?? []).map((s) => s.subject));
    const st: Record<string, SubjectStatus> = {};
    for (const s of user?.subjects ?? []) st[s] = seeded.has(s) ? "ready" : "loading";
    return st;
  });
  const [subjectErrors, setSubjectErrors] = useState<Record<string, string>>({});

  // Chapter progress (completed chapters), fetched from the profile.
  const [completedMap, setCompletedMap] = useState<Record<string, ChapterProgressDTO>>({});

  // Navigation levels.
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [openChapter, setOpenChapter] = useState<OpenChapter | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});

  // Chapter module state.
  const [moduleCache, setModuleCache] = useState<Record<string, { module: ChapterModule; cached: boolean }>>({});
  const [moduleState, setModuleState] = useState<ModuleState>("idle");
  const [moduleData, setModuleData] = useState<ChapterModule | null>(null);
  const [moduleCached, setModuleCached] = useState(false);
  const [moduleSlow, setModuleSlow] = useState(false);
  const [moduleErrorMsg, setModuleErrorMsg] = useState("");
  const [moduleLineIdx, setModuleLineIdx] = useState(0);
  const [completing, setCompleting] = useState(false);

  // Summoning theatrics.
  const [statusIdx, setStatusIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const subjects = user?.subjects ?? [];
  const anyLoading = useMemo(
    () => Object.values(subjectStatus).some((v) => v === "loading"),
    [subjectStatus],
  );

  // ── Data loading ──

  async function loadSubjects(list: string[], celebrate = false) {
    if (list.length === 0) return;
    const failures: { subject: string; message: string }[] = [];
    const successes: Syllabus[] = [];
    const jobs = list.map((subject) =>
      kingdomApi.syllabus
        .getSubject(subject)
        .then((res) => {
          successes.push(res.syllabus);
          setSyllabusMap((prev) => ({ ...prev, [subject]: res.syllabus }));
          setSubjectStatus((prev) => ({ ...prev, [subject]: "ready" }));
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "The scribes could not be reached.";
          failures.push({ subject, message });
          setSubjectErrors((prev) => ({ ...prev, [subject]: message }));
          setSubjectStatus((prev) => ({ ...prev, [subject]: "error" }));
        }),
    );
    await Promise.allSettled(jobs);
    // Sync the store so the syllabus survives view switches (and future mounts).
    const bySubject: Record<string, Syllabus> = {};
    for (const s of useKingdom.getState().syllabi ?? []) bySubject[s.subject] = s;
    for (const s of successes) bySubject[s.subject] = s;
    setSyllabi(Object.values(bySubject));
    if (failures.length === 1) {
      toast.error(`✧ ${failures[0].subject} failed to summon — tap Retry`);
    } else if (failures.length > 1) {
      toast.error(`✧ ${failures.length} subjects failed to summon — tap Retry on their cards`);
    } else if (celebrate) {
      toast.success(`✦ The Grand Library stands — ${list.length} subject scroll${list.length > 1 ? "s" : ""} bound & cached forever`);
    }
  }

  function retrySubject(subject: string) {
    setSubjectStatus((prev) => ({ ...prev, [subject]: "loading" }));
    setElapsed(0);
    setStatusIdx(0);
    void loadSubjects([subject]);
  }

  async function loadModule(subject: string, chapterTitle: string) {
    const key = chapterKey(subject, chapterTitle);
    const hit = moduleCache[key];
    if (hit) {
      setModuleData(hit.module);
      setModuleCached(hit.cached);
      setModuleState("ready");
      return;
    }
    const seq = ++moduleSeqRef.current;
    setModuleState("loading");
    setModuleData(null);
    setModuleCached(false);
    setModuleSlow(false);
    setModuleErrorMsg("");
    const slowTimer = window.setTimeout(() => {
      if (moduleSeqRef.current === seq) setModuleSlow(true);
    }, 1100);
    try {
      const res = await kingdomApi.chapter.module(subject, chapterTitle);
      window.clearTimeout(slowTimer);
      if (moduleSeqRef.current !== seq) return;
      setModuleCache((prev) => ({ ...prev, [key]: { module: res.module, cached: res.cached } }));
      setModuleData(res.module);
      setModuleCached(res.cached);
      setModuleState("ready");
    } catch (err) {
      window.clearTimeout(slowTimer);
      if (moduleSeqRef.current !== seq) return;
      const message = err instanceof Error ? err.message : "The tome could not be summoned.";
      setModuleErrorMsg(message);
      setModuleState("error");
      toast.error(message);
    }
  }

  // ── Effects (no synchronous setState — all updates flow through async callbacks) ──

  // Bootstrap: load any subject not yet in the store, all in parallel.
  useEffect(() => {
    if (!user || bootRef.current === user.id) return;
    bootRef.current = user.id;
    const seeded = new Set((syllabi ?? []).map((s) => s.subject));
    const pending = user.subjects.filter((s) => !seeded.has(s));
    if (pending.length > 0) void loadSubjects(pending, true);
  }, [user, syllabi]);

  // Chapter progress map.
  useEffect(() => {
    if (!user || progressFetchedRef.current) return;
    progressFetchedRef.current = true;
    kingdomApi
      .profile.get()
      .then((res) => {
        const map: Record<string, ChapterProgressDTO> = {};
        for (const p of res.progress) {
          if (p.status === "completed") map[chapterKey(p.subject, p.chapterTitle)] = p;
        }
        setCompletedMap(map);
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Could not fetch your conquest scroll.");
      });
  }, [user]);

  // Elapsed-seconds counter while any syllabus is loading.
  useEffect(() => {
    if (!anyLoading) return;
    const t = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(t);
  }, [anyLoading]);

  // Rotating status lines while any syllabus is loading.
  useEffect(() => {
    if (!anyLoading) return;
    const t = window.setInterval(() => setStatusIdx((i) => i + 1), 4000);
    return () => window.clearInterval(t);
  }, [anyLoading]);

  // Rotating status lines while the Master Scholar composes a module.
  useEffect(() => {
    if (moduleState !== "loading") return;
    const t = window.setInterval(() => setModuleLineIdx((i) => i + 1), 4000);
    return () => window.clearInterval(t);
  }, [moduleState]);

  // ── Derived values ──

  const boardName = user?.board?.trim() || "your board";
  const gradeShort = user?.grade != null ? `Grade ${user.grade}` : "your grade";
  const gradeFull = user?.grade != null ? gradeLabel(user.grade) : "A scholar of the realm";

  const pendingSubjects = subjects.filter((s) => subjectStatus[s] === "loading");
  const forgedCount = subjects.filter((s) => subjectStatus[s] === "ready").length;
  const readySyllabi = subjects.flatMap((s) => (syllabusMap[s] ? [syllabusMap[s]] : []));
  const allChaptersCount = readySyllabi.reduce((a, s) => a + s.chapters.length, 0);
  const allHours = readySyllabi.reduce((a, s) => a + syllabusHours(s), 0);

  const summonLines = [
    "Summoning the Royal Scribes…",
    `Consulting the ${boardName} archives for ${gradeShort}…`,
    pendingSubjects[0] ? `Structuring chapters of ${pendingSubjects[0]}…` : "Binding the syllabus scrolls…",
    "Charting roads through every chapter…",
    "Almost forged…",
  ];
  const summonLine = summonLines[statusIdx % summonLines.length] ?? summonLines[0] ?? "";

  const selectedSyllabus = selectedSubject ? syllabusMap[selectedSubject] : undefined;
  const level: ScreenLevel = openChapter ? "chapter" : selectedSubject && selectedSyllabus ? "chapters" : "subjects";
  const selectedCompleted = useMemo(
    () =>
      selectedSyllabus
        ? selectedSyllabus.chapters.filter((c) => completedMap[chapterKey(selectedSyllabus.subject, c.title)]?.status === "completed").length
        : 0,
    [selectedSyllabus, completedMap],
  );

  const openKey = openChapter ? chapterKey(openChapter.subject, openChapter.chapter.title) : "";
  const openCompleted = completedMap[openKey]?.status === "completed";
  const SelectedSubjectIcon: LucideIcon = selectedSyllabus
    ? SUBJECT_ICONS[selectedSyllabus.subject] ?? BookOpen
    : BookOpen;

  const moduleLines = openChapter
    ? [
        "The Master Scholar is composing your module…",
        `Weaving “${openChapter.chapter.title}” into golden sections…`,
        "Distilling deep dives, formulas & exam intel…",
        "Binding the arcane tome — almost there…",
      ]
    : ["The Master Scholar is composing your module…"];
  const moduleLine = moduleLines[moduleLineIdx % moduleLines.length] ?? "";

  // ── Handlers ──

  function openSubject(subject: string) {
    setSelectedSubject(subject);
    setOpenChapter(null);
    setExpandedChapters({});
  }

  function openChapterFn(subject: string, chapter: Chapter, index: number) {
    setOpenChapter({ subject, chapter, index });
    setModuleLineIdx(0);
    void loadModule(subject, chapter.title);
  }

  function retryModule() {
    if (!openChapter) return;
    setModuleLineIdx(0);
    void loadModule(openChapter.subject, openChapter.chapter.title);
  }

  function askSage() {
    if (!openChapter) return;
    setTutorContext({ subject: openChapter.subject, chapter: openChapter.chapter.title });
    setView("tutor");
  }

  async function completeChapter() {
    if (!openChapter || completing || openCompleted) return;
    const { subject, chapter } = openChapter;
    setCompleting(true);
    try {
      const res = await kingdomApi.chapter.complete(subject, chapter.title);
      if (res.alreadyCompleted) {
        toast.info("♛ This chapter is already mastered — the crown remembers. No double reward.");
      } else {
        addCoins(res.coinsEarned);
        toast.success(`✦ +${res.coinsEarned} Kingdom Coins — territory expanded!`);
      }
      setCompletedMap((prev) => ({
        ...prev,
        [chapterKey(subject, chapter.title)]: {
          subject,
          chapterTitle: chapter.title,
          status: "completed",
          coinsEarned: res.coinsEarned,
          completedAt: new Date().toISOString(),
        },
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The scribes could not record your conquest.");
    } finally {
      setCompleting(false);
    }
  }

  if (!user) return null;

  // ── Render ──

  return (
    <div className="relative flex flex-col gap-4">
      <MagicDust count={9} />

      {/* Screen header */}
      <header className="relative">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
          Your Syllabus · {boardName}
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold text-foreground sm:text-[28px]">
          The <span className="lavender-text">Grand Library</span>
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {gradeFull} — every chapter mastered plants{" "}
          <span className="gold-text font-semibold">+{REWARDS.CHAPTER_COMPLETE} m²</span> of new territory in your realm.
        </p>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={level}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
        >
          {/* ── Level 1 · all subjects ── */}
          {level === "subjects" &&
            (subjects.length === 0 ? (
              <EmptyLibrary
                onConsult={() => {
                  setTutorContext(null);
                  setView("tutor");
                }}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {anyLoading && <SummoningCard line={summonLine} elapsed={elapsed} forged={forgedCount} total={subjects.length} />}
                {!anyLoading && readySyllabi.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Chip icon={Library} label={`${readySyllabi.length} subjects`} />
                    <Chip icon={BookOpen} label={`${allChaptersCount} chapters`} />
                    <Chip icon={Clock} label={fmtHours(allHours)} />
                  </motion.div>
                )}
                {subjects.map((subject, i) => {
                  const status = subjectStatus[subject] ?? "loading";
                  if (status === "loading") return <SubjectSkeletonCard key={subject} subject={subject} />;
                  if (status === "error") {
                    return (
                      <SubjectErrorCard
                        key={subject}
                        subject={subject}
                        message={subjectErrors[subject] ?? "The scribes could not be reached."}
                        onRetry={() => retrySubject(subject)}
                      />
                    );
                  }
                  const syll = syllabusMap[subject];
                  if (!syll) return <SubjectSkeletonCard key={subject} subject={subject} />;
                  const done = syll.chapters.filter(
                    (c) => completedMap[chapterKey(syll.subject, c.title)]?.status === "completed",
                  ).length;
                  return (
                    <SubjectCard
                      key={subject}
                      syllabus={syll}
                      board={boardName}
                      grade={gradeShort}
                      completedCount={done}
                      index={i}
                      onOpen={() => openSubject(subject)}
                    />
                  );
                })}
              </div>
            ))}

          {/* ── Level 2 · chapter list of the selected subject ── */}
          {level === "chapters" && selectedSyllabus && (
            <div className="flex flex-col gap-4">
              <div className="sticky top-14 z-10 -mx-4 flex items-center justify-between gap-2 bg-background px-4 py-2.5 shadow-[0_14px_22px_-18px_rgba(74,53,85,0.5)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedSubject(null);
                    setExpandedChapters({});
                  }}
                  className="ghost-btn h-10 rounded-full px-4 text-sm"
                  aria-label="Back to all subjects"
                >
                  <ArrowLeft className="h-4 w-4" /> All subjects
                </Button>
                <span className="truncate text-[11px] text-muted-foreground">{selectedSyllabus.subject}</span>
              </div>

              <div className="flex items-start gap-3.5">
                <span className="clay-well flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
                  <SelectedSubjectIcon className="h-6 w-6 text-lavender" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display truncate text-xl font-bold text-foreground">{selectedSyllabus.subject}</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                    syllabus for {boardName} · {gradeShort}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Chip icon={BookOpen} label={`${selectedSyllabus.chapters.length} chapters`} />
                    <Chip icon={Clock} label={fmtHours(syllabusHours(selectedSyllabus))} />
                  </div>
                </div>
              </div>

              {selectedCompleted > 0 && (
                <div className="clay p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      <Trophy className="h-3.5 w-3.5 text-[#a86a12]" /> Conquest of {selectedSyllabus.subject}
                    </p>
                    <p className="text-[11px] font-bold tabular-nums">
                      <span className="gold-text">{selectedCompleted}</span>
                      <span className="text-muted-foreground">/{selectedSyllabus.chapters.length} chapters</span>
                    </p>
                  </div>
                  <Progress
                    value={(selectedCompleted / Math.max(selectedSyllabus.chapters.length, 1)) * 100}
                    className="mt-2.5 [&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-indicator]]:bg-[#e9a63b] [&_[data-slot=progress-indicator]]:shadow-[inset_0_1px_1px_#ffffff8c]"
                    style={{ background: "#f0e7d3", boxShadow: "var(--clay-press)" }}
                  />
                </div>
              )}

              <div
                className="kingdom-scroll -mr-1 flex max-h-[62vh] flex-col gap-2.5 overflow-y-auto pr-1"
                role="list"
                aria-label={`${selectedSyllabus.subject} chapters`}
              >
                {selectedSyllabus.chapters.map((chapter, i) => (
                  <ChapterRow
                    key={`${chapter.id}-${chapter.title}`}
                    chapter={chapter}
                    index={i}
                    completed={completedMap[chapterKey(selectedSyllabus.subject, chapter.title)]?.status === "completed"}
                    expanded={!!expandedChapters[chapter.title]}
                    onToggleTopics={() => setExpandedChapters((prev) => ({ ...prev, [chapter.title]: !prev[chapter.title] }))}
                    onOpen={() => openChapterFn(selectedSyllabus.subject, chapter, i)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Level 3 · the AI learning module ── */}
          {level === "chapter" && openChapter && (
            <div className="flex flex-col gap-4">
              <div className="sticky top-14 z-10 -mx-4 flex items-center justify-between gap-2 bg-background px-4 py-2.5 shadow-[0_14px_22px_-18px_rgba(74,53,85,0.5)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpenChapter(null)}
                  className="ghost-btn h-10 rounded-full px-4 text-sm"
                  aria-label={`Back to ${openChapter.subject} chapters`}
                >
                  <ArrowLeft className="h-4 w-4" /> Chapters
                </Button>
                <span className="truncate text-[11px] text-muted-foreground">{openChapter.chapter.title}</span>
              </div>

              <div>
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
                  {openChapter.subject} · Chapter {pad2(openChapter.index + 1)}
                </p>
                <h2 className="font-display mt-1 text-xl font-bold leading-snug text-foreground sm:text-2xl">
                  {openChapter.chapter.title}
                </h2>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Chip icon={Clock} label={fmtHours(openChapter.chapter.estimatedHours)} />
                  <Chip icon={BookOpen} label={`${openChapter.chapter.topics.length} topics`} />
                  {moduleState === "ready" && (
                    <span className="clay-chip inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-lavender">
                      {moduleCached ? "✧ from the royal archive" : "✦ freshly composed"}
                    </span>
                  )}
                  {openCompleted && <Chip icon={Trophy} label="mastered ♛" tone="gold" />}
                </div>
              </div>

              {moduleState === "loading" && <ModuleLoader line={moduleLine} slow={moduleSlow} />}

              {moduleState === "error" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="clay flex flex-col items-center gap-3 p-6 text-center"
                  role="alert"
                >
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                  <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                    {moduleErrorMsg || "The tome could not be summoned."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={retryModule}
                    className="ghost-btn h-10 rounded-full px-5"
                    aria-label="Retry summoning the chapter module"
                  >
                    <RefreshCw className="h-4 w-4" /> Retry summoning
                  </Button>
                </motion.div>
              )}

              {moduleState === "ready" && moduleData && (
                <ChapterModuleView
                  key={openKey}
                  module={moduleData}
                  cached={moduleCached}
                  completed={openCompleted}
                  completing={completing}
                  onComplete={() => void completeChapter()}
                  onAskSage={askSage}
                />
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
