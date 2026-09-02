/** 归一化坐标框：x/y/w/h 均为 0–1 的小数，表示占图片宽高的比例。
 *  全项目统一使用归一化坐标，禁止存像素值（见 TRD §2.3）。 */
export type Box = { x: number; y: number; w: number; h: number };

export type MarkedBox = Box & {
  id: string;
  /** 来源：detected = 系统自动切题，manual = 家长手动添加 */
  origin: "detected" | "manual";
  /** 是否被家长标记为错题 */
  wrong: boolean;
};

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 把框约束在图片范围内，同时保证最小尺寸 */
export function clampBox(b: Box, min = 0.02): Box {
  const w = Math.min(1, Math.max(min, b.w));
  const h = Math.min(1, Math.max(min, b.h));
  return {
    w,
    h,
    x: Math.min(1 - w, Math.max(0, b.x)),
    y: Math.min(1 - h, Math.max(0, b.y)),
  };
}

export const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
