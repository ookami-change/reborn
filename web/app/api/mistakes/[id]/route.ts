import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { currentChildId } from "@/lib/session";
import { signedUrl } from "@/lib/storage";
import { addDays, BOX_INTERVALS, MAX_BOX, today } from "@/lib/leitner";

export const runtime = "nodejs";

/** 归属校验：只按 card.id 查等于任何人拿到 UUID 就能改删别家的错题 */
const mine = (id: string, childId: string) =>
  and(eq(schema.mistakeCard.id, id), eq(schema.mistakeCard.childId, childId));

/** id 为 mistake_card.id */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db
    .select()
    .from(schema.mistakeCard)
    .innerJoin(schema.problem, eq(schema.mistakeCard.problemId, schema.problem.id))
    .where(and(eq(schema.mistakeCard.id, id), eq(schema.mistakeCard.childId, await currentChildId())))
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
  const body = (await req.json().catch(() => ({}))) as {
    correctAnswer?: string;
    action?: "mark_mastered" | "reset";
  };

  const [card] = await db.select().from(schema.mistakeCard).where(mine(id, await currentChildId())).limit(1);
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
  const [card] = await db.select().from(schema.mistakeCard).where(mine(id, await currentChildId())).limit(1);
  if (!card) return NextResponse.json({ error: "不存在" }, { status: 404 });
  /* 软删除（T7）：合规要求可删除，且要能恢复误删。物理删除会连带 cascade
   * 掉作答历史，那批数据是掌握状态可重算的唯一依据（TRD §2.2），删不得。
   * 错题卡一并置为 mastered，让它退出复习调度、不再出现在到期列表里。 */
  const now = new Date();
  await db.update(schema.problem).set({ deletedAt: now }).where(eq(schema.problem.id, card.problemId));
  await db
    .update(schema.mistakeCard)
    .set({ status: "mastered", nextDueDate: null, updatedAt: now })
    .where(eq(schema.mistakeCard.id, id));
  return NextResponse.json({ ok: true });
}
