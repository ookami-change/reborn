/* 导出检出训练集（《痛点与针对性设计》§三 / 《模型选型与训练路线》§五）
 *
 * 用法（在服务器上，或本机配好 DATABASE_URL）：
 *   node scripts/export-dataset.mjs [输出目录]
 *
 * 产出：
 *   <out>/manifest.jsonl     每行一次拍摄：模型输出的全部框 + 家长最终采纳的框
 *   <out>/labels/<id>.txt    YOLO 格式（class cx cy w h，全部归一化）
 *   <out>/stats.json         召回/虚检/修正率统计
 *
 * 只导已完成圈题（marked=true）的拍摄——没圈完的没有真值。
 * 图片不在这里下载：image_key 存在 manifest 里，训练时再从 COS 批量拉。
 */
import { mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const out = process.argv[2] ?? "dataset";
const url = process.env.DATABASE_URL;
if (!url) { console.error("缺少 DATABASE_URL"); process.exit(1); }

const sql = postgres(url, { max: 2 });
// 只清产物，不删目录本身——out 常常是 docker 挂载点，rmdir 会 EBUSY
await rm(path.join(out, "manifest.jsonl"), { force: true });
await rm(path.join(out, "stats.json"), { force: true });
await rm(path.join(out, "labels"), { recursive: true, force: true });
await mkdir(path.join(out, "labels"), { recursive: true });

const captures = await sql`
  SELECT id, image_key, detected_boxes, created_at
  FROM capture WHERE marked = true ORDER BY created_at`;

/** IoU：两个框重叠面积 / 并集面积。0 = 不沾边，1 = 完全重合。
 *  这里只用它把「家长的框」和「模型的框」配对，判断模型有没有框到这道题。 */
function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}
const MATCH = 0.5; // 配对阈值。检出任务对框的精度要求不高，0.5 够用

const manifest = path.join(out, "manifest.jsonl");
const stat = { captures: 0, accepted: 0, fromDetected: 0, adjusted: 0, missed: 0, unusedDetected: 0 };

for (const cap of captures) {
  const problems = await sql`
    SELECT crop_box, box_origin, box_adjusted FROM problem WHERE source_capture_id = ${cap.id}`;
  if (!problems.length) continue;

  const detected = cap.detected_boxes?.boxes ?? [];
  const accepted = problems.map((p) => ({
    box: p.crop_box, origin: p.box_origin, adjusted: p.box_adjusted,
  }));

  stat.captures++;
  stat.accepted += accepted.length;
  stat.fromDetected += accepted.filter((a) => a.origin === "detected").length;
  stat.adjusted += accepted.filter((a) => a.adjusted).length;
  // 漏检：家长手画的框，模型一个都没沾上
  stat.missed += accepted.filter(
    (a) => a.origin === "manual" && !detected.some((d) => iou(d, a.box) >= MATCH)).length;
  // 虚检：模型给了但没有任何家长的框与之对应
  stat.unusedDetected += detected.filter(
    (d) => !accepted.some((a) => iou(d, a.box) >= MATCH)).length;

  await appendFile(manifest, JSON.stringify({
    captureId: cap.id, imageKey: cap.image_key,
    model: cap.detected_boxes?.model ?? null, ms: cap.detected_boxes?.ms ?? null,
    detected, accepted,
  }) + "\n");

  // YOLO：单类别（题目），中心点 + 宽高，全部归一化
  await writeFile(path.join(out, "labels", `${cap.id}.txt`),
    accepted.map(({ box: b }) =>
      `0 ${(b.x + b.w / 2).toFixed(6)} ${(b.y + b.h / 2).toFixed(6)} ${b.w.toFixed(6)} ${b.h.toFixed(6)}`
    ).join("\n") + "\n");
}

await writeFile(path.join(out, "stats.json"), JSON.stringify(stat, null, 2));
await sql.end();

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");
console.log(`导出到 ${out}/`);
console.log(`  拍摄        ${stat.captures} 次`);
console.log(`  错题框      ${stat.accepted} 个`);
console.log(`  来自模型    ${stat.fromDetected} (${pct(stat.fromDetected, stat.accepted)})`);
console.log(`  被家长改过  ${stat.adjusted} (${pct(stat.adjusted, stat.fromDetected)})`);
console.log(`  模型漏检    ${stat.missed} (${pct(stat.missed, stat.accepted)})`);
console.log(`  模型虚检    ${stat.unusedDetected} 个（家长没采纳的框）`);
