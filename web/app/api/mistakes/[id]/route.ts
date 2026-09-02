import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { signedUrl } from "@/lib/storage";
import { addDays, BOX_INTERVALS, MAX_BOX, today } from "@/lib/leitner";

export const runtime = "nodejs";

/** id 为 mistake_card.id */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db
    .select()
    .from(schema.mistakeCard)
    .innerJoin(schema.problem, eq(schema.mistakeCard.problemId, schema.problem.id))
    .where(eq(schema.mistakeCard.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "不存在" }, { status: 404 });

  const attempts = await db
    .select({
      id: schema.attempt.id,
      verdict: schema.attempt.verdict,
      source: schema.attempt.source,
      childAnswer: schema.attempt.childAnswer,
      createdAt: schema.attempt.createdAt,
      captureId: schema.attempt.captureId,
      sheetCode: schema.reviewSheet.shortCode,
    })
    .from(schema.attempt)
    .leftJoin(schema.capture, eq(schema.attempt.captureId, schema.capture.id))
    .leftJoin(schema.reviewSheet, eq(schema.capture.reviewSheetId, schema.reviewSheet.id))
    .where(eq(schema.attempt.problemId, row.problem.id))
    .orderBy(asc(schema.attempt.createdAt));

  return NextResponse.json({
    id: row.mistake_card.id,
    cropImageUrl: signedUrl(row.problem.cropImageKey),
    maskBoxes: row.problem.maskBoxes,
    correctAnswer: row.problem.correctAnswer,
    boxLevel: row.mistake_card.boxLevel,
    maxBox: MAX_BOX,
    nextDueDate: row.mistake_card.nextDueDate,
    status: row.mistake_card.status,
    attempts: attempts.map((a, i) => ({
      ...a,
      originLabel: i === 0 ? "原始作业" : a.sheetCode ? `复习卷 ${a.sheetCode}` : "重做",
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { correctAnswer?: string; action?: "mark_mastered" | "reset" };

  const [card] = await db.select().from(schema.mistakeCard).where(eq(schema.mistakeCard.id, id)).limit(1);
  if (!card) return NextResponse.json({ error: "不存在" }, { status: 404 });

  if (body.correctAnswer?.trim()) {
    await db
      .update(schema.problem)
      .set({ correctAnswer: body.correctAnswer.trim() })
      .where(eq(schema.problem.id, card.problemId));
  }

  if (body.action === "mark_mastered") {
    await db
      .update(schema.mistakeCard)
      .set({ status: "mastered", boxLevel: MAX_BOX, nextDueDate: null, updatedAt: new Date() })
      .where(eq(schema.mistakeCard.id, id));
  } else if (body.action === "reset") {
    await db
      .update(schema.mistakeCard)
      .set({
        status: "learning",
        boxLevel: 1,
        consecutiveCorrect: 0,
        nextDueDate: addDays(BOX_INTERVALS[1]),
        updatedAt: new Date(),
      })
      .where(eq(schema.mistakeCard.id, id));
  }

  return NextResponse.json({ ok: true, today: today() });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [card] = await db.select().from(schema.mistakeCard).where(eq(schema.mistakeCard.id, id)).limit(1);
  if (!card) return NextResponse.json({ error: "不存在" }, { status: 404 });
  // problem 上的外键是 cascade，删题即连带删除作答历史与错题卡
  await db.delete(schema.problem).where(eq(schema.problem.id, card.problemId));
  return NextResponse.json({ ok: true });
}
