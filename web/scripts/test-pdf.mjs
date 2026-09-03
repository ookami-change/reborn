/* 复习卷 PDF 的排版断言（node --experimental-strip-types scripts/test-pdf.mjs）
 *
 * 这些数字不是凭空定的，是把 PDF 渲染成 PNG 逐项量出来的：
 * 口算行的题图只有 34pt 高，作答区按 0.6 比例算就只剩 7.2mm，孩子写不下。
 * 作答区按题图高度成比例本身是错的——孩子的字高固定，跟题图多高无关。
 */
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { answerHeight, renderReviewSheet } from "../lib/pdf.ts";



let pass = 0, fail = 0;
const ok = (cond, msg) => (cond ? (pass++, console.log(`  ✓ ${msg}`)) : (fail++, console.log(`  ✗ ${msg}`)));
const mm = (pt) => (pt * 25.4) / 72;

const page = await sharp("public/sample-homework.jpg").jpeg().toBuffer();
const meta = await sharp(page).metadata();
const crop = (b) =>
  sharp(page).extract({
    left: Math.round(b.x * meta.width), top: Math.round(b.y * meta.height),
    width: Math.round(b.w * meta.width), height: Math.round(b.h * meta.height),
  }).jpeg({ quality: 90 }).toBuffer();

const URL_ = "http://124.223.185.175/reborn/review/R07/collect";
const base = { childName: "娃", shortCode: "R07", collectUrl: URL_, perPage: 5, withAnswerPage: true };

const thin = await crop({ x: 0.06, y: 0.14, w: 0.88, h: 0.045 }); // 口算行，最扁
const tall = await crop({ x: 0.06, y: 0.62, w: 0.88, h: 0.30 }); // 应用题，最高

console.log("答案页");
{
  const pdf = await renderReviewSheet({ ...base,
    items: [{ code: "1", jpeg: thin, maskBoxes: [], correctAnswer: "" },
            { code: "2", jpeg: thin, maskBoxes: [], correctAnswer: "" }] });
  const n = (await PDFDocument.load(pdf)).getPageCount();
  ok(n === 1, `答案全空时不生成答案页（${n} 页）`);
}
{
  const pdf = await renderReviewSheet({ ...base,
    items: [{ code: "1", jpeg: thin, maskBoxes: [], correctAnswer: "42" },
            { code: "2", jpeg: thin, maskBoxes: [], correctAnswer: "" }] });
  const n = (await PDFDocument.load(pdf)).getPageCount();
  ok(n === 2, `有一个答案就生成答案页（${n} 页）`);
}

console.log("作答区高度（answerHeight 是出过 bug 的那个函数）");
{
  // 口算行：题图 1280×90px 缩到 483pt 宽 → 34pt 高。
  // 旧代码 34×0.6 = 20pt = 7.2mm，孩子写不下。
  ok(mm(answerHeight(34)) >= 11, `扁题 imgH=34pt → ${mm(answerHeight(34)).toFixed(1)}mm ≥ 11mm`);
  ok(mm(answerHeight(10)) >= 11, `极扁题 imgH=10pt 也不塌 → ${mm(answerHeight(10)).toFixed(1)}mm`);
  // 大应用题：题图 226pt → 旧代码 136pt = 48mm，还行；但更大的图会失控
  ok(mm(answerHeight(600)) <= 62, `超高题 imgH=600pt → ${mm(answerHeight(600)).toFixed(1)}mm ≤ 62mm，不浪费整页`);
  // 中间段保持原比例，别把正常题也压扁或撑大
  ok(Math.abs(answerHeight(200) - 120) < 0.01, `中等题 imgH=200pt 仍按 0.6 比例 = 120pt`);
  ok(answerHeight(100) < answerHeight(300), "高度随题图单调不减");
}

console.log("不跨页截断");
{
  const items = Array.from({ length: 6 }, (_, i) =>
    ({ code: String(i + 1), jpeg: tall, maskBoxes: [], correctAnswer: "x" }));
  const pdf = await renderReviewSheet({ ...base, items, perPage: 5 });
  const n = (await PDFDocument.load(pdf)).getPageCount();
  ok(n >= 4, `6 道高题分到多页而不是硬塞（${n} 页，含答案页）`);
}

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
