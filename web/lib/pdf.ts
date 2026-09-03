import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFImage, PDFPage, rgb, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import type { Box } from "@/lib/types";

/* A4 复习卷渲染（PRD §6 / TRD §6）
 *
 * 三个关键点：
 * 1. 遮罩在这里才生效——数据库只存坐标，题图文件本身从不被修改。
 * 2. 题目不允许跨页截断，放不下就整题移到下一页。
 * 3. 中文一律以字形轮廓绘制，不内嵌字体。pdf-lib 对 CFF/OTF 与变量字体的
 *    子集化都会产生错误的字形映射（实测中文与数字全部乱码），而不做子集化
 *    会让每个 PDF 膨胀到 7MB 以上。画轮廓两个问题都没有，代价是 PDF 内的
 *    文字不可选中——对打印用的卷子无所谓。 */

const PT = {
  pageW: 595,
  pageH: 842,
  margin: 40,
  headerH: 76,
  /** 二维码边长。48 字的回收链接是 33×33 模块，50pt 时单模块只有 0.53mm，
   *  正好卡在家用打印机的可靠阈值上。扫码是闭环的硬依赖，宁可多占 14pt。 */
  qr: 64,
  codeW: 24,
  gap: 16,
  answerRatio: 0.6, // 作答区高度 = 题图高度 × 0.6，再按下面的上下限钳制
  /** 下限 12mm：孩子写一行数字的最小高度。
   *  没有下限时一道口算行的题图只有 34pt 高，作答区就只剩 7.2mm，写不下——
   *  作答区按题图高度成比例是错的，孩子的字高是固定的，跟题图多高无关。 */
  answerMin: 34,
  /** 上限 60mm：再大就是纯浪费纸。大应用题的题图 226pt 高时作答区会到 136pt。 */
  answerMax: 170,
};

/** 作答区高度：按题图比例，但钳在一行手写高度和半页之间。导出供测试断言。 */
export const answerHeight = (imgH: number) =>
  Math.min(PT.answerMax, Math.max(PT.answerMin, imgH * PT.answerRatio));
const CONTENT_W = PT.pageW - PT.margin * 2; // 515
const IMAGE_W = CONTENT_W - PT.codeW - 8; // 483

export type SheetItemInput = {
  code: string;
  jpeg: Buffer;
  maskBoxes: Box[];
  correctAnswer: string;
};

type Fk = { unitsPerEm: number; layout: (t: string) => { glyphs: FkGlyph[] } };
type FkGlyph = { advanceWidth: number; path?: { scale: (x: number, y: number) => { toSVG: () => string } } };

let fontCache: Fk | null = null;
async function cjkFont(): Promise<Fk> {
  if (!fontCache) {
    const buf = await readFile(path.join(process.cwd(), "assets", "NotoSansSC-Regular.otf"));
    fontCache = (fontkit as unknown as { create: (b: Buffer) => Fk }).create(buf);
  }
  return fontCache;
}

/** 按字形轮廓绘制一行文字。x/y 为基线左端，返回绘制宽度。 */
function drawText(
  page: PDFPage,
  font: Fk,
  text: string,
  opts: { x: number; y: number; size: number; color?: RGB },
): number {
  const scale = opts.size / font.unitsPerEm;
  const color = opts.color ?? rgb(0, 0, 0);
  let penX = opts.x;
  for (const g of font.layout(text).glyphs) {
    // fontkit 字形 y 轴向上，drawSvgPath 按 SVG y 轴向下再翻一次，先抵消
    const d = g.path?.scale(1, -1).toSVG();
    if (d) page.drawSvgPath(d, { x: penX, y: opts.y, scale, color, borderWidth: 0 });
    penX += g.advanceWidth * scale;
  }
  return penX - opts.x;
}

