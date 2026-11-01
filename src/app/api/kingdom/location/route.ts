import { db } from "@/lib/db";
import { getUserFromRequest, toKingdomUser, unauthorized } from "@/lib/kingdom/auth";

/** Update the scholar's live GPS territory center. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const locationName = typeof body.locationName === "string" ? body.locationName.slice(0, 80) : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return Response.json({ error: "Invalid coordinates." }, { status: 400 });
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: { lat, lng, locationName },
    });
    return Response.json({ user: toKingdomUser(updated) });
  } catch (err) {
    console.error("location update error", err);
    return Response.json({ error: "Could not update location." }, { status: 500 });
  }
}
