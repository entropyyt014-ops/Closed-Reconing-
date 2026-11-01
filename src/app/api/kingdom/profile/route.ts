import { db } from "@/lib/db";
import { getUserFromRequest, toKingdomUser, unauthorized } from "@/lib/kingdom/auth";
import { territoryRadiusM } from "@/lib/kingdom/constants";
import type { ChapterProgressDTO, CoinLedgerEntry } from "@/lib/kingdom/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Royal profile — kingdom stats, coin ledger, learning record. */
export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const [ledger, progress, tests, notes, kingdoms] = await Promise.all([
    db.coinTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.chapterProgress.findMany({ where: { userId: user.id } }),
    db.testAttempt.findMany({
      where: { userId: user.id, status: "submitted" },
      select: { id: true, resultJson: true, coinsEarned: true, subject: true, chapter: true, submittedAt: true },
    }),
    db.note.count({ where: { userId: user.id } }),
    db.user.count({ where: { lat: { not: null }, coins: { gt: user.coins } } }),
  ]);

  const progressDTO: ChapterProgressDTO[] = progress.map((p) => ({
    subject: p.subject,
    chapterTitle: p.chapterTitle,
    status: p.status as ChapterProgressDTO["status"],
    coinsEarned: p.coinsEarned,
    completedAt: p.completedAt?.toISOString() ?? null,
  }));

  const ledgerDTO: CoinLedgerEntry[] = ledger.map((l) => ({
    id: l.id,
    amount: l.amount,
    reason: l.reason,
    createdAt: l.createdAt.toISOString(),
  }));

  const chaptersCompleted = progress.filter((p) => p.status === "completed").length;
  const testsPassed = tests.filter((t) => {
    try {
      const r = JSON.parse(t.resultJson ?? "{}");
      return r.passed === true;
    } catch {
      return false;
    }
  }).length;

  return Response.json({
    user: toKingdomUser(user),
    stats: {
      territoryM2: user.coins, // 1 coin = 1 m²
      territoryRadiusM: territoryRadiusM(user.coins),
      worldRank: kingdoms + 1,
      chaptersCompleted,
      testsPassed,
      testsTaken: tests.length,
      notesCreated: notes,
    },
    progress: progressDTO,
    ledger: ledgerDTO,
  });
}
