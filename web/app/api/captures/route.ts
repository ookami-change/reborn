import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { defaultChildId } from "@/lib/db/seed";
import { key, putObject } from "@/lib/storage";

export const runtime = "nodejs";

/** 上传一张作业照片并建立 capture。
 *  走服务端上传而非浏览器直传 COS —— 桶的 CORS 白名单由 CloudBase 托管，
 *  不含本项目域名（TRD §7.6 已相应调整）。 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "图片超过 10MB" }, { status: 413 });
  }

  const sourceType = String(form.get("sourceType") ?? "homework");
  const childId = await defaultChildId();

  // 统一压到最长边 2000px / JPEG q85，控制存储与后续处理成本（TRD §5.1）
  const raw = Buffer.from(await file.arrayBuffer());
  const normalized = await sharp(raw)
    .rotate() // 按 EXIF 摆正，否则手机竖拍的图会躺着
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const [row] = await db
    .insert(schema.capture)
    .values({ childId, imageKey: "", sourceType })
    .returning({ id: schema.capture.id });

  const imageKey = key("raw", `${row.id}.jpg`);
  await putObject(imageKey, normalized, "image/jpeg");
  await db
    .update(schema.capture)
    .set({ imageKey })
    .where(eq(schema.capture.id, row.id));

  return NextResponse.json({ captureId: row.id });
}
