"use client";

import { useEffect, useState } from "react";
import { Globe2, TrendingUp, Loader2, LogOut, Coins, Map, ScrollText, NotebookPen, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { kingdomApi, type KingdomStats } from "@/lib/kingdom/client";
import { useKingdom } from "@/lib/kingdom/store";
import { formatTerritory, territoryRadiusM, gradeLabel } from "@/lib/kingdom/constants";
import type { ChapterProgressDTO, CoinLedgerEntry } from "@/lib/kingdom/types";
import { MagicDust } from "./MagicDust";

export function ProfileScreen() {
  const user = useKingdom((s) => s.user);
  const logout = useKingdom((s) => s.logout);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<KingdomStats | null>(null);
  const [ledger, setLedger] = useState<CoinLedgerEntry[]>([]);
  const [progress, setProgress] = useState<ChapterProgressDTO[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await kingdomApi.profile.get();
        if (!alive) return;
        setStats(res.stats);
        setLedger(res.ledger);
        setProgress(res.progress);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not load the royal records");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!user) return null;

  const completedChapters = progress.filter((p) => p.status === "completed");

  return (
    <div className="relative flex flex-col gap-5 pb-4">
      <MagicDust count={8} />

      {/* Kingdom card */}
      <section className="clay relative overflow-hidden p-6 text-center">
        <div className="clay mx-auto flex h-20 w-20 items-center justify-center" style={{ borderRadius: "9999px" }}>
          <span className="font-display text-3xl font-bold text-lavender">
            {(user.name.trim().charAt(0) || "S").toUpperCase()}
          </span>
        </div>
        <h1 className="font-display mt-4 text-2xl font-bold text-foreground">{user.kingdomName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.name} · {user.grade ? gradeLabel(user.grade) : "Scholar"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">
          {user.country ?? "🌍 Global"} · {user.board ?? "International"} {user.email ? `· ${user.email}` : user.phone ? `· ${user.phone}` : ""}
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="clay p-3">
            <Coins className="mx-auto h-4 w-4 text-[#a86a12]" />
            <p className="gold-text mt-1 text-lg font-bold tabular-nums">{user.coins.toLocaleString()}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Coins</p>
          </div>
          <div className="clay p-3">
            <Map className="mx-auto h-4 w-4 text-lavender" />
            <p className="mt-1 text-base font-bold text-foreground">{formatTerritory(user.coins)}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Territory</p>
          </div>
          <div
            className="clay p-3"
            style={{ background: "linear-gradient(180deg,#fff3d9,#faeccf)", boxShadow: "var(--clay-raise)" }}
          >
            <Globe2 className="mx-auto h-4 w-4 text-primary" />
            <p className="mt-1 text-lg font-bold text-foreground tabular-nums">
              {loading ? "…" : stats ? `#${stats.worldRank}` : "—"}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">World Rank</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground/70">
          1 Kingdom Coin = 1 m² of land · your realm spans a radius of{" "}
          {stats ? `${stats.territoryRadiusM.toFixed(1)} m` : `${territoryRadiusM(user.coins).toFixed(1)} m`} around your banner
        </p>
      </section>

      {/* Learning record */}
      <section className="clay p-5">
        <h2 className="font-display text-base font-bold text-foreground">Royal Chronicle</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-lavender" />
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="clay-inset p-3">
                <BookOpen className="mx-auto h-4 w-4 text-lavender" />
                <p className="mt-1 text-lg font-bold text-foreground">{stats?.chaptersCompleted ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Chapters done</p>
              </div>
              <div className="clay-inset p-3">
                <ScrollText className="mx-auto h-4 w-4 text-lavender" />
                <p className="mt-1 text-lg font-bold text-foreground">
                  {stats?.testsPassed ?? 0}/{stats?.testsTaken ?? 0}
                </p>
                <p className="text-[10px] text-muted-foreground">Tests passed</p>
              </div>
              <div className="clay-inset p-3">
                <NotebookPen className="mx-auto h-4 w-4 text-lavender" />
                <p className="mt-1 text-lg font-bold text-foreground">{stats?.notesCreated ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Notes</p>
              </div>
            </div>

            {completedChapters.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-lavender" /> Conquered chapters
                </p>
                <div className="kingdom-scroll flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1">
                  {completedChapters.slice(0, 20).map((p, i) => (
                    <div
                      key={`${p.subject}-${p.chapterTitle}`}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs ${i % 2 === 0 ? "bg-muted/40" : "bg-secondary/70"}`}
                    >
                      <span className="truncate text-foreground/90">
                        <span className="text-lavender">{p.subject}</span> · {p.chapterTitle}
                      </span>
                      <span className="gold-text ml-2 shrink-0 font-bold">+{p.coinsEarned}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Coin ledger */}
      <section className="clay p-5">
        <h2 className="font-display text-base font-bold text-foreground">Coin Ledger</h2>
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-lavender" />
          </div>
        ) : ledger.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No earnings yet — complete a chapter or mock test to fill your treasury.</p>
        ) : (
          <div className="kingdom-scroll mt-3 flex max-h-52 flex-col gap-1.5 overflow-y-auto pr-1">
            {ledger.map((l, i) => (
              <div
                key={l.id}
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${i % 2 === 0 ? "bg-muted/40" : "bg-secondary/70"}`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="clay-well flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                    <Coins className="h-3.5 w-3.5 text-[#a86a12]" />
                  </span>
                  <span className="truncate text-xs text-foreground/90">{l.reason}</span>
                </span>
                <span className={`shrink-0 text-xs font-bold ${l.amount > 0 ? "gold-text" : "text-destructive"}`}>
                  {l.amount > 0 ? "+" : ""}
                  {l.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Subjects */}
      <section className="clay p-5">
        <h2 className="font-display text-base font-bold text-foreground">Enrolled Subjects</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {user.subjects.map((s) => (
            <span key={s} className="clay-chip px-3 py-1.5 text-xs font-medium text-lavender">
              {s}
            </span>
          ))}
        </div>
      </section>

      <Button
        variant="outline"
        onClick={() => {
          logout();
          toast("The gates close behind you… until next time");
        }}
        className="ghost-btn mx-auto w-full max-w-xs rounded-full"
      >
        <LogOut className="h-4 w-4" /> Leave the Kingdom
      </Button>
    </div>
  );
}
