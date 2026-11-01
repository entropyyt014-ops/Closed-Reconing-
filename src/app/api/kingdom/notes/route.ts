import { db } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import type { NoteDTO } from "@/lib/kingdom/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNoteDTO(n: {
  id: string; subject: string; chapter: string; title: string; content: string;
  blocks: string | null; coinsEarned: number; createdAt: Date; updatedAt: Date;
}): NoteDTO {
  return {
    id: n.id,
    subject: n.subject,
    chapter: n.chapter,
    title: n.title,
    content: n.content,
    blocks: (() => { try { return n.blocks ? JSON.parse(n.blocks) : null; } catch { return null; } })(),
    coinsEarned: n.coinsEarned,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

/** GET — all notes of the signed-in scholar. */
export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  const notes = await db.note.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });
  return Response.json({ notes: notes.map(toNoteDTO) });
}

/** POST — create a new note. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const subject = String(body.subject ?? "").trim().slice(0, 80);
    const chapter = String(body.chapter ?? "").trim().slice(0, 120);
    const title = String(body.title ?? "").trim().slice(0, 140);
    const content = typeof body.content === "string" ? body.content.slice(0, 60000) : "";

    if (!subject || !title) {
      return Response.json({ error: "Pick a subject and give the note a title." }, { status: 400 });
    }

    const note = await db.note.create({
      data: { userId: user.id, subject, chapter, title, content },
    });
    return Response.json({ note: toNoteDTO(note) });
  } catch (err) {
    console.error("note create error", err);
    return Response.json({ error: "Could not create the note." }, { status: 500 });
  }
}
