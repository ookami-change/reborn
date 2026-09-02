import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { getDetector } from "@/lib/detect";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 自动切题。失败一律返回空数组，让前端静默降级为手动圈选，不打断主流程。 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [cap] = await db.select().from(schema.capture).where(eq(schema.capture.id, id)).limit(1);
  if (!cap) return NextResponse.json({ error: "拍摄记录不存在" }, { status: 404 });

  try {
    const jpeg = await getObject(cap.imageKey);
    const boxes = await getDetector().detect(jpeg);
    return NextResponse.json({ boxes });
  } catch (e) {
    console.error("[detect]", e);
    return NextResponse.json({ boxes: [], error: e instanceof Error ? e.message : "检出失败" });
  }
}
