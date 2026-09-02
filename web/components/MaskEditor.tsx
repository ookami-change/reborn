"use client";

import { useRef, useState } from "react";
import { Box, clampBox, newId } from "@/lib/types";

/* 遮罩编辑器（PRD FR-2 Step 2）
 * 在裁剪图上拖出白色矩形，盖住孩子上次写的答案。
 * 只产生坐标，不修改图片文件——组卷渲染 PDF 时才应用（TRD §5.1）。 */

type Mask = Box & { id: string };

export default function MaskEditor({
  src,
  cropBox,
  masks,
  onChange,
}: {
  src: string;
  /** 题目在原图中的归一化位置。组件只显示这一块，遮罩坐标相对这一块 */
  cropBox: Box;
  masks: Mask[];
  onChange: (m: Mask[]) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<Mask | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  // 裁剪区域的宽高比，用于撑出容器高度
  const ratio = natural
    ? (cropBox.w * natural.w) / (cropBox.h * natural.h)
    : 4;

  const norm = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        className="relative touch-none select-none overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800"
        style={{ aspectRatio: String(ratio) }}
        onPointerDown={(e) => {
          // 点在已有遮罩上 = 删除它，不开始新的绘制
          const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-mask]");
          if (hit) {
            onChange(masks.filter((m) => m.id !== hit.dataset.mask));
            return;
          }
          const p = norm(e);
          startRef.current = p;
          setDrawing({ id: newId(), x: p.x, y: p.y, w: 0, h: 0 });
        }}
        onPointerMove={(e) => {
          const s = startRef.current;
          if (!s || !drawing) return;
          const p = norm(e);
          setDrawing({
            ...drawing,
            x: Math.min(s.x, p.x),
            y: Math.min(s.y, p.y),
            w: Math.abs(p.x - s.x),
            h: Math.abs(p.y - s.y),
          });
        }}
        onPointerUp={() => {
          const d = drawing;
          startRef.current = null;
          setDrawing(null);
          // 太小的多半是误触，丢弃
          if (d && d.w > 0.02 && d.h > 0.02) onChange([...masks, { ...d, ...clampBox(d, 0.02) }]);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="题目"
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget;
            setNatural({ w: el.naturalWidth, h: el.naturalHeight });
          }}
          className="absolute max-w-none"
          style={{
            width: `${100 / cropBox.w}%`,
            left: `${(-cropBox.x / cropBox.w) * 100}%`,
            top: `${(-cropBox.y / cropBox.h) * 100}%`,
          }}
        />
        {[...masks, ...(drawing ? [drawing] : [])].map((m) => (
          <div
            key={m.id}
            data-mask={m.id}
            className="absolute border border-neutral-400 bg-white"
            style={{
              left: `${m.x * 100}%`,
              top: `${m.y * 100}%`,
              width: `${m.w * 100}%`,
              height: `${m.h * 100}%`,
            }}
          />
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        在图上拖一个白块盖住孩子写的答案 · 点白块可删除
        {masks.length > 0 && ` · 已加 ${masks.length} 块`}
      </p>
    </div>
  );
}
