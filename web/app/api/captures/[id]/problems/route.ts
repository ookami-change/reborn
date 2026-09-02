import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db, schema } from "@/lib/db";
import { key, getObject, putObject } from "@/lib/storage";
import type { Box } from "@/lib/types";

export const runtime = "nodejs";

type Item = {
  cropBox: Box;
  maskBoxes?: Box[];
  correctAnswer: string;
  childAnswer?: string;
};

/** 圈题完成：为每道题裁图、建 problem + attempt + mistake_card。
 *  整体在一个事务内完成，capture 标记为已圈题（TRD §3.2）。 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { items } = (await req.json()) as { items: Item[] };

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "至少要有一道题" }, { status: 400 });
  }
  if (items.some((i) => !i.correctAnswer?.trim())) {
    return NextResponse.json({ error: "每道题都要填正确答案" }, { status: 400 });
  }

  const [cap] = await db.select().from(schema.capture).where(eq(schema.capture.id, id)).limit(1);
  if (!cap) return NextResponse.json({ error: "拍摄记录不存在" }, { status: 404 });

  const original = await getObject(cap.imageKey);
  const meta = await sharp(original).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) return NextResponse.json({ error: "原图损坏" }, { status: 422 });

  // 先把所有裁剪图传上去；失败则整体放弃，不写库
  const crops: { buf: Buffer; item: Item }[] = [];
  for (const item of items) {
    const b = item.cropBox;
    const left = Math.max(0, Math.round(b.x * W));
    const top = Math.max(0, Math.round(b.y * H));
    const width = Math.min(W - left, Math.max(1, Math.round(b.w * W)));
    const height = Math.min(H - top, Math.max(1, Math.round(b.h * H)));
    const buf = await sharp(original)
      .extract({ left, top, width, height })
      .jpeg({ quality: 90 })
      .toBuffer();
    crops.push({ buf, item });
  }

  const problemIds = await db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const { buf, item } of crops) {
      const [p] = await tx
        .insert(schema.problem)
        .values({
          childId: cap.childId,
          sourceCaptureId: cap.id,
          cropBox: item.cropBox,
          cropImageKey: "",
          maskBoxes: item.maskBoxes ?? [],
          correctAnswer: item.correctAnswer.trim(),
        })
        .returning({ id: schema.problem.id });

      const cropKey = key("crop", `${p.id}.jpg`);
      await putObject(cropKey, buf, "image/jpeg");
      await tx
        .update(schema.problem)
        .set({ cropImageKey: cropKey })
        .where(eq(schema.problem.id, p.id));

      // 圈出来的都是错题，这是第一次作答记录
      await tx.insert(schema.attempt).values({
        problemId: p.id,
        captureId: cap.id,
        childAnswer: item.childAnswer?.trim() || null,
        verdict: "wrong",
        source: "manual",
      });

      // 新错题进第 1 档，明天复习（PRD FR-4）
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await tx.insert(schema.mistakeCard).values({
        problemId: p.id,
        childId: cap.childId,
        boxLevel: 1,
        nextDueDate: tomorrow.toISOString().slice(0, 10),
      });

      ids.push(p.id);
    }

    await tx.update(schema.capture).set({ marked: true }).where(eq(schema.capture.id, cap.id));
    return ids;
  });

  return NextResponse.json({ problemIds });
}
