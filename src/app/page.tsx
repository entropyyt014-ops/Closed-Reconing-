"use client";

// The entire kingdom lives at `/` — a stage machine:
// splash (auth) → onboarding → app shell (Learn / Tutor / Tests / Notes / Map / Profile)

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, BookOpen, PhoneCall, ScrollText, NotebookPen, Globe2, User } from "lucide-react";
import { useKingdom, type KingdomView } from "@/lib/kingdom/store";
import { SplashScreen } from "@/components/kingdom/SplashScreen";
import { OnboardingWizard } from "@/components/kingdom/OnboardingWizard";
import { LearnHub } from "@/components/kingdom/LearnHub";
import { TutorCall } from "@/components/kingdom/TutorCall";
import { TestCenter } from "@/components/kingdom/TestCenter";
import { NotesWorkspace } from "@/components/kingdom/NotesWorkspace";
import { WorldMap } from "@/components/kingdom/WorldMap";
import { ProfileScreen } from "@/components/kingdom/ProfileScreen";
import { CoinBadge } from "@/components/kingdom/MagicDust";
import { formatTerritory } from "@/lib/kingdom/constants";

const NAV: { view: KingdomView; label: string; icon: typeof BookOpen }[] = [
  { view: "learn", label: "Learn", icon: BookOpen },
  { view: "tutor", label: "Tutor", icon: PhoneCall },
  { view: "tests", label: "Tests", icon: ScrollText },
  { view: "notes", label: "Notes", icon: NotebookPen },
  { view: "map", label: "Map", icon: Globe2 },
];

export default function Page() {
  const { hydrate, authChecked, user, view, setView } = useKingdom();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!authChecked) {
    return (
      <div className="kingdom-bg flex min-h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="clay-well flex h-16 w-16 items-center justify-center rounded-2xl">
            <Crown className="h-8 w-8 animate-pulse text-gold" strokeWidth={1.6} />
          </div>
          <p className="font-display text-sm font-semibold tracking-wide text-muted-foreground">
            SCHOLAR&apos;S KINGDOM
          </p>
        </div>
      </div>
    );
  }

  if (!user) return <SplashScreen />;
  if (!user.onboarded) return <OnboardingWizard />;

  return (
    <div className="kingdom-bg flex min-h-dvh flex-col">
      {/* Header — a molded clay bar resting on the table */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-sm shadow-[0_14px_28px_-20px_rgba(74,53,85,0.5)]">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between px-4">
          <button
            onClick={() => setView("learn")}
            className="clay-chip flex items-center gap-2 px-4 py-2"
            aria-label="Home"
          >
            <Crown className="h-5 w-5 text-gold" strokeWidth={2} />
            <span className="font-display text-[15px] font-bold text-foreground">
              {user.kingdomName.split("·")[0].trim().split(" ").slice(0, 2).join(" ")}
            </span>
          </button>
          <div className="flex items-center gap-2.5">
            <CoinBadge coins={user.coins} />
            <span className="hidden text-[12px] font-semibold text-muted-foreground sm:block">
              {formatTerritory(user.coins)}
            </span>
            <button
              onClick={() => setView("profile")}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ${
                view === "profile"
                  ? "bg-primary text-primary-foreground shadow-[var(--clay-btn)]"
                  : "clay-btn-soft"
              }`}
              aria-label="Profile"
            >
              <User className="h-4.5 w-4.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      </header>

      {/* Main stage */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-32 pt-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 18, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
          >
            {view === "learn" && <LearnHub />}
            {view === "tutor" && <TutorCall />}
            {view === "tests" && <TestCenter />}
            {view === "notes" && <NotesWorkspace />}
            {view === "map" && <WorldMap />}
            {view === "profile" && <ProfileScreen />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* The clay dock — a molded tray rising from the table */}
      <footer className="fixed inset-x-0 bottom-0 z-40 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
        <nav
          aria-label="Primary"
          className="mx-auto mb-2 flex w-full max-w-md items-stretch justify-between gap-1 rounded-[2rem] px-2.5 py-2"
          style={{
            background: "linear-gradient(180deg, #fffdf6 0%, #f8f0de 100%)",
            boxShadow:
              "inset 0 2px 2px rgba(255,255,255,0.95), inset 0 -7px 12px -6px rgba(74,53,85,0.18), 0 -6px 30px -10px rgba(74,53,85,0.3), 0 18px 34px -14px rgba(74,53,85,0.34), 0 5px 12px -5px rgba(74,53,85,0.18)",
          }}
        >
          {NAV.map(({ view: v, label, icon: Icon }) => {
            const active = view === v;
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                className="relative flex min-w-[56px] flex-1 flex-col items-center gap-0.5 rounded-3xl px-1 pb-1.5 pt-2"
                aria-current={active ? "page" : undefined}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-x-1 inset-y-0 rounded-3xl bg-primary/14"
                    style={{
                      boxShadow:
                        "inset 0 2px 2px rgba(255,255,255,0.9), inset 0 -4px 8px -5px rgba(74,53,85,0.16), 0 6px 14px -6px rgba(110,59,176,0.4)",
                    }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <Icon
                  className={`relative h-5 w-5 transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                  strokeWidth={active ? 2.3 : 1.8}
                />
                <span
                  className={`relative text-[10.5px] font-bold tracking-wide transition-colors ${
                    active ? "text-primary" : "text-muted-foreground/75"
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      </footer>
    </div>
  );
}
