import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { signedUrl } from "@/lib/storage";

export const runtime = "nodejs";

/** 注意：此版本 Next.js 的动态路由 params 是 Promise，必须 await（TRD §1.2） */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(schema.capture).where(eq(schema.capture.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "不存在" }, { status: 404 });

  return NextResponse.json({
    id: row.id,
    imageUrl: signedUrl(row.imageKey),
    marked: row.marked,
    // 自动切题尚未接入，返回 null 让前端降级为纯手动模式
    detectedBoxes: null,
  });
}