export async function renderReviewSheet(opts: {
  childName: string;
  shortCode: string;
  collectUrl: string;
  items: SheetItemInput[];
  perPage: number;
  withAnswerPage: boolean;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await cjkFont();

  const qrPng = await QRCode.toBuffer(opts.collectUrl, { margin: 0, width: 200 });
  const qrImg = await doc.embedPng(qrPng);

  const dateText = new Date().toLocaleDateString("zh-CN");
  let page = doc.addPage([PT.pageW, PT.pageH]);
  let y = drawHeader(page, font, qrImg, opts.childName, opts.shortCode, dateText, opts.collectUrl);
  let onPage = 0;

  for (const item of opts.items) {
    const img = await doc.embedJpg(item.jpeg);
    const scale = IMAGE_W / img.width;
    const imgH = img.height * scale;
    const blockH = imgH + answerHeight(imgH) + PT.gap;

    // 放不下就换页，绝不截断题目
    if (onPage >= opts.perPage || y - blockH < PT.margin) {
      page = doc.addPage([PT.pageW, PT.pageH]);
      y = drawHeader(page, font, qrImg, opts.childName, opts.shortCode, dateText, opts.collectUrl);
      onPage = 0;
    }

    const imgX = PT.margin + PT.codeW + 8;
    const imgY = y - imgH;

    drawText(page, font, item.code, {
      x: PT.margin,
      y: y - 13,
      size: 11,
      color: rgb(0.45, 0.45, 0.45),
    });
    page.drawImage(img, { x: imgX, y: imgY, width: IMAGE_W, height: imgH });

    // 遮罩：盖住孩子上次写的答案。坐标相对题图，左上原点 → PDF 左下原点
    for (const m of item.maskBoxes) {
      page.drawRectangle({
        x: imgX + m.x * IMAGE_W,
        y: imgY + imgH - (m.y + m.h) * imgH,
        width: m.w * IMAGE_W,
        height: m.h * imgH,
        color: rgb(1, 1, 1),
      });
    }

    // 作答区：一条底线，其余留白
    const answerH = answerHeight(imgH);
    page.drawLine({
      start: { x: imgX, y: imgY - answerH + 4 },
      end: { x: imgX + IMAGE_W, y: imgY - answerH + 4 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    y = imgY - answerH - PT.gap;
    onPage++;
  }

  // 正确答案是可选的：没填的题不占答案页的行，一道都没有就整页不生成，
  // 否则印出来是一列光秃秃的题号（痛点§2.4）
  const answered = opts.items.filter((i) => i.correctAnswer.trim());
  if (opts.withAnswerPage && answered.length) {
    const ap = doc.addPage([PT.pageW, PT.pageH]);
    let ay = PT.pageH - PT.margin;
    drawText(ap, font, `${opts.shortCode} 答案`, { x: PT.margin, y: ay - 16, size: 14 });
    ay -= 40;
    for (const item of answered) {
      if (ay < PT.margin) break;
      drawText(ap, font, `${item.code}    ${item.correctAnswer}`, {
        x: PT.margin,
        y: ay,
        size: 12,
      });
      ay -= 22;
    }
  }

  return Buffer.from(await doc.save());
}

function drawHeader(
  page: PDFPage,
  font: Fk,
  qr: PDFImage,
  childName: string,
  shortCode: string,
  dateText: string,
  collectUrl: string,
): number {
  const top = PT.pageH - PT.margin;
  drawText(page, font, `${childName} · ${shortCode} · ${dateText}`, {
    x: PT.margin,
    y: top - 12,
    size: 11,
    color: rgb(0.3, 0.3, 0.3),
  });
  // 扫码失败时的退路。没有这一行，二维码扫不出来家长就完全无法录结果，
  // 整个闭环断在最后一步。
  drawText(page, font, collectUrl, {
    x: PT.margin,
    y: top - 26,
    size: 7,
    color: rgb(0.6, 0.6, 0.6),
  });
  page.drawImage(qr, {
    x: PT.pageW - PT.margin - PT.qr,
    y: top - PT.qr,
    width: PT.qr,
    height: PT.qr,
  });
  page.drawLine({
    start: { x: PT.margin, y: top - PT.headerH + 8 },
    end: { x: PT.pageW - PT.margin, y: top - PT.headerH + 8 },
    thickness: 0.8,
    color: rgb(0.8, 0.8, 0.8),
  });
  return top - PT.headerH;
}
