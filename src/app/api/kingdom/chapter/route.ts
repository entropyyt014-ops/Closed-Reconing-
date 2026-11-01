import { db } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import { aiJSON } from "@/lib/kingdom/zai";
import type { ChapterModule } from "@/lib/kingdom/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODULE_SYSTEM = `You are the Master Scholar of "Scholar's Kingdom", an AI learning engine for Grades 6–12 (ages 11–18) across all world curricula (CBSE, ICSE, IB, IGCSE, GCSE, Common Core, AP, ACARA, national curricula...).
Create a chapter learning module that is accurate, exam-focused and pitched EXACTLY at the student's grade level — never above it.
STRICT: reply with ONLY valid JSON, no prose, no markdown fences.
JSON shape:
{
 "summary": "a smart 2-3 paragraph summary a student can revise in 5 minutes",
 "deepDive": [{"topic":"...","explanation":"a thorough, vivid, step-by-step concept explanation (150-260 words) with at least one worked example or real-life connection"}],
 "formulas": [{"name":"...","expression":"...","note":"when to use it / common trap"}],
 "revisionPoints": ["short crisp recall points"],
 "pyqInsight": "2-4 sentences on how board exams actually test this chapter (question styles, competency focus, common case-study angles)"
}
Provide 3-5 deepDive sections, 4-8 formulas (empty array only if the subject truly has none), and 6-10 revisionPoints. Write formulas as plain text (e.g. "a² + b² = c²").`;

/** POST — AI-generated chapter learning module (cached per board/grade/subject/chapter). */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!user.onboarded) {
    return Response.json({ error: "Complete onboarding first." }, { status: 400 });
  }
  try {
    const body = await req.json();
    const subject = String(body.subject ?? "").trim();
    const chapter = String(body.chapter ?? "").trim();
    if (!subject || !chapter) {
      return Response.json({ error: "Subject and chapter are required." }, { status: 400 });
    }

    const key = [user.country ?? "Global", user.board ?? "National Curriculum", user.grade ?? 8, subject, chapter].join("|");

    const cached = await db.chapterContent.findUnique({ where: { cacheKey: key } });
    if (cached) {
      try {
        return Response.json({ module: JSON.parse(cached.data), cached: true });
      } catch {
        // regenerate below
      }
    }

    const prompt = `Student: country=${user.country}, board=${user.board}, grade=${user.grade}.
Subject: ${subject}. Chapter: "${chapter}".
Generate the full learning module for this exact chapter as per the board's prescribed scope for grade ${user.grade}.`;

    const data = await aiJSON<ChapterModule>(MODULE_SYSTEM, prompt);

    const module_: ChapterModule = {
      summary: String(data.summary ?? "").slice(0, 3000),
      deepDive: Array.isArray(data.deepDive)
        ? data.deepDive
            .filter((d) => d && d.topic && d.explanation)
            .map((d) => ({ topic: String(d.topic).slice(0, 150), explanation: String(d.explanation).slice(0, 4000) }))
            .slice(0, 6)
        : [],
      formulas: Array.isArray(data.formulas)
        ? data.formulas
            .filter((f) => f && f.name)
            .map((f) => ({
              name: String(f.name).slice(0, 120),
              expression: String(f.expression ?? "").slice(0, 200),
              note: String(f.note ?? "").slice(0, 300),
            }))
            .slice(0, 10)
        : [],
      revisionPoints: Array.isArray(data.revisionPoints)
        ? data.revisionPoints.map((r) => String(r).slice(0, 200)).slice(0, 12)
        : [],
      pyqInsight: String(data.pyqInsight ?? "").slice(0, 900),
    };

    const payload = JSON.stringify(module_);
    await db.chapterContent.upsert({
      where: { cacheKey: key },
      create: { cacheKey: key, data: payload },
      update: { data: payload },
    });

    return Response.json({ module: module_, cached: false });
  } catch (err) {
    console.error("chapter module error", err);
    return Response.json({ error: "The Master Scholar is drafting... please try again." }, { status: 500 });
  }
}
