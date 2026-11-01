import { db } from "@/lib/db";
import { awardCoins, getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import { REWARDS } from "@/lib/kingdom/constants";

/** Mark a chapter revision complete → earn Kingdom Coins (once per chapter). */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const subject = String(body.subject ?? "").trim();
    const chapterTitle = String(body.chapter ?? "").trim();
    if (!subject || !chapterTitle) {
      return Response.json({ error: "Subject and chapter are required." }, { status: 400 });
    }

    const existing = await db.chapterProgress.findUnique({
      where: { userId_subject_chapterTitle: { userId: user.id, subject, chapterTitle } },
    });

    if (existing?.status === "completed") {
      return Response.json({ alreadyCompleted: true, coinsEarned: existing.coinsEarned, coins: user.coins });
    }

    if (existing) {
      await db.chapterProgress.update({
        where: { id: existing.id },
        data: { status: "completed", completedAt: new Date(), coinsEarned: REWARDS.CHAPTER_COMPLETE },
      });
    } else {
      await db.chapterProgress.create({
        data: {
          userId: user.id,
          subject,
          chapterTitle,
          status: "completed",
          completedAt: new Date(),
          coinsEarned: REWARDS.CHAPTER_COMPLETE,
        },
      });
    }

    const coins = await awardCoins(user.id, REWARDS.CHAPTER_COMPLETE, `Chapter mastered — ${chapterTitle}`);
    return Response.json({ alreadyCompleted: false, coinsEarned: REWARDS.CHAPTER_COMPLETE, coins });
  } catch (err) {
    console.error("chapter complete error", err);
    return Response.json({ error: "Could not record completion." }, { status: 500 });
  }
}
