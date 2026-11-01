import { db } from "@/lib/db";
import { createSession, toKingdomUser } from "@/lib/kingdom/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const phone = String(body.phone ?? "").replace(/[^\d]/g, "");
    const code = String(body.code ?? "").replace(/[^\d]/g, "");
    const name = String(body.name ?? "").trim();

    if (phone.length < 8 || code.length !== 6) {
      return Response.json({ error: "Enter the 6-digit code sent to your phone." }, { status: 400 });
    }

    const record = await db.otpCode.findFirst({
      where: { phone: `+${phone}`, code, used: false },
      orderBy: { createdAt: "desc" },
    });

    if (!record || record.expiresAt < new Date()) {
      return Response.json({ error: "Invalid or expired OTP. Request a new code." }, { status: 400 });
    }

    await db.otpCode.update({ where: { id: record.id }, data: { used: true } });

    const fullPhone = `+${phone}`;
    let user = await db.user.findUnique({ where: { phone: fullPhone } });
    let isNew = false;
    if (!user) {
      const kingdoms = [
        "Dawnspire", "Emberhold", "Mistfall", "Starhaven", "Grimward",
        "Lumen Court", "Ashen Vale", "Skyreach", "Verdant Throne", "Nightsong",
      ];
      const displayName = name.length >= 2 ? name : `Scholar ${fullPhone.slice(-4)}`;
      user = await db.user.create({
        data: {
          phone: fullPhone,
          name: displayName,
          kingdomName: `${kingdoms[Math.floor(Math.random() * kingdoms.length)]} of ${displayName.split(" ")[0]}`,
          avatarSeed: fullPhone.slice(-6),
        },
      });
      isNew = true;
    }

    const token = await createSession(user.id);
    return Response.json({ token, user: toKingdomUser(user), isNew });
  } catch (err) {
    console.error("otp verify error", err);
    return Response.json({ error: "Verification failed. Try again." }, { status: 500 });
  }
}
