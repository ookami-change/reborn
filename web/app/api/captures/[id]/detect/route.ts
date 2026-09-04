import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { getDetector } from "@/lib/detect";
import { currentChildId } from "@/lib/session";
import type { DetectionRun } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 自动切题。失败一律返回空数组，让前端静默降级为手动圈选，不打断主流程。
 *
 *  无论成败都把这次运行落库（《痛点与针对性设计》§三）：存的是模型输出的
 *  **全部**框，包括家长后来没采纳的。只存被采纳的框就永远算不出虚检和召回率。 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [cap] = await db
    .select()
    .from(schema.capture)
    .where(and(eq(schema.capture.id, id), eq(schema.capture.childId, await currentChildId())))
    .limit(1);
  if (!cap) return NextResponse.json({ error: "拍摄记录不存在" }, { status: 404 });

  const detector = getDetector();
  const t0 = Date.now();
  let run: DetectionRun;

  try {
    const jpeg = await getObject(cap.imageKey);
    const boxes = await detector.detect(jpeg);
    run = { model: detector.name, ms: Date.now() - t0, boxes, at: new Date().toISOString() };
  } catch (e) {
    console.error("[detect]", e);
    run = {
      model: detector.name,
      ms: Date.now() - t0,
      boxes: [],
      at: new Date().toISOString(),
      error: e instanceof Error ? e.message : "检出失败",
    };
  }

  // 落库失败不能影响检出结果返回给前端
  try {
    await db
      .update(schema.capture)
      .set({ detectedBoxes: run })
      .where(eq(schema.capture.id, cap.id));
  } catch (e) {
    console.error("[detect] 保存检出记录失败", e);
  }

  return NextResponse.json({ boxes: run.boxes, ...(run.error ? { error: run.error } : {}) });
}
