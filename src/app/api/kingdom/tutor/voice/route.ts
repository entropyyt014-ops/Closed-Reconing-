import { getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import { getZAI } from "@/lib/kingdom/zai";

export const runtime = "nodejs";
export const maxDuration = 60;

const TTS_VOICE = process.env.KINGDOM_TTS_VOICE || "jam"; // British gentleman — Professor Sage
const MAX_CHARS = 1000; // TTS API limit is 1024

/** POST { text } → audio/wav spoken by Professor Sage. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const text = String(body.text ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_CHARS);

    if (!text) {
      return Response.json({ error: "Nothing to speak." }, { status: 400 });
    }

    const zai = await getZAI();
    const response = await zai.audio.tts.create({
      input: text,
      voice: TTS_VOICE,
      speed: 1.0,
      response_format: "wav",
      stream: false,
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("tutor voice error", err);
    return Response.json({ error: "Voice synthesis failed." }, { status: 500 });
  }
}
