import { db } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import { aiChat } from "@/lib/kingdom/zai";
import type { AIMessage } from "@/lib/kingdom/zai";

export const runtime = "nodejs";
export const maxDuration = 120;

function tutorSystemPrompt(user: {
  name: string; grade: number | null; board: string | null; country: string | null;
  kingdomName: string; subject?: string; chapter?: string;
}): string {
  return `You are Professor Sage — the wise, warm live AI tutor of "Scholar's Kingdom", speaking to ${user.name}, ruler of ${user.kingdomName}.
Student profile: Grade ${user.grade ?? "6-12"} (${user.grade && user.grade <= 8 ? "middle school, ages 11-14" : "high school, ages 14-18"}), ${user.board ?? "international"} curriculum, ${user.country ?? "global"}.
${user.subject ? `Current subject focus: ${user.subject}${user.chapter ? ` — chapter "${user.chapter}"` : ""}.` : ""}

YOUR STYLE (this is a live VOICE call, like a phone conversation):
- Speak warmly and encouragingly, like a brilliant friendly teacher on a call. Address the student by name occasionally.
- Keep answers SHORT and SPOKEN-NATURAL: 2-6 sentences per reply (under ~90 words) unless the student explicitly asks for a long explanation.
- Teach step-by-step. Use simple language, vivid analogies and quick examples suitable for the student's grade.
- If the student seems stuck, guide with a hint first rather than dumping the full answer. Be a little Socratic.
- If asked something above high-school level, gently redirect to grade-appropriate understanding.
- Celebrate effort ("Well thought, ruler of ${user.kingdomName}!") but stay natural, not cheesy.
- If the student uploads a photo of a homework problem, analyse what you see and walk them through it.
- Never mention you are an AI language model; you are Professor Sage of the Kingdom.`;
}

/** POST { messages: [{role, content}], subject?, chapter? } → tutor reply. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const rawMessages = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
    const subject = typeof body.subject === "string" ? body.subject : undefined;
    const chapter = typeof body.chapter === "string" ? body.chapter : undefined;

    const messages: AIMessage[] = [
      { role: "system", content: tutorSystemPrompt({ ...user, subject, chapter }) },
      ...rawMessages
        .filter((m: { role?: string; content?: string }) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
        .map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 4000) })),
    ];

    if (messages.length === 1) {
      return Response.json({ reply: "" });
    }

    const reply = await aiChat(messages);
    return Response.json({ reply });
  } catch (err) {
    console.error("tutor chat error", err);
    return Response.json({ error: "Professor Sage lost the connection... please try again." }, { status: 500 });
  }
}
