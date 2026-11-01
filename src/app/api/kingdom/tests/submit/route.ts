import { db } from "@/lib/db";
import { awardCoins, getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import { REWARDS } from "@/lib/kingdom/constants";
import { aiJSON } from "@/lib/kingdom/zai";
import type { TestPaper, TestQuestion, TestResult, QuestionResult } from "@/lib/kingdom/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const PASS_PERCENT = 60;

const GRADER_SYSTEM = `You are the strict-but-fair Chief Examiner of "Scholar's Kingdom". You grade middle/high school (Grades 6–12) mock test answers.
Grade each subjective answer against its model answer and point-wise marking scheme. Award partial marks honestly. If a student left it blank, score 0 with kind feedback.
STRICT: reply with ONLY valid JSON, no prose, no markdown fences.
JSON shape:
{"results":[{"id":1,"scored":2,"feedback":"one or two sentences: what was right, what was missing"}]}
"scored" must be a number between 0 and the question's marks (decimals like 1.5 allowed only if the marks allow).`;

/** POST { attemptId, answers: { [questionId]: string | number } } → graded result + coins. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const attemptId = String(body.attemptId ?? "");
    const answers: Record<string, string | number> = body.answers && typeof body.answers === "object" ? body.answers : {};

    const attempt = await db.testAttempt.findFirst({ where: { id: attemptId, userId: user.id } });
    if (!attempt) return Response.json({ error: "Test not found." }, { status: 404 });
    if (attempt.status === "submitted") {
      return Response.json({ error: "This paper is already submitted and graded." }, { status: 400 });
    }

    const paper: TestPaper = JSON.parse(attempt.paperJson);
    const allQuestions: TestQuestion[] = paper.sections.flatMap((s) => s.questions);

    // ── Deterministic MCQ grading (objective truth from the paper) ─────────
    const perQuestion: QuestionResult[] = [];
    const subjective: { q: TestQuestion; answer: string }[] = [];
    let totalScored = 0;

    for (const q of allQuestions) {
      const raw = answers[String(q.id)];
      if (q.type === "mcq" || q.type === "case") {
        if (Array.isArray(q.options) && Number.isInteger(q.correctIndex)) {
          const chosen = Number(raw);
          const correct = chosen === q.correctIndex;
          const scored = correct ? q.marks : 0;
          totalScored += scored;
          perQuestion.push({
            id: q.id,
            scored,
            feedback: correct
              ? `Correct! ${q.answerHint ?? "Well reasoned."}`
              : `Not quite — the correct option is ${String.fromCharCode(65 + (q.correctIndex ?? 0))}. ${(q.answerHint ?? "").slice(0, 160)}`,
          });
        } else {
          perQuestion.push({ id: q.id, scored: 0, feedback: "Ungraded (malformed question)." });
        }
      } else {
        const answer = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
        subjective.push({ q, answer });
      }
    }

    // ── AI grading for subjective answers ──────────────────────────────────
    if (subjective.length > 0) {
      const gradingPayload = subjective.map(({ q, answer }) => ({
        id: q.id,
        type: q.type,
        marks: q.marks,
        question: q.text,
        modelAnswer: q.answerHint ?? "",
        markingScheme: q.markingScheme ?? "",
        studentAnswer: answer.slice(0, 3000),
      }));

      const graded = await aiJSON<{ results: { id: number; scored: number; feedback: string }[] }>(
        GRADER_SYSTEM,
        `Grade these answers:\n${JSON.stringify(gradingPayload)}`
      );

      const byId = new Map<number, { scored: number; feedback: string }>();
      for (const r of graded.results ?? []) {
        byId.set(Number(r.id), { scored: Number(r.scored) || 0, feedback: String(r.feedback ?? "").slice(0, 400) });
      }
      for (const { q, answer } of subjective) {
        const g = byId.get(q.id);
        const scored = Math.max(0, Math.min(q.marks, Number(g?.scored ?? 0)));
        const feedback =
          !answer
            ? "Left blank — revisit this concept and try writing at least the key points."
            : g?.feedback || "See the model answer in the answer key.";
        totalScored += scored;
        perQuestion.push({ id: q.id, scored, feedback });
      }
    }

    perQuestion.sort((a, b) => a.id - b.id);
    const totalMarks = allQuestions.reduce((sum, q) => sum + q.marks, 0);
    const percentage = totalMarks > 0 ? Math.round((totalScored / totalMarks) * 1000) / 10 : 0;
    const passed = percentage >= PASS_PERCENT;

    // ── Feedback on weak areas (light LLM pass, non-blocking on failure) ───
    let strengths: string[] = [];
    let weakAreas: string[] = [];
    let studyAdvice = "";
    try {
      const analysis = await aiJSON<{ strengths: string[]; weakAreas: string[]; studyAdvice: string }>(
        `You are the academic advisor of "Scholar's Kingdom". Based on a mock test result, give a short, encouraging analysis for a grade ${user.grade} student. STRICT valid JSON only: {"strengths":["..."],"weakAreas":["..."],"studyAdvice":"2-3 sentences"}. Max 3 items each.`,
        `Subject: ${attempt.subject}, chapter: ${attempt.chapter}, score ${totalScored}/${totalMarks} (${percentage}%).
Per-question feedback: ${JSON.stringify(perQuestion.map((p) => ({ id: p.id, scored: p.scored, feedback: p.feedback.slice(0, 120) })))}
Question competencies: ${JSON.stringify(allQuestions.map((q) => ({ id: q.id, competency: q.competency, type: q.type, marks: q.marks })))}`
      );
      strengths = (analysis.strengths ?? []).map((s: string) => String(s).slice(0, 160)).slice(0, 3);
      weakAreas = (analysis.weakAreas ?? []).map((s: string) => String(s).slice(0, 160)).slice(0, 3);
      studyAdvice = String(analysis.studyAdvice ?? "").slice(0, 500);
    } catch (e) {
      console.warn("advisor pass failed", e);
    }

    // ── Reward economy ─────────────────────────────────────────────────────
    let coinReward = 0;
    if (passed) {
      // 30 base + up to 20 scaled above the pass bar
      coinReward = Math.round(REWARDS.TEST_PASS_BASE + Math.min((percentage - PASS_PERCENT) / 2, 20));
    }

    const result: TestResult = {
      totalScored: Math.round(totalScored * 10) / 10,
      totalMarks,
      percentage,
      passed,
      perQuestion,
      strengths,
      weakAreas,
      studyAdvice,
      coinReward,
    };

    await db.testAttempt.update({
      where: { id: attempt.id },
      data: {
        answersJson: JSON.stringify(answers),
        resultJson: JSON.stringify(result),
        status: "submitted",
        submittedAt: new Date(),
        coinsEarned: coinReward,
      },
    });

    let coins = user.coins;
    if (coinReward > 0) {
      coins = await awardCoins(user.id, coinReward, `Mock test conquered — ${attempt.subject}: ${attempt.chapter} (${percentage}%)`);
    }

    return Response.json({ result, coins });
  } catch (err) {
    console.error("test submit error", err);
    return Response.json({ error: "Grading failed — the Chief Examiner will see you shortly. Please retry." }, { status: 500 });
  }
}
