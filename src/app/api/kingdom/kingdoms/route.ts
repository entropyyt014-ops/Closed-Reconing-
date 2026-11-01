import { db } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import { territoryRadiusM } from "@/lib/kingdom/constants";
import type { KingdomMarker } from "@/lib/kingdom/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * World Map feed — every logged-in student's kingdom territory.
 * 1 Kingdom Coin = 1 m² of land claimed around their live GPS position.
 */
export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const users = await db.user.findMany({
    where: { lat: { not: null }, lng: { not: null } },
    select: {
      id: true, name: true, kingdomName: true, coins: true, lat: true, lng: true,
      country: true, grade: true, board: true, isDemo: true, updatedAt: true,
    },
    orderBy: { coins: "desc" },
  });

  const markers: KingdomMarker[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    kingdomName: u.kingdomName,
    coins: u.coins,
    lat: u.lat as number,
    lng: u.lng as number,
    country: u.country,
    grade: u.grade,
    board: u.board,
    isMe: u.id === user.id,
    isDemo: u.isDemo,
    territoryRadiusM: territoryRadiusM(u.coins),
  }));

  const rank = markers.findIndex((m) => m.isMe) + 1;

  return Response.json({
    markers,
    totalKingdoms: markers.length,
    myRank: rank > 0 ? rank : null,
    syncedAt: new Date().toISOString(),
  });
}
