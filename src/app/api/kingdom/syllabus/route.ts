import { db } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import { aiJSON } from "@/lib/kingdom/zai";
import type { Syllabus } from "@/lib/kingdom/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYLLABUS_SYSTEM = `You are the Royal Syllabus Architect of "Scholar's Kingdom", a learning app used by middle school and high school students (Grades 6–12, ages 11–18) in every country of the world.
You know the authentic, current curriculum structures of every major educational board: CBSE, ICSE, IB MYP, IB Diploma, Cambridge IGCSE, UK GCSE/A-Levels, US Common Core/AP, Australian Curriculum, MOE Singapore, and all national curricula.
STRICT RULES:
- Content must match the EXACT grade level requested (Grade 6–12). Never drift into university-level topics.
- Use the real chapter names and topic lists that the specified board actually prescribes for that grade.
- Reply with ONLY valid JSON, no prose, no markdown fences.
Output JSON shape:
{"subject":"<subject>","chapters":[{"id":1,"title":"<chapter title>","topics":["<topic 1>","<topic 2>","<topic 3>","<topic 4>"],"estimatedHours":6}]}
Generate between 8 and 14 chapters, each with 3–6 topics.`;

function syllabusKey(country: string, board: string, grade: number, subject: string) {
  return [country, board, grade, subject].join("|");
}

async function generateSyllabus(
  country: string, board: string, grade: number, subject: string
): Promise<Syllabus> {
  const key = syllabusKey(country, board, grade, subject);

  const cached = await db.syllabusCache.findUnique({ where: { cacheKey: key } });
  if (cached) {
    try {
      return JSON.parse(cached.data) as Syllabus;
    } catch {
      // fall through to regeneration
    }
  }

  const prompt = `Student profile: country = ${country}; educational board = ${board}; grade = ${grade}; subject = ${subject}.
Generate the complete subject syllabus structure (chapters + topics) exactly as prescribed by this board for this grade. If the board is unknown to you, use the most appropriate equivalent national curriculum for ${country} at grade ${grade} and note it implicitly through realistic chapter names.`;

  const data = await aiJSON<Syllabus>(SYLLABUS_SYSTEM, prompt);

  // sanitise
  const chapters = Array.isArray(data.chapters)
    ? data.chapters
        .filter((c) => c && typeof c.title === "string")
        .map((c, i) => ({
          id: i + 1,
          title: String(c.title).slice(0, 120),
          topics: Array.isArray(c.topics) ? c.topics.map((t) => String(t).slice(0, 120)).slice(0, 8) : [],
          estimatedHours: Number.isFinite(Number(c.estimatedHours)) ? Number(c.estimatedHours) : 5,
        }))
        .slice(0, 16)
    : [];

  const syllabus: Syllabus = { subject, chapters };
  const payload = JSON.stringify(syllabus);

  await db.syllabusCache.upsert({
    where: { cacheKey: key },
    create: { cacheKey: key, data: payload },
    update: { data: payload },
  });

  return syllabus;
}

/** GET — the signed-in student's full multi-subject syllabus (cached).
 * Pass ?subject=Name to load a single subject (allows parallel per-subject loading). */
export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!user.onboarded) {
    return Response.json({ error: "Complete onboarding first." }, { status: 400 });
  }

  const url = new URL(req.url);
  const single = url.searchParams.get("subject");

  if (single) {
    const syllabus = await generateSyllabus(
      user.country ?? "Global", user.board ?? "National Curriculum", user.grade ?? 8, single
    );
    return Response.json({ syllabus });
  }

  const subjects: string[] = JSON.parse(user.subjects || "[]");
  const results: Syllabus[] = [];
  for (const subject of subjects) {
    results.push(await generateSyllabus(user.country ?? "Global", user.board ?? "National Curriculum", user.grade ?? 8, subject));
  }
  return Response.json({ syllabi: results });
}

/** POST — (re)generate the syllabus for a fresh subject list. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const subjects: string[] = Array.isArray(body.subjects)
      ? body.subjects.map((s: unknown) => String(s)).filter(Boolean).slice(0, 10)
      : JSON.parse(user.subjects || "[]");

    if (subjects.length === 0) {
      return Response.json({ error: "No subjects selected." }, { status: 400 });
    }

    const results: Syllabus[] = [];
    for (const subject of subjects) {
      results.push(await generateSyllabus(user.country ?? "Global", user.board ?? "National Curriculum", user.grade ?? 8, subject));
    }
    return Response.json({ syllabi: results });
  } catch (err) {
    console.error("syllabus generate error", err);
    return Response.json({ error: "The Royal Scribes could not draft your syllabus. Please retry." }, { status: 500 });
  }
}
