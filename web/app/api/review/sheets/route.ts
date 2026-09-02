import { NextRequest, NextResponse } from "next/server";
import { count, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { defaultChildId } from "@/lib/db/seed";
import { getObject, key, putObject, signedUrl } from "@/lib/storage";
import { renderReviewSheet } from "@/lib/pdf";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { problemIds, perPage = 5, withAnswerPage = true } = (await req.json()) as {
    problemIds: string[];
    perPage?: number;
    withAnswerPage?: boolean;
  };
  if (!Array.isArray(problemIds) || problemIds.length === 0) {
    return NextResponse.json({ error: "至少要选一道题" }, { status: 400 });
  }

  const childId = await defaultChildId();
  const [child] = await db.select().from(schema.child).where(eq(schema.child.id, childId)).limit(1);

  const rows = await db
    .select()
    .from(schema.problem)
    .where(inArray(schema.problem.id, problemIds));
  // 保持请求给定的顺序，卷面顺序即回收顺序
  const ordered = problemIds
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is (typeof rows)[number] => !!r);

  // 短码：R + 该孩子已生成卷数+1
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.reviewSheet)
    .where(eq(schema.reviewSheet.childId, childId));
  const seq = n + 1;
  const shortCode = `R${String(seq).padStart(2, "0")}`;

  const itemOrder = ordered.map((p, i) => ({
    seq: i + 1,
    problemId: p.id,
    code: String(i + 1).padStart(2, "0"),
  }));

  const [sheet] = await db
    .insert(schema.reviewSheet)
    .values({ childId, shortCode, itemOrder, perPage, withAnswerPage })
    .returning({ id: schema.reviewSheet.id });

  const base = process.env.BASE_URL ?? "http://localhost:3000";
  const bp = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const pdf = await renderReviewSheet({
    childName: child?.name ?? "我的孩子",
    shortCode,
    collectUrl: `${base}${bp}/review/${shortCode}/collect`,
    perPage,
    withAnswerPage,
    items: await Promise.all(
      ordered.map(async (p, i) => ({
        code: itemOrder[i].code,
        jpeg: await getObject(p.cropImageKey),
        maskBoxes: p.maskBoxes,
        correctAnswer: p.correctAnswer,
      })),
    ),
  });

  const pdfKey = key("sheet", `${sheet.id}.pdf`);
  await putObject(pdfKey, pdf, "application/pdf");
  await db
    .update(schema.reviewSheet)
    .set({ pdfKey })
    .where(eq(schema.reviewSheet.id, sheet.id));

  return NextResponse.json({ sheetId: sheet.id, shortCode, pdfUrl: signedUrl(pdfKey) });
}
