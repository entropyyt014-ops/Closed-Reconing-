import { db } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import { aiJSON } from "@/lib/kingdom/zai";
import type { TestPaper } from "@/lib/kingdom/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const PAPER_SYSTEM = `You are the Examination Sage of "Scholar's Kingdom" — an elite board-exam paper setter who knows the authentic Previous Year Question (PYQ) patterns of every major curriculum: CBSE, ICSE, IB MYP/DP, Cambridge IGCSE, UK GCSE/A-Levels, US Common Core/AP, Australian ACARA, and all national curricula.
You set COMPETENCY-FOCUSED papers: analytical, application-based, case-study and assertion-reason style questions that real boards now use — NOT rote recall.
STRICT RULES:
- Pitch EXACTLY at the student's grade (6–12). No university-level content.
- Follow the authentic paper pattern of the student's board (sections, marks per question, style) as closely as practical.
- Every question must have a correctIndex for MCQs; for subjective types provide answerHint (model answer) and markingScheme (point-wise).
- Reply with ONLY valid JSON, no prose, no markdown fences.
JSON shape:
{
 "paperTitle": "...",
 "instructions": "...",
 "totalMarks": 30,
 "durationMins": 60,
 "pyqPattern": "1-2 sentences describing the authentic PYQ pattern replicated here",
 "sections": [
   {"name":"Section A","instructions":"...","questions":[
     {"id":1,"type":"mcq","text":"...","options":["...","...","...","..."],"correctIndex":0,"marks":1,"competency":"e.g. Application of concepts","answerHint":"why this option","markingScheme":"1 mark for correct option"},
     {"id":2,"type":"case","context":"a short real-life scenario / data passage...","text":"the question built on the context","options":[...],"correctIndex":1,"marks":3,"competency":"...","answerHint":"...","markingScheme":"..."},
     {"id":3,"type":"short","text":"...","marks":2,"competency":"...","answerHint":"model answer 40-80 words","markingScheme":"1 mark per point"},
     {"id":4,"type":"long","text":"...","marks":5,"competency":"...","answerHint":"model answer 120-200 words","markingScheme":"..."}
   ]}
 ]
}
Include 8–12 questions across 2–3 sections, mixing at least one case-based and one application/analytical question. totalMarks must equal the sum of all question marks.`;

/** POST { subject, chapter, difficulty } → generate a competency-focused PYQ-style paper. */
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
    const difficulty = ["standard", "challenge", "board-elite"].includes(body.difficulty) ? body.difficulty : "standard";
    if (!subject || !chapter) {
      return Response.json({ error: "Subject and chapter are required." }, { status: 400 });
    }

    const difficultyNote =
      difficulty === "challenge"
        ? "Lean toward higher-order thinking (analyse/evaluate) and multi-step questions."
        : difficulty === "board-elite"
          ? "Simulate the toughest board-paper level for this grade: full-length case studies, assertion-reason, and synthesis questions."
          : "Standard board-paper difficulty for this grade.";

    const prompt = `Student: country=${user.country}, board=${user.board}, grade=${user.grade}, subject=${subject}, chapter="${chapter}".
Difficulty: ${difficultyNote}
Identify the authentic PYQ pattern for ${user.board} grade ${user.grade} ${subject} (chapter: ${chapter}) and generate a complete competency-focused mock test paper replicating that pattern.`;

    const paper = await aiJSON<TestPaper>(PAPER_SYSTEM, prompt);

    // sanitise + normalise ids and marks
    const sections = Array.isArray(paper.sections) ? paper.sections : [];
    let qid = 1;
    let totalMarks = 0;
    for (const s of sections) {
      s.name = String(s.name ?? "Section").slice(0, 60);
      s.instructions = String(s.instructions ?? "").slice(0, 300);
      s.questions = Array.isArray(s.questions) ? s.questions : [];
      for (const q of s.questions) {
        q.id = qid++;
        q.type = ["mcq", "case", "short", "long"].includes(q.type) ? q.type : "short";
        q.text = String(q.text ?? "").slice(0, 1200);
        if (q.context) q.context = String(q.context).slice(0, 1500);
        q.marks = Math.max(1, Math.min(8, Number(q.marks) || 1));
        totalMarks += q.marks;
        if ((q.type === "mcq" || q.type === "case") && Array.isArray(q.options) && q.options.length >= 2) {
          q.options = q.options.map((o: unknown) => String(o).slice(0, 300)).slice(0, 5);
          if (!Number.isInteger(q.correctIndex) || (q.correctIndex ?? -1) < 0 || (q.correctIndex ?? 0) >= q.options.length) {
            q.correctIndex = 0;
          }
        } else {
          // Objective question without valid options → downgrade to subjective
          delete q.options;
          delete q.correctIndex;
          q.type = "short";
        }
      }
    }
    paper.paperTitle = String(paper.paperTitle ?? `${subject} — ${chapter}`).slice(0, 140);
    paper.instructions = String(paper.instructions ?? "Read all questions carefully.").slice(0, 600);
    paper.totalMarks = totalMarks || paper.totalMarks || 30;
    paper.durationMins = Math.max(20, Math.min(180, Number(paper.durationMins) || 60));
    paper.pyqPattern = String(paper.pyqPattern ?? "").slice(0, 500);

    const attempt = await db.testAttempt.create({
      data: {
        userId: user.id,
        subject,
        chapter,
        paperJson: JSON.stringify(paper),
        status: "draft",
      },
    });

    return Response.json({
      attempt: {
        id: attempt.id,
        subject: attempt.subject,
        chapter: attempt.chapter,
        paper,
        result: null,
        status: attempt.status,
        coinsEarned: attempt.coinsEarned,
        createdAt: attempt.createdAt.toISOString(),
        submittedAt: null,
      },
    });
  } catch (err) {
    console.error("test generate error", err);
    return Response.json({ error: "The Examination Sage could not draft the paper... please retry." }, { status: 500 });
  }
}
