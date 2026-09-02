import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { signedUrl } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [sheet] = await db
    .select()
    .from(schema.reviewSheet)
    .where(eq(schema.reviewSheet.shortCode, code.toUpperCase()))
    .limit(1);
  if (!sheet) return NextResponse.json({ error: "找不到这张卷" }, { status: 404 });

  const ids = sheet.itemOrder.map((i) => i.problemId);
  const problems = ids.length
    ? await db.select().from(schema.problem).where(inArray(schema.problem.id, ids))
    : [];

  return NextResponse.json({
    shortCode: sheet.shortCode,
    status: sheet.status,
    createdAt: sheet.createdAt,
    pdfUrl: sheet.pdfKey ? signedUrl(sheet.pdfKey) : null,
    items: sheet.itemOrder.map((i) => {
      const p = problems.find((x) => x.id === i.problemId);
      return {
        seq: i.seq,
        code: i.code,
        problemId: i.problemId,
        correctAnswer: p?.correctAnswer ?? "",
        cropImageUrl: p ? signedUrl(p.cropImageKey) : null,
      };
    }),
  });
}
