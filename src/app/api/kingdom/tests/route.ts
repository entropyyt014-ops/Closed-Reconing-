import { db } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the student's test history. */
export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  const attempts = await db.testAttempt.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return Response.json({
    attempts: attempts.map((a) => ({
      id: a.id,
      subject: a.subject,
      chapter: a.chapter,
      paper: (() => {
        try {
          return JSON.parse(a.paperJson);
        } catch {
          return null;
        }
      })(),
      result: (() => {
        try {
          return a.resultJson ? JSON.parse(a.resultJson) : null;
        } catch {
          return null;
        }
      })(),
      status: a.status,
      coinsEarned: a.coinsEarned,
      createdAt: a.createdAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
    })),
  });
}
