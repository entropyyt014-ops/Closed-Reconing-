import { getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import { aiChat } from "@/lib/kingdom/zai";

export const runtime = "nodejs";
export const maxDuration = 120;

const ACTIONS = {
  summarize: {
    label: "Condense into crisp revision notes",
    instruction:
      "Summarise the student's notes into tight revision notes: keep every exam-critical fact, formula and definition; cut filler. Use clear headings (in ALL CAPS) and '- ' bullets. Keep it shorter than the original.",
  },
  expand: {
    label: "Expand with deeper explanations",
    instruction:
      "Expand the student's notes with deeper, vivid explanations: add worked examples, real-life connections and memory hooks for each concept. Stay exactly at the student's grade level. Use headings and '- ' bullets.",
  },
  structure: {
    label: "Structure & clean up",
    instruction:
      "Reorganise the student's notes into a clean, logical structure: numbered sections with ALL-CAPS headings, '- ' bullets, formulas set on their own lines. Fix spelling/grammar. Do not lose any information.",
  },
  gapfix: {
    label: "Fix gaps against the official syllabus",
    instruction:
      "Audit the student's notes against the OFFICIAL syllabus for their board, grade and chapter. Add clearly-marked sections 'GAPS FOUND & FIXED:' for missing syllabus concepts (with concise notes on each), and 'REVIEW THESE:' for anything partially covered. Use '- ' bullets.",
  },
} as const;

type ActionKey = keyof typeof ACTIONS;

/** POST { action, text, subject, chapter } → AI co-pilot transformation of selected notes. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const action = String(body.action ?? "") as ActionKey;
    const text = String(body.text ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const chapter = String(body.chapter ?? "").trim();

    if (!ACTIONS[action]) {
      return Response.json({ error: "Unknown co-pilot action." }, { status: 400 });
    }
    if (text.length < 20) {
      return Response.json({ error: "Select or write at least a couple of lines first." }, { status: 400 });
    }

    const reply = await aiChat([
      {
        role: "system",
        content: `You are the Notes Co-Pilot of "Scholar's Kingdom", an AI study companion for Grade ${user.grade ?? "6-12"} students (${user.board ?? "international"} curriculum, ${user.country ?? "global"}).
${ACTIONS[action].instruction}
Output plain text (no markdown asterisks or tables — use ALL-CAPS headings, '- ' bullets and blank lines). Keep the student's own voice where possible. Stay strictly within grade ${user.grade ?? "6-12"} level — never add university-level content.`,
      },
      {
        role: "user",
        content: `Subject: ${subject || "general"}\nChapter: ${chapter || "general"}\n\nMY NOTES:\n${text.slice(0, 12000)}`,
      },
    ]);

    return Response.json({ text: reply });
  } catch (err) {
    console.error("notes ai error", err);
    return Response.json({ error: "The Notes Co-Pilot is thinking... please retry." }, { status: 500 });
  }
}
