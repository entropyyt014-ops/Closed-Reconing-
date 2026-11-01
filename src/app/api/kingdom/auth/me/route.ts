import { db } from "@/lib/db";
import { getUserFromRequest, toKingdomUser, unauthorized } from "@/lib/kingdom/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Get the signed-in scholar. */
export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  return Response.json({ user: toKingdomUser(user) });
}

/** Update editable profile / kingdom fields. */
export async function PATCH(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim().length >= 2) data.name = body.name.trim();
    if (typeof body.kingdomName === "string" && body.kingdomName.trim().length >= 2) {
      data.kingdomName = body.kingdomName.trim().slice(0, 40);
    }
    if (typeof body.avatarSeed === "string") data.avatarSeed = body.avatarSeed.slice(0, 20);
    if (typeof body.country === "string") data.country = body.country;
    if (typeof body.board === "string") data.board = body.board;
    if (typeof body.grade === "number" && body.grade >= 6 && body.grade <= 12) data.grade = Math.round(body.grade);

    const updated = await db.user.update({ where: { id: user.id }, data });
    return Response.json({ user: toKingdomUser(updated) });
  } catch (err) {
    console.error("profile patch error", err);
    return Response.json({ error: "Could not update profile." }, { status: 500 });
  }
}

/** Sign out — destroys the session. */
export async function DELETE(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token) {
    await db.session.delete({ where: { id: token } }).catch(() => {});
  }
  return Response.json({ signedOut: true });
}
