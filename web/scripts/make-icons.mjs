/* 生成桌面图标（node scripts/make-icons.mjs）
 *
 * 产物提交进仓库，平时不用跑；改了配色或字才需要重跑。
 * 依赖 assets/NotoSansSC-Regular.otf——那个字体太大没进 git，只在本机有。
 *
 * 不用 SVG 里写 <text>：渲染时要看机器上有没有中文字体，容器里就没有。
 * 走 fontkit 取字形轮廓再画 <path>，和 lib/pdf.ts 里印复习卷是同一套办法。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";

const RED = "#dc2626";
const GLYPH = "错";
const FILL = 0.52; // 字高占画布的比例。留白够多，安卓裁成圆形也切不到

const buf = await readFile(path.join(process.cwd(), "assets", "NotoSansSC-Regular.otf"));
const font = fontkit.create(buf);
const glyph = font.layout(GLYPH).glyphs[0];
const { minX, minY, maxX, maxY } = glyph.bbox;

function svg(size) {
  const s = (size * FILL) / (maxY - minY);
  const tx = size / 2 - ((minX + maxX) / 2) * s;
  const ty = size / 2 + ((minY + maxY) / 2) * s; // y 轴向下，所以是加
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${RED}"/>
  <g transform="translate(${tx} ${ty}) scale(${s} ${-s})"><path d="${glyph.path.toSVG()}" fill="#fff"/></g>
</svg>`;
}

const out = [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["app/apple-icon.png", 180], // Next 的文件约定，会自动生成 apple-touch-icon 标签
];
for (const [file, size] of out) {
  await sharp(Buffer.from(svg(size))).png().toFile(path.join(process.cwd(), file));
  console.log(`${file}  ${size}x${size}`);
}
