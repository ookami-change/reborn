/* 本地生成复习卷 PDF 并转成 PNG，用来自查排版（不连数据库、不连 COS）。
 *
 *   node scripts/preview-sheet.mjs
 *
 * 产出 /tmp 下的 sheet.pdf 与 sheet-N.png，以及二维码解码结果。
 * 检查点：作答区够不够写、遮罩位置对不对、题目有没有跨页截断、答案页。
 */
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import sharp from "sharp";
import { renderReviewSheet } from "../lib/pdf.ts";

const run = promisify(execFile);
const OUT = process.env.OUT ?? "/tmp/reborn-preview";
await run("mkdir", ["-p", OUT]);

const page = await sharp("public/sample-homework.jpg").jpeg().toBuffer();
const meta = await sharp(page).metadata();
console.log(`原图 ${meta.width}×${meta.height}`);

/** 从整页里裁一道题出来，模拟 problem.crop_image */
const crop = async (b) =>
  sharp(page)
    .extract({
      left: Math.round(b.x * meta.width),
      top: Math.round(b.y * meta.height),
      width: Math.round(b.w * meta.width),
      height: Math.round(b.h * meta.height),
    })
    .jpeg({ quality: 90 })
    .toBuffer();

// 三种形态：窄的口算行、方的竖式、高的应用题——覆盖排版的三个极端
const specs = [
  { code: "1", box: { x: 0.06, y: 0.14, w: 0.88, h: 0.045 }, answer: "42", masks: [{ x: 0.6, y: 0.1, w: 0.35, h: 0.8 }] },
  { code: "2", box: { x: 0.06, y: 0.20, w: 0.88, h: 0.045 }, answer: "", masks: [] },
  { code: "3", box: { x: 0.06, y: 0.42, w: 0.42, h: 0.14 }, answer: "308", masks: [{ x: 0.3, y: 0.5, w: 0.6, h: 0.45 }] },
  { code: "4", box: { x: 0.06, y: 0.62, w: 0.88, h: 0.16 }, answer: "一共 156 元", masks: [] },
  { code: "5", box: { x: 0.06, y: 0.62, w: 0.88, h: 0.30 }, answer: "24 千米/小时", masks: [] },
];

const items = [];
for (const s of specs) {
  items.push({ code: s.code, jpeg: await crop(s.box), maskBoxes: s.masks, correctAnswer: s.answer });
}

const collectUrl = "http://124.223.185.175/reborn/review/R07/collect";
const pdf = await renderReviewSheet({
  childName: "测试娃", shortCode: "R07", collectUrl,
  items, perPage: 5, withAnswerPage: true,
});

const pdfPath = path.join(OUT, "sheet.pdf");
await writeFile(pdfPath, pdf);
console.log(`PDF ${(pdf.length / 1024).toFixed(0)}KB → ${pdfPath}`);

await run("pdftoppm", ["-png", "-r", "110", pdfPath, path.join(OUT, "page")]);
const { stdout } = await run("ls", [OUT]);
console.log(stdout.trim().split("\n").map((f) => "  " + f).join("\n"));
