import { db } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";

export const runtime = "nodejs";

function toNoteDTO(n: {
  id: string; subject: string; chapter: string; title: string; content: string;
  blocks: string | null; coinsEarned: number; createdAt: Date; updatedAt: Date;
}) {
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

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: RouteCtx) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const note = await db.note.findFirst({ where: { id, userId: user.id } });
  if (!note) return Response.json({ error: "Note not found." }, { status: 404 });
  return Response.json({ note: toNoteDTO(note) });
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const { id } = await ctx.params;
    const existing = await db.note.findFirst({ where: { id, userId: user.id } });
    if (!existing) return Response.json({ error: "Note not found." }, { status: 404 });

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 140);
    if (typeof body.content === "string") data.content = body.content.slice(0, 60000);
    if (typeof body.chapter === "string") data.chapter = body.chapter.trim().slice(0, 120);
    if (typeof body.subject === "string" && body.subject.trim()) data.subject = body.subject.trim().slice(0, 80);

    const note = await db.note.update({ where: { id }, data });
    return Response.json({ note: toNoteDTO(note) });
  } catch (err) {
    console.error("note patch error", err);
    return Response.json({ error: "Could not save the note." }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: RouteCtx) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const existing = await db.note.findFirst({ where: { id, userId: user.id } });
  if (!existing) return Response.json({ error: "Note not found." }, { status: 404 });
  await db.note.delete({ where: { id } });
  return Response.json({ deleted: true });
}
