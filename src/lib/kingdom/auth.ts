// ─── Scholar's Kingdom: session auth helpers ───────────────────────────────

import { db } from "@/lib/db";
import type { User } from "@prisma/client";
import type { KingdomUser } from "./types";

const SESSION_DAYS = 60;

export function toKingdomUser(user: User): KingdomUser {
  let subjects: string[] = [];
  try {
    subjects = JSON.parse(user.subjects ?? "[]");
  } catch {
    subjects = [];
  }
  return {
    id: user.id,
    name: user.name,
    kingdomName: user.kingdomName,
    email: user.email,
    phone: user.phone,
    country: user.country,
    grade: user.grade,
    board: user.board,
    subjects,
    coins: user.coins,
    lat: user.lat,
    lng: user.lng,
    locationName: user.locationName,
    onboarded: user.onboarded,
    avatarSeed: user.avatarSeed,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await db.session.create({
    data: { userId, expiresAt },
  });
  return session.id;
}

export async function getUserFromRequest(req: Request): Promise<User | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

export function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/** Award coins idempotently and log the ledger entry. */
export async function awardCoins(
  userId: string,
  amount: number,
  reason: string
): Promise<number> {
  const updated = await db.user.update({
    where: { id: userId },
    data: { coins: { increment: amount } },
  });
  await db.coinTransaction.create({
    data: { userId, amount, reason },
  });
  return updated.coins;
}
