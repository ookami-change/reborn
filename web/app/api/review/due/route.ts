import { NextResponse } from "next/server";
import { and, asc, eq, gt, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { signedUrl } from "@/lib/storage";
import { addDays, today } from "@/lib/leitner";

export const runtime = "nodejs";

const UPCOMING_WINDOW = 3; // 天

/** 到期题 + 即将到期题（用于题数不足时提示补齐，TRD §4.2） */
export async function GET() {
  const t = today();
  const learning = eq(schema.mistakeCard.status, "learning");

  const pick = (extra: ReturnType<typeof and>) =>
    db
      .select({
        cardId: schema.mistakeCard.id,
        problemId: schema.problem.id,
        cropImageKey: schema.problem.cropImageKey,
        correctAnswer: schema.problem.correctAnswer,
        nextDueDate: schema.mistakeCard.nextDueDate,
        boxLevel: schema.mistakeCard.boxLevel,
      })
      .from(schema.mistakeCard)
      .innerJoin(schema.problem, eq(schema.mistakeCard.problemId, schema.problem.id))
      .where(extra)
      .orderBy(asc(schema.mistakeCard.nextDueDate));

  const due = await pick(and(learning, isNotNull(schema.mistakeCard.nextDueDate), lte(schema.mistakeCard.nextDueDate, t)));
  const upcoming = await pick(
    and(
      learning,
      gt(schema.mistakeCard.nextDueDate, t),
      lte(schema.mistakeCard.nextDueDate, addDays(UPCOMING_WINDOW)),
    ),
  );

  const withUrl = (r: (typeof due)[number]) => ({ ...r, cropImageUrl: signedUrl(r.cropImageKey) });
  return NextResponse.json({ due: due.map(withUrl), upcoming: upcoming.map(withUrl) });
}
