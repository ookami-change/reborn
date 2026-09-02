import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { signedUrl } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db
    .select({
      id: schema.mistakeCard.id,
      problemId: schema.problem.id,
      cropImageKey: schema.problem.cropImageKey,
      correctAnswer: schema.problem.correctAnswer,
      boxLevel: schema.mistakeCard.boxLevel,
      nextDueDate: schema.mistakeCard.nextDueDate,
      status: schema.mistakeCard.status,
      createdAt: schema.problem.createdAt,
    })
    .from(schema.mistakeCard)
    .innerJoin(schema.problem, eq(schema.mistakeCard.problemId, schema.problem.id))
    .orderBy(desc(schema.problem.createdAt));

  return NextResponse.json({
    items: rows.map((r) => ({ ...r, cropImageUrl: signedUrl(r.cropImageKey) })),
  });
}
