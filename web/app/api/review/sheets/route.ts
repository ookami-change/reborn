import { NextRequest, NextResponse } from "next/server";
import { count, desc, eq, inArray } from "drizzle-orm";
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

  /* 上面已插入 sheet 行来占住短码，之后任何一步失败都必须把它删掉，
   * 否则会留下一张没有 PDF 的"孤儿卷"，照样出现在首页「待回收」里。 */
  try {
    // 逐张取图，不用 Promise.all：并发调 COS getObject 会间歇性拿到空 Body
    // （见 lib/storage.ts 的注释）。图很小，串行的代价可以忽略。
    const items = [];
    for (let i = 0; i < ordered.length; i++) {
      const p = ordered[i];
      items.push({
        code: itemOrder[i].code,
        jpeg: await getObject(p.cropImageKey),
        maskBoxes: p.maskBoxes,
        correctAnswer: p.correctAnswer,
      });
    }

    const pdf = await renderReviewSheet({
      childName: child?.name ?? "我的孩子",
      shortCode,
      collectUrl: `${base}${bp}/review/${shortCode}/collect`,
      perPage,
      withAnswerPage,
      items,
    });

    const pdfKey = key("sheet", `${sheet.id}.pdf`);
    await putObject(pdfKey, pdf, "application/pdf");
    await db
      .update(schema.reviewSheet)
      .set({ pdfKey })
      .where(eq(schema.reviewSheet.id, sheet.id));

    return NextResponse.json({ sheetId: sheet.id, shortCode, pdfUrl: signedUrl(pdfKey) });
  } catch (err) {
    await db.delete(schema.reviewSheet).where(eq(schema.reviewSheet.id, sheet.id));
    const msg = err instanceof Error ? err.message : String(err);
    console.error("组卷失败", shortCode, msg);
    // 一定要带 JSON 体：空体会让前端的 res.json() 抛
    // "Unexpected end of JSON input"，把真正的原因盖掉。
    return NextResponse.json({ error: `生成失败：${msg}` }, { status: 500 });
  }
}

/** 复习卷列表：待回收的在前，用于首页「待回收」入口。 */
export async function GET() {
  const rows = await db
    .select({
      shortCode: schema.reviewSheet.shortCode,
      status: schema.reviewSheet.status,
      createdAt: schema.reviewSheet.createdAt,
      itemOrder: schema.reviewSheet.itemOrder,
      pdfKey: schema.reviewSheet.pdfKey,
    })
    .from(schema.reviewSheet)
    .orderBy(desc(schema.reviewSheet.createdAt));

  const items = rows.map((r) => ({
    shortCode: r.shortCode,
    status: r.status,
    createdAt: r.createdAt,
    itemCount: r.itemOrder.length,
    pdfUrl: r.pdfKey ? signedUrl(r.pdfKey) : null,
  }));
  return NextResponse.json({ items });
}
