import { getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import { aiVision } from "@/lib/kingdom/zai";
import type { AIMessage } from "@/lib/kingdom/zai";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST { imageDataUrl, question?, messages? }
 * Student snapped a photo of a homework problem during the live tutor call —
 * Professor Sage analyses it and explains it live.
 */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const imageDataUrl = String(body.imageDataUrl ?? "");
    if (!imageDataUrl.startsWith("data:image/")) {
      return Response.json({ error: "Please send a valid photo." }, { status: 400 });
    }
    if (imageDataUrl.length > 8_000_000) {
      return Response.json({ error: "Photo too large — try a smaller one." }, { status: 413 });
    }

    const question =
      typeof body.question === "string" && body.question.trim()
        ? body.question.trim().slice(0, 500)
        : "Please explain this homework problem to me step by step.";

    const context: AIMessage[] = Array.isArray(body.messages)
      ? body.messages.slice(-6).map((m: { role?: string; content?: string }) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content ?? "").slice(0, 1000),
        }))
      : [];

    const prompt = `You are Professor Sage, the live AI tutor inside "Scholar's Kingdom", currently on a voice call with ${user.name}, a Grade ${user.grade ?? "?"} (${user.board ?? "international"} curriculum) student.
The student just shared this photo and asks: "${question}"
Analyse exactly what is in the photo (read the problem text carefully, including any figures, diagrams, equations or answer spaces).
Then respond as a spoken tutor reply: warm, concise (3-8 sentences), step-by-step, pitched at the student's grade. If the photo is unclear, say what you can see and ask one clarifying question. If it contains multiple problems, pick the first and offer to continue.`;

    const analysis = await aiVision(imageDataUrl, prompt, context);
    return Response.json({ reply: analysis });
  } catch (err) {
    console.error("tutor vision error", err);
    return Response.json({ error: "Professor Sage could not see the photo clearly... try again." }, { status: 500 });
  }
}
