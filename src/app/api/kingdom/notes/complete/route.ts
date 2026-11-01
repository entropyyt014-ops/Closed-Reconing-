import { db } from "@/lib/db";
import { awardCoins, getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import { REWARDS } from "@/lib/kingdom/constants";

/** POST { noteId } — finish an interactive note module → earn Kingdom Coins (once per note). */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const noteId = String(body.noteId ?? "");
    const note = await db.note.findFirst({ where: { id: noteId, userId: user.id } });
    if (!note) return Response.json({ error: "Note not found." }, { status: 404 });

    if (note.coinsEarned > 0) {
      return Response.json({ alreadyCompleted: true, coinsEarned: note.coinsEarned, coins: user.coins });
    }

    await db.note.update({ where: { id: note.id }, data: { coinsEarned: REWARDS.NOTE_MODULE_COMPLETE } });
    const coins = await awardCoins(user.id, REWARDS.NOTE_MODULE_COMPLETE, `Interactive notes mastered — ${note.title}`);
    return Response.json({ alreadyCompleted: false, coinsEarned: REWARDS.NOTE_MODULE_COMPLETE, coins });
  } catch (err) {
    console.error("notes complete error", err);
    return Response.json({ error: "Could not record completion." }, { status: 500 });
  }
}
