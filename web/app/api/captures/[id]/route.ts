import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { signedUrl } from "@/lib/storage";
import { currentChildId } from "@/lib/session";

export const runtime = "nodejs";

/** 注意：此版本 Next.js 的动态路由 params 是 Promise，必须 await（TRD §1.2） */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 必须连 childId 一起查：只按 id 查等于任何人拿到 UUID 就能读别家的作业
  const [row] = await db
    .select()
    .from(schema.capture)
    .where(and(eq(schema.capture.id, id), eq(schema.capture.childId, await currentChildId())))
    .limit(1);
  if (!row) return NextResponse.json({ error: "不存在" }, { status: 404 });

  return NextResponse.json({
    id: row.id,
    imageUrl: signedUrl(row.imageKey),
    marked: row.marked,
    // 已经跑过检出就直接给结果，不必重跑：一次要 12 秒，还占一个 RPM 额度
    // （账号上限只有 3）。没跑过或跑失败时为 null，前端再触发 POST /detect。
    detectedBoxes: row.detectedBoxes?.boxes ?? null,
  });
}
