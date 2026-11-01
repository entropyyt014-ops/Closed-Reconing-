"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Loader2, Check, Sparkles, Globe2, GraduationCap, Landmark, BookOpen, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { kingdomApi } from "@/lib/kingdom/client";
import { useKingdom } from "@/lib/kingdom/store";
import { COUNTRY_BOARDS, GRADES, SUBJECTS, gradeLabel } from "@/lib/kingdom/constants";
import { MagicDust } from "./MagicDust";

const KINGDOM_PREFIX = ["Dawnspire", "Emberhold", "Mistfall", "Starhaven", "Grimward", "Lumen Court", "Ashen Vale", "Skyreach", "Verdant Throne", "Nightsong", "Frostspire", "Suncrest"];
const KINGDOM_SUFFIX = ["of the Aurora", "of Eternal Dawn", "of the Silver Moon", "of Nine Winds", "of the Old Code", "of Emberlight", "of the North Star", "of Thornfield"];

function summonKingdomName(studentName: string): string {
  const prefix = KINGDOM_PREFIX[Math.floor(Math.random() * KINGDOM_PREFIX.length)];
  const suffix = KINGDOM_SUFFIX[Math.floor(Math.random() * KINGDOM_SUFFIX.length)];
  const base = studentName.trim().split(/\s+/)[0] || "Scholar";
  return `${prefix} ${suffix} · ${base}`;
}

const STEP_ICONS = [Crown, Globe2, GraduationCap, Landmark, BookOpen, Sparkles];
const STEP_TITLES = ["Name your ruler", "Choose your realm", "Pick your level", "Swear to a board", "Enlist subjects", "Found the kingdom"];

