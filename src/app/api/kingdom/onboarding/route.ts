import { db } from "@/lib/db";
import { awardCoins, getUserFromRequest, toKingdomUser, unauthorized } from "@/lib/kingdom/auth";
import { REWARDS } from "@/lib/kingdom/constants";

/** Complete student profile & curriculum onboarding. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const kingdomName = String(body.kingdomName ?? "").trim();
    const country = String(body.country ?? "").trim();
    const board = String(body.board ?? "").trim();
    const grade = Number(body.grade);
    const subjects = Array.isArray(body.subjects)
      ? body.subjects.map((s: unknown) => String(s)).filter(Boolean).slice(0, 10)
      : [];

    if (name.length < 2) return Response.json({ error: "Please enter your name." }, { status: 400 });
    if (kingdomName.length < 3) return Response.json({ error: "Give your kingdom a name (3+ characters)." }, { status: 400 });
    if (!country) return Response.json({ error: "Select your country / region." }, { status: 400 });
    if (!Number.isInteger(grade) || grade < 6 || grade > 12) {
      return Response.json({ error: "Grades 6–12 only — this kingdom is for middle & high school scholars." }, { status: 400 });
    }
    if (!board) return Response.json({ error: "Select your educational board / curriculum." }, { status: 400 });
    if (subjects.length === 0) return Response.json({ error: "Pick at least one subject." }, { status: 400 });

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        name,
        kingdomName: kingdomName.slice(0, 40),
        country,
        board,
        grade,
        subjects: JSON.stringify(subjects),
        onboarded: true,
      },
    });

    // One-time founding bonus
    let founded = false;
    const already = await db.coinTransaction.findFirst({
      where: { userId: user.id, reason: "Founding bonus" },
    });
    if (!already) {
      await awardCoins(user.id, REWARDS.SIGNUP, "Founding bonus");
      founded = true;
    }

    const fresh = await db.user.findUnique({ where: { id: user.id } });
    return Response.json({ user: toKingdomUser(fresh ?? updated), founded, bonus: founded ? REWARDS.SIGNUP : 0 });
  } catch (err) {
    console.error("onboarding error", err);
    return Response.json({ error: "Onboarding failed. Try again." }, { status: 500 });
  }
}
