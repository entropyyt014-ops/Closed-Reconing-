import { db } from "@/lib/db";
import { createSession, toKingdomUser } from "@/lib/kingdom/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Google (Gmail) Sign-In.
 * In production this endpoint receives a Google ID token for verification;
 * in this sandbox build it accepts the Google account profile payload from
 * the account-chooser sheet and provisions the account server-side.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();

    if (!EMAIL_RE.test(email)) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (name.length < 2) {
      return Response.json({ error: "Please enter your name." }, { status: 400 });
    }

    let user = await db.user.findUnique({ where: { email } });
    let isNew = false;
    if (!user) {
      // choose a default kingdom name until onboarding
      const kingdoms = [
        "Dawnspire", "Emberhold", "Mistfall", "Starhaven", "Grimward",
        "Lumen Court", "Ashen Vale", "Skyreach", "Verdant Throne", "Nightsong",
      ];
      const kingdomName = `${kingdoms[Math.floor(Math.random() * kingdoms.length)]} of ${name.split(" ")[0]}`;
      user = await db.user.create({
        data: { email, name, kingdomName, avatarSeed: email.slice(0, 8) },
      });
      isNew = true;
    }

    const token = await createSession(user.id);
    return Response.json({ token, user: toKingdomUser(user), isNew });
  } catch (err) {
    console.error("google sign-in error", err);
    return Response.json({ error: "Sign-in failed. Please try again." }, { status: 500 });
  }
}
