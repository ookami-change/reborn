import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { applyAttempt, type CardState } from "@/lib/leitner";
import { currentChildId } from "@/lib/session";

export const runtime = "nodejs";

/** 回收重做结果：写作答记录 + 推进 Leitner 档位（PRD FR-6） */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { results } = ((await req.json().catch(() => ({}))) as {
    results?: { problemId: string; verdict: "right" | "wrong"; correctAnswer?: string }[];
  }) ?? {};

  const [sheet] = await db
    .select()
    .from(schema.reviewSheet)
  /* 必须带 childId：短码是 R01/R02 这种连号，**可以枚举**。
   * 只按短码查 = 输个 R08 就能读到甚至改掉别家的复习卷。 */
    .where(
      and(
        eq(schema.reviewSheet.shortCode, code.toUpperCase()),
        eq(schema.reviewSheet.childId, await currentChildId()),
      ),
    )
    .limit(1);
  if (!sheet) return NextResponse.json({ error: "找不到这张卷" }, { status: 404 });
  if (sheet.status === "collected") {
    return NextResponse.json({ error: "这张卷已经录过了" }, { status: 409 });
  }

  const allowed = new Set(sheet.itemOrder.map((i) => i.problemId));
  const valid = (results ?? []).filter((r) => allowed.has(r.problemId));
  if (valid.length === 0) {
    return NextResponse.json({ error: "没有可录入的结果" }, { status: 400 });
  }

  const cards = await db
    .select()
    .from(schema.mistakeCard)
    .where(inArray(schema.mistakeCard.problemId, [...allowed]));

  const summary = { rightCount: 0, wrongCount: 0, resetCount: 0, masteredCount: 0 };

  await db.transaction(async (tx) => {
    // 一次重做算一次拍摄事件，来源指向这张卷，详情页据此显示「复习卷 R07」
    const [redo] = await tx
      .insert(schema.capture)
      .values({
        childId: sheet.childId,
        imageKey: "",
        sourceType: "review_redo",
        reviewSheetId: sheet.id,
        marked: true,
      })
      .returning({ id: schema.capture.id });

    for (const r of valid) {
      await tx.insert(schema.attempt).values({
        problemId: r.problemId,
        captureId: redo.id,
        verdict: r.verdict,
        source: "manual",
      });

      // 圈题时没填答案的，家长在这一屏顺手补——此时他手里有原卷和孩子
      // 重做的，本来就在逐题看，边际成本接近零（痛点§2.4）
      const answer = r.correctAnswer?.trim();
      if (answer) {
        await tx
          .update(schema.problem)
          .set({ correctAnswer: answer })
          .where(eq(schema.problem.id, r.problemId));
      }

      const card = cards.find((c) => c.problemId === r.problemId);
      if (!card) continue;

      const before: CardState = {
        boxLevel: card.boxLevel,
        nextDueDate: card.nextDueDate,
        consecutiveCorrect: card.consecutiveCorrect,
        status: card.status as CardState["status"],
      };
      const after = applyAttempt(before, r.verdict);

      await tx
        .update(schema.mistakeCard)
        .set({
          boxLevel: after.boxLevel,
          nextDueDate: after.nextDueDate,
          consecutiveCorrect: after.consecutiveCorrect,
          status: after.status,
          updatedAt: new Date(),
        })
        .where(eq(schema.mistakeCard.id, card.id));

      if (r.verdict === "right") {
        summary.rightCount++;
        if (after.status === "mastered") summary.masteredCount++;
      } else {
        summary.wrongCount++;
        if (before.boxLevel > 1) summary.resetCount++;
      }
    }

    await tx
      .update(schema.reviewSheet)
      .set({ status: "collected" })
      .where(eq(schema.reviewSheet.id, sheet.id));
  });

  return NextResponse.json(summary);
}