export function OnboardingWizard() {
  const user = useKingdom((s) => s.user);
  const setUser = useKingdom((s) => s.setUser);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [founded, setFounded] = useState(false);

  const [name, setName] = useState(user?.name && user.name.startsWith("Scholar") ? "" : user?.name ?? "");
  const [kingdomName, setKingdomName] = useState("");
  const [country, setCountry] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const [board, setBoard] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);

  const boards = COUNTRY_BOARDS.find((c) => c.country === country)?.boards ?? [];
  const canNext =
    step === 0 ? name.trim().length >= 2 && kingdomName.trim().length >= 3 :
    step === 1 ? !!country :
    step === 2 ? grade !== null :
    step === 3 ? !!board :
    step === 4 ? subjects.length > 0 :
    true;

  function toggleSubject(s: string) {
    setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : prev.length >= 10 ? prev : [...prev, s]));
  }

  async function foundKingdom() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await kingdomApi.onboarding({
        name: name.trim(),
        kingdomName: kingdomName.trim(),
        country,
        grade: grade as number,
        board,
        subjects,
      });
      setUser(res.user);
      setFounded(true);
      toast.success(`✦ ${res.bonus > 0 ? `Founding bonus: +${res.bonus} Kingdom Coins!` : "Your kingdom stands!"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Founding failed — try again");
    } finally {
      setBusy(false);
    }
  }

  if (founded) {
    return (
      <div className="kingdom-bg relative flex min-h-dvh flex-col items-center justify-center px-8 text-center">
        <MagicDust count={22} />
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 15 }}>
          <div
            className="relative mx-auto flex h-28 w-28 items-center justify-center rounded-full p-2"
            style={{ background: "#eda93f", boxShadow: "var(--clay-gold)" }}
          >
            <div className="clay-well flex h-full w-full items-center justify-center" style={{ borderRadius: "999px" }}>
              <Crown className="gold-text h-12 w-12" strokeWidth={1.4} />
            </div>
          </div>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="font-display mt-8 text-3xl font-bold text-foreground">
          The Kingdom of <span className="lavender-text">{kingdomName}</span> rises!
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-3 max-w-xs text-sm text-muted-foreground">
          <span className="gold-text font-bold">50 Kingdom Coins</span> granted — that&apos;s{" "}
          <span className="text-lavender">50 m² of territory</span> to plant your banner. Your AI syllabus is being summoned.
        </motion.p>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-lavender" />
          Entering the realm…
        </motion.div>
      </div>
    );
  }

  const Icon = STEP_ICONS[step];

  return (
    <div className="kingdom-bg relative flex min-h-dvh flex-col px-6 py-8">
      <MagicDust count={10} />

      {/* progress */}
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5">
          {STEP_TITLES.map((_, i) => (
            <div
              key={i}
              className={`h-3 w-3 rounded-full transition-all duration-500 ${i === step ? "scale-125" : ""}`}
              style={
                i < step
                  ? { background: "#eda93f", boxShadow: "var(--clay-gold)" }
                  : i === step
                    ? { background: "#8e4fd0", boxShadow: "var(--clay-btn)" }
                    : { background: "#f0e7d3", boxShadow: "var(--clay-press)" }
              }
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 18, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.99 }}
            transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
            className="mt-8"
          >
            <div className="flex items-center gap-3">
              <div className="clay-well flex h-11 w-11 items-center justify-center">
                <Icon className="h-5 w-5 text-lavender" />
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">Step {step + 1} of 6</p>
                <h2 className="font-display text-xl font-bold text-foreground">{STEP_TITLES[step]}</h2>
              </div>
            </div>

            <div className="clay mt-6 min-h-[300px] p-6 sm:p-7">
              {step === 0 && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Your name (the ruler)</label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Aarav Mehta"
                      className="h-12 rounded-2xl border-0 bg-input px-4 text-base shadow-none focus-visible:[outline:2px_solid_rgba(142,79,208,0.55)]"
                      style={{ boxShadow: "var(--clay-press)" }}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Your Kingdom&apos;s name</label>
                    <div className="flex gap-2">
                      <Input
                        value={kingdomName}
                        onChange={(e) => setKingdomName(e.target.value)}
                        placeholder="e.g. Dawnspire of the Aurora"
                        className="h-12 rounded-2xl border-0 bg-input px-4 text-base shadow-none focus-visible:[outline:2px_solid_rgba(142,79,208,0.55)]"
                        style={{ boxShadow: "var(--clay-press)" }}
                      />
                      <Button
                        variant="outline"
                        onClick={() => setKingdomName(summonKingdomName(name))}
                        className="ghost-btn h-12 shrink-0 rounded-2xl border-0 px-3.5"
                        title="Summon a name"
                      >
                        <Sparkles className="h-4.5 w-4.5" />
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground/70">
                      This is what other scholars will see on the world map.
                    </p>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="grid max-h-[330px] grid-cols-2 gap-3 overflow-y-auto pr-1 kingdom-scroll sm:grid-cols-3">
                  {COUNTRY_BOARDS.map((c) => (
                    <button
                      key={c.country}
                      onClick={() => {
                        setCountry(c.country);
                        if (board && !c.boards.includes(board)) setBoard("");
                      }}
                      className={`clay clay-hover flex items-center gap-2.5 p-3 text-left text-sm ${
                        country === c.country ? "outline outline-2 outline-primary/70" : ""
                      }`}
                      style={country === c.country ? { background: "rgba(142, 79, 208, 0.12)" } : undefined}
                    >
                      <span className="text-xl">{c.flag}</span>
                      <span className="font-medium leading-tight text-foreground">{c.country}</span>
                    </button>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div>
                  <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                    Strictly Grades 6–12 (ages 11–18). The AI keeps every lesson at your level — no college content, ever.
                  </p>
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                    {GRADES.map((g) => (
                      <button
                        key={g}
                        onClick={() => setGrade(g)}
                        className="clay-chip flex flex-col items-center gap-1 px-2 py-3.5"
                        style={grade === g ? { background: "#8e4fd0", color: "#fff9f0", boxShadow: "var(--clay-btn)" } : undefined}
                      >
                        <span className="font-display text-xl font-bold">{g}</span>
                        <span
                          className={`text-[9px] uppercase tracking-wider ${grade === g ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                        >
                          {g <= 8 ? "Middle" : "High"}
                        </span>
                      </button>
                    ))}
                  </div>
                  {grade !== null && (
                    <p className="mt-3 text-center text-xs text-lavender">{gradeLabel(grade)}</p>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="flex flex-col gap-2.5">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Every major world curriculum is supported. The syllabus engine will follow your board&apos;s real chapter structure.
                  </p>
                  {!country ? (
                    <p className="text-sm text-muted-foreground">Pick a country first.</p>
                  ) : (
                    boards.map((b) => (
                      <button
                        key={b}
                        onClick={() => setBoard(b)}
                        className={`clay clay-hover flex items-center justify-between px-4 py-3.5 text-left text-sm font-medium ${
                          board === b ? "outline outline-2 outline-primary/70" : ""
                        }`}
                        style={board === b ? { background: "rgba(142, 79, 208, 0.12)" } : undefined}
                      >
                        {b}
                        {board === b && <Check className="h-4 w-4 text-lavender" />}
                      </button>
                    ))
                  )}
                </div>
              )}

              {step === 4 && (
                <div>
                  <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                    Choose the subjects you&apos;re enrolled in (up to 10). The Royal Scribes will draft each syllabus with AI.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SUBJECTS.map((s) => {
                      const active = subjects.includes(s);
                      return (
                        <button
                          key={s}
                          onClick={() => toggleSubject(s)}
                          className="clay-chip px-3.5 py-2 text-[13px] font-medium hover:text-foreground"
                          style={active ? { background: "#f0e7d3", color: "#7a3fbf", boxShadow: "var(--clay-press)" } : undefined}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">{subjects.length} selected</p>
                </div>
              )}

              {step === 5 && (
                <div className="flex flex-col items-center py-6 text-center">
                  <Image
                    src="/kingdom/portal-hero-clay.png"
                    alt="A glowing crystal portal"
                    width={220}
                    height={293}
                    className="animate-float select-none"
                  />
                  <h3 className="font-display mt-4 text-lg font-bold text-foreground">Ready to found your kingdom?</h3>
                  <div className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                    <p>👑 {name || "Scholar"} of <span className="text-lavender">{kingdomName || "…"}</span></p>
                    <p>🌍 {country || "…"} · {board || "…"}</p>
                    <p>🎓 {grade ? gradeLabel(grade) : "…"}</p>
                    <p>📚 {subjects.join(" · ") || "…"}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* nav */}
        <div className="mt-6 flex gap-3">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="ghost-btn h-12 flex-1 rounded-full border-0">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          )}
          {step < 5 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
              className="glow-btn h-12 flex-[2] rounded-full text-[15px] font-semibold"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={foundKingdom} disabled={busy} className="glow-btn h-12 flex-[2] rounded-full text-[15px] font-semibold">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Found my Kingdom <Sparkles className="h-4 w-4" /></>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
