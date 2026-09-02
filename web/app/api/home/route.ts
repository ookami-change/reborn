import { NextResponse } from "next/server";
import { and, count, eq, isNotNull, lte, min } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { today } from "@/lib/leitner";

export const runtime = "nodejs";

export async function GET() {
  const t = today();
  const learning = eq(schema.mistakeCard.status, "learning");

  const [due] = await db
    .select({ n: count(), earliest: min(schema.mistakeCard.nextDueDate) })
    .from(schema.mistakeCard)
    .where(and(learning, isNotNull(schema.mistakeCard.nextDueDate), lte(schema.mistakeCard.nextDueDate, t)));

  const [total] = await db.select({ n: count() }).from(schema.mistakeCard);
  const [mastered] = await db
    .select({ n: count() })
    .from(schema.mistakeCard)
    .where(eq(schema.mistakeCard.status, "mastered"));
  const [unmarked] = await db
    .select({ n: count() })
    .from(schema.capture)
    .where(eq(schema.capture.marked, false));
  const [pending] = await db
    .select({ n: count() })
    .from(schema.reviewSheet)
    .where(eq(schema.reviewSheet.status, "generated"));

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
