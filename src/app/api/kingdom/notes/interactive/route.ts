import { db } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import { aiJSON } from "@/lib/kingdom/zai";
import type { InteractiveBlocks } from "@/lib/kingdom/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const BLOCKS_SYSTEM = `You are the Interactive Alchemist of "Scholar's Kingdom". You convert a student's own study notes into interactive learning blocks embedded inside their note.
STRICT RULES:
- Derive content ONLY from the student's notes (you may sharpen wording, never invent new syllabus topics).
- Reply with ONLY valid JSON, no prose, no markdown fences.
JSON shape:
{
 "flashcards":[{"front":"question/prompt","back":"answer"}],
 "tapReveal":[{"term":"key term","definition":"tap-to-reveal definition"}],
 "quiz":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"why this is right"}],
 "flow":{"title":"Concept flow","nodes":["Step 1 — ...","Step 2 — ...","Step 3 — ..."]}
}
Provide 4-6 flashcards, 4-6 tapReveal terms, 3-5 quiz questions (each with exactly 4 options), and a flow of 3-6 nodes (or null if the topic has no natural sequence).`;

/** POST { noteId, text, subject, chapter } → generate & save interactive blocks for a note. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const noteId = typeof body.noteId === "string" ? body.noteId : null;
    const text = String(body.text ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const chapter = String(body.chapter ?? "").trim();

    if (text.length < 40) {
      return Response.json({ error: "Write some notes first — the Alchemist needs material to transmute." }, { status: 400 });
    }

    const data = await aiJSON<InteractiveBlocks>(
      BLOCKS_SYSTEM,
      `Student: grade ${user.grade ?? "?"}, board ${user.board ?? "international"}.\nSubject: ${subject || "general"}\nChapter: ${chapter || "general"}\n\nSTUDENT NOTES:\n${text.slice(0, 12000)}`
    );

    const blocks: InteractiveBlocks = {
      flashcards: Array.isArray(data.flashcards)
        ? data.flashcards
            .filter((f) => f && f.front && f.back)
            .map((f) => ({ front: String(f.front).slice(0, 240), back: String(f.back).slice(0, 600) }))
            .slice(0, 8)
        : [],
      tapReveal: Array.isArray(data.tapReveal)
        ? data.tapReveal
            .filter((t) => t && t.term && t.definition)
            .map((t) => ({ term: String(t.term).slice(0, 120), definition: String(t.definition).slice(0, 500) }))
            .slice(0, 8)
        : [],
      quiz: Array.isArray(data.quiz)
        ? data.quiz
            .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
            .map((q) => ({
              question: String(q.question).slice(0, 300),
              options: q.options.map((o: unknown) => String(o).slice(0, 160)).slice(0, 4),
              correctIndex: Math.max(0, Math.min(q.options.length - 1, Number(q.correctIndex) || 0)),
              explanation: String(q.explanation ?? "").slice(0, 400),
            }))
            .slice(0, 6)
        : [],
      flow: data.flow && Array.isArray(data.flow.nodes) && data.flow.nodes.length >= 2
        ? { title: String(data.flow.title ?? "Concept flow").slice(0, 100), nodes: data.flow.nodes.map((n: unknown) => String(n).slice(0, 160)).slice(0, 7) }
        : null,
    };

    if (noteId) {
      const note = await db.note.findFirst({ where: { id: noteId, userId: user.id } });
      if (note) {
        await db.note.update({ where: { id: noteId }, data: { blocks: JSON.stringify(blocks) } });
      }
    }

    return Response.json({ blocks });
  } catch (err) {
    console.error("notes interactive error", err);
    return Response.json({ error: "Transmutation failed — the Alchemist will retry." }, { status: 500 });
  }
}
