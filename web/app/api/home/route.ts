import { NextResponse } from "next/server";
import { and, count, eq, isNotNull, lte, min } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { today } from "@/lib/leitner";
import { currentChildId } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const t = today();
  const childId = await currentChildId();
  // 五个计数每一个都要带 childId，漏一个就是把别家的数字显示在首页
  const mine = eq(schema.mistakeCard.childId, childId);
  const learning = and(mine, eq(schema.mistakeCard.status, "learning"));

  const [due] = await db
    .select({ n: count(), earliest: min(schema.mistakeCard.nextDueDate) })
    .from(schema.mistakeCard)
    .where(and(learning, isNotNull(schema.mistakeCard.nextDueDate), lte(schema.mistakeCard.nextDueDate, t)));

  const [total] = await db.select({ n: count() }).from(schema.mistakeCard).where(mine);
  const [mastered] = await db
    .select({ n: count() })
    .from(schema.mistakeCard)
    .where(and(mine, eq(schema.mistakeCard.status, "mastered")));
  const [unmarked] = await db
    .select({ n: count() })
    .from(schema.capture)
    .where(and(eq(schema.capture.childId, childId), eq(schema.capture.marked, false)));
  const [pending] = await db
    .select({ n: count() })
    .from(schema.reviewSheet)
    .where(and(eq(schema.reviewSheet.childId, childId), eq(schema.reviewSheet.status, "generated")));

  return NextResponse.json({
    dueCount: due?.n ?? 0,
    earliestDueDate: due?.earliest ?? null,
    unmarkedCaptureCount: unmarked?.n ?? 0,
    pendingSheetCount: pending?.n ?? 0,
    totalMistakes: total?.n ?? 0,
    learningCount: (total?.n ?? 0) - (mastered?.n ?? 0),
    masteredCount: mastered?.n ?? 0,
  });
}
