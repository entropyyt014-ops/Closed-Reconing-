import { db } from "@/lib/db";

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/**
 * Send a phone OTP. In production this hands the code to an SMS gateway
 * (e.g. Twilio / MSG91); in this sandbox the code is returned to the client
 * and surfaced as a "demo" toast so the flow stays fully testable.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const phone = normalizePhone(String(body.phone ?? ""));
    if (!phone) {
      return Response.json({ error: "Enter a valid phone number with country code." }, { status: 400 });
    }

    // Invalidate previous unused codes for this number
    await db.otpCode.updateMany({
      where: { phone, used: false },
      data: { used: true },
    });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await db.otpCode.create({
      data: {
        phone,
        code,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return Response.json({
      sent: true,
      phone,
      // Sandbox stand-in for the SMS gateway payload:
      devCode: code,
      expiresInSec: 600,
    });
  } catch (err) {
    console.error("otp send error", err);
    return Response.json({ error: "Could not send OTP. Try again." }, { status: 500 });
  }
}
