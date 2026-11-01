import { db } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/kingdom/auth";
import { jsPDF } from "jspdf";
import type { TestPaper, TestQuestion } from "@/lib/kingdom/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 20;

function clean(text: string): string {
  return (text ?? "")
    .replace(/\*\*/g, "")
    .replace(/[•]/g, "-")
    .replace(/\r/g, "")
    .trim();
}

/** POST { attemptId, includeAnswers } → downloadable board-format PDF question paper. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const attemptId = String(body.attemptId ?? "");
    const includeAnswers = body.includeAnswers === true;

    const attempt = await db.testAttempt.findFirst({ where: { id: attemptId, userId: user.id } });
    if (!attempt) return Response.json({ error: "Test not found." }, { status: 404 });

    const paper: TestPaper = JSON.parse(attempt.paperJson);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    let y = 0;

    const newPage = () => {
      doc.addPage();
      y = MARGIN;
    };

    const ensure = (needed: number) => {
      if (y + needed > BOTTOM) newPage();
    };

    const writeText = (
      text: string,
      opts: { size?: number; style?: "normal" | "bold" | "italic"; indent?: number; gap?: number; color?: [number, number, number] } = {}
    ) => {
      const { size = 10.5, style = "normal", indent = 0, gap = 1.6, color } = opts;
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
      if (color) doc.setTextColor(color[0], color[1], color[2]);
      else doc.setTextColor(20, 20, 30);
      const lines = doc.splitTextToSize(clean(text), CONTENT_W - indent) as string[];
      for (const line of lines) {
        ensure(size * 0.5 + gap);
        doc.text(line, MARGIN + indent, y);
        y += size * 0.42 + gap;
      }
      y += 0.8;
    };

    const writeCentered = (text: string, size: number, style: "normal" | "bold" | "italic" = "bold", color?: [number, number, number]) => {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
      if (color) doc.setTextColor(color[0], color[1], color[2]);
      else doc.setTextColor(20, 20, 30);
      ensure(size * 0.5 + 2);
      const lines = doc.splitTextToSize(clean(text), CONTENT_W) as string[];
      for (const line of lines) {
        doc.text(line, PAGE_W / 2, y, { align: "center" });
        y += size * 0.45 + 1.5;
      }
    };

    // ─── Royal letterhead ────────────────────────────────────────────────
    y = MARGIN;
    doc.setFillColor(124, 58, 237);
    doc.rect(0, 0, PAGE_W, 4, "F");
    writeCentered("SCHOLAR'S KINGDOM", 17, "bold", [98, 37, 190]);
    writeCentered("Royal Examination Board — AI Mock Test", 10, "italic", [90, 90, 110]);
    y += 1;

    doc.setDrawColor(124, 58, 237);
    doc.setLineWidth(0.5);
    ensure(6);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 4;

    // ─── Paper meta ──────────────────────────────────────────────────────
    writeCentered(clean(paper.paperTitle), 13, "bold");
    writeCentered(
      `${user.board ?? "International Curriculum"}  ·  Grade ${user.grade ?? "-"}  ·  ${clean(attempt.subject)}`,
      10, "normal", [70, 70, 90]
    );
    writeCentered(`Chapter: ${clean(attempt.chapter)}`, 10, "normal", [70, 70, 90]);
    y += 1;
    ensure(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 30);
    const metaLeft = `Time: ${paper.durationMins} minutes`;
    const metaRight = `Maximum Marks: ${paper.totalMarks}`;
    doc.text(metaLeft, MARGIN, y);
    doc.text(metaRight, PAGE_W - MARGIN, y, { align: "right" });
    y += 6;

    doc.setDrawColor(200, 200, 210);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 5;

    // ─── Instructions ────────────────────────────────────────────────────
    writeText("GENERAL INSTRUCTIONS", { size: 10.5, style: "bold" });
    const instructionLines = clean(paper.instructions)
      .split(/\n|(?<=\.)\s{2,}/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of instructionLines) {
      writeText(line, { size: 9.5, indent: 3, gap: 1.3 });
    }
    y += 2;

    // ─── PYQ pattern note ────────────────────────────────────────────────
    if (paper.pyqPattern) {
      writeText("PAPER PATTERN (based on authentic PYQ analysis):", { size: 9, style: "bold" });
      writeText(paper.pyqPattern, { size: 9, style: "italic", indent: 3, color: [90, 90, 110] });
      y += 2;
    }

    // ─── Sections & questions ────────────────────────────────────────────
    let qNumber = 0;
    for (const section of paper.sections ?? []) {
      ensure(14);
      doc.setFillColor(240, 235, 250);
      const secTitle = clean(section.name);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      const secLines = doc.splitTextToSize(secTitle, CONTENT_W - 8) as string[];
      const boxH = secLines.length * 5 + 3;
      doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 1.5, 1.5, "F");
      doc.setTextColor(98, 37, 190);
      let ly = y + 6.5;
      for (const line of secLines) {
        doc.text(line, MARGIN + 4, ly);
        ly += 5;
      }
      y += boxH + 3;

      if (section.instructions) {
        writeText(section.instructions, { size: 9, style: "italic", indent: 2, color: [90, 90, 110] });
      }

      for (const q of section.questions ?? []) {
        qNumber += 1;
        ensure(16);
        const label = `Q${qNumber}.`;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(20, 20, 30);

        if (q.context) {
          writeText(`Case / Scenario (for Q${qNumber}):`, { size: 9.5, style: "bold", color: [98, 37, 190] });
          writeText(q.context, { size: 9.5, style: "italic", indent: 3, gap: 1.3 });
        }

        const qLines = doc.splitTextToSize(clean(q.text), CONTENT_W - 14) as string[];
        ensure(qLines.length * 5 + 8);
        doc.text(label, MARGIN, y);
        let ly = y;
        for (const line of qLines) {
          doc.setFont("helvetica", "normal");
          doc.text(line, MARGIN + 10, ly);
          ly += 5;
        }
        y = ly;
        doc.setFont("helvetica", "bold");
        doc.text(`[${q.marks}${q.marks === 1 ? " mark" : " marks"}]`, PAGE_W - MARGIN, y - 5, { align: "right" });

        if (q.type === "mcq" || q.type === "case") {
          if (Array.isArray(q.options)) {
            q.options.forEach((opt, i) => {
              writeText(`(${String.fromCharCode(65 + i)}) ${clean(opt)}`, { size: 10, indent: 10, gap: 1.2 });
            });
          }
        } else {
          // answer lines for subjective questions
          const linesCount = q.type === "long" ? 5 : 3;
          doc.setDrawColor(190, 190, 200);
          doc.setLineWidth(0.25);
          for (let i = 0; i < linesCount; i++) {
            ensure(7);
            y += 5;
            doc.line(MARGIN + 10, y, PAGE_W - MARGIN, y);
          }
          y += 3;
        }
        y += 3;
      }
    }

    // ─── Optional answer key ─────────────────────────────────────────────
    if (includeAnswers) {
      newPage();
      doc.setFillColor(124, 58, 237);
      doc.rect(0, 0, PAGE_W, 4, "F");
      writeCentered("ANSWER KEY & MARKING SCHEME", 14, "bold", [98, 37, 190]);
      writeCentered(`${clean(paper.paperTitle)} — Scholar's Kingdom`, 9, "italic", [90, 90, 110]);
      y += 3;

      let n = 0;
      for (const section of paper.sections ?? []) {
        for (const q of section.questions ?? []) {
          n += 1;
          ensure(14);
          const isObjective = (q.type === "mcq" || q.type === "case") && Array.isArray(q.options) && Number.isInteger(q.correctIndex);
          writeText(
            `Q${n} — ${isObjective ? `Correct option: (${String.fromCharCode(65 + (q.correctIndex ?? 0))})` : `Model answer (${q.marks} marks)`}`,
            { size: 10.5, style: "bold", color: [98, 37, 190] }
          );
          if (isObjective) {
            const optText = clean((q.options ?? [])[(q.correctIndex ?? 0) as number] ?? "");
            if (optText) writeText(optText, { size: 9.5, indent: 4, gap: 1.2 });
            if (q.answerHint) writeText(`Why: ${q.answerHint}`, { size: 9, indent: 4, style: "italic", color: [80, 80, 100], gap: 1.1 });
          } else {
            if (q.answerHint) writeText(q.answerHint, { size: 9.5, indent: 4, gap: 1.2 });
          }
          if (q.markingScheme) {
            writeText(`Marking scheme: ${q.markingScheme}`, { size: 9, indent: 4, style: "italic", color: [80, 80, 100], gap: 1.1 });
          }
          y += 1.5;
        }
      }
    }

    // ─── Page numbers + footer ───────────────────────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 155);
      doc.text(`Page ${i} of ${pageCount}`, PAGE_W / 2, PAGE_H - 8, { align: "center" });
      doc.text("Generated by Scholar's Kingdom — AI Examination Sage", MARGIN, PAGE_H - 8);
      doc.text("scholarskingdom.app", PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
    }

    const filename = `ScholarsKingdom_${clean(attempt.subject).replace(/\s+/g, "")}_${clean(attempt.chapter).replace(/\s+/g, "").slice(0, 30)}${includeAnswers ? "_WithAnswers" : ""}.pdf`;
    const arrayBuffer = doc.output("arraybuffer");

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(arrayBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error("test pdf error", err);
    return Response.json({ error: "PDF compilation failed — the Royal Press will retry." }, { status: 500 });
  }
}
