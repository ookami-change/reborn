"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, MarkedBox, clampBox, newId } from "@/lib/types";

/* 圈题画布（PRD FR-2 Step 1）
 *
 * 坐标系：所有框以归一化坐标（0–1，相对图片宽高）存储。
 * 渲染时框是 stage 内的百分比定位元素，因此自动跟随 stage 的
 * pan/zoom transform，无需手动换算。
 *
 * 手势分派：
 *   1 指落在把手上   → 缩放框
 *   1 指落在选中框上 → 移动框
 *   1 指落在其他框上 → 选中
 *   1 指落在空白     → 拖动 = 平移画布；未移动松手 = 在该点新建框
 *   2 指             → 双指缩放 + 平移
 */

type View = { scale: number; tx: number; ty: number };

type Drag =
  | { kind: "pan"; startX: number; startY: number; view: View; moved: boolean }
  | { kind: "move"; id: string; startX: number; startY: number; box: Box }
  | { kind: "resize"; id: string; corner: Corner; startX: number; startY: number; box: Box }
  | null;

type Corner = "nw" | "ne" | "sw" | "se";

const MIN_SCALE = 0.5;
const MAX_SCALE = 6;
/** 新建框的默认尺寸：宽 = 图宽 80%，高 = 宽 × 25%（PRD FR-2） */
const DEFAULT_W = 0.8;
const DEFAULT_H_RATIO = 0.25;
/** 判定为「点击」而非「拖动」的位移阈值（屏幕像素） */
const TAP_SLOP = 6;

export default function MarkCanvas({
  src,
  boxes,
  onChange,
  selectedId,
  onSelect,
}: {
  src: string;
  boxes: MarkedBox[];
  onChange: (next: MarkedBox[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const [ready, setReady] = useState(false);

  const dragRef = useRef<Drag>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; cx: number; cy: number; view: View } | null>(null);

  /* stage 的像素尺寸，用于把屏幕位移换算成归一化位移 */
  const stageSize = useCallback(() => {
    const el = stageRef.current;
    if (!el) return { w: 1, h: 1 };
    const r = el.getBoundingClientRect();
    // getBoundingClientRect 已含 scale，除回去得到未缩放尺寸
    return { w: r.width / view.scale, h: r.height / view.scale };
  }, [view.scale]);

  const toNorm = useCallback(
    (dxPx: number, dyPx: number) => {
      const { w, h } = stageSize();
      return { dx: dxPx / view.scale / w, dy: dyPx / view.scale / h };
    },
    [stageSize, view.scale],
  );

  /* 拖动/缩放的唯一入口。detected 的框一旦被改，就打上 adjusted——
   * 这是模型框位置不准的证据，落库后成为框回归的训练样本（痛点§三） */
  const patch = useCallback(
    (id: string, box: Box) => {
      onChange(
        boxes.map((b) =>
          b.id === id
            ? { ...b, ...clampBox(box), adjusted: b.origin === "detected" || b.adjusted }
            : b,
        ),
      );
    },
    [boxes, onChange],
  );

  /* ---------- 指针事件 ---------- */

  const onPointerDown = (e: React.PointerEvent) => {
    // 某些浏览器在指针已释放/非活跃时会抛 NotFoundError，捕获后继续走正常流程
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        view,
      };
      dragRef.current = null;
      return;
    }

    const target = e.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-handle]");
    const boxEl = target.closest<HTMLElement>("[data-box]");

    if (handle && boxEl) {
      const id = boxEl.dataset.box!;
      const box = boxes.find((b) => b.id === id);
      if (box) {
        dragRef.current = {
          kind: "resize",
          id,
          corner: handle.dataset.handle as Corner,
          startX: e.clientX,
          startY: e.clientY,
          box: { x: box.x, y: box.y, w: box.w, h: box.h },
        };
      }
      return;
    }

    if (boxEl) {
      const id = boxEl.dataset.box!;
      const box = boxes.find((b) => b.id === id);
      if (!box) return;
      if (id !== selectedId) onSelect(id);
      dragRef.current = {
        kind: "move",
        id,
        startX: e.clientX,
        startY: e.clientY,
        box: { x: box.x, y: box.y, w: box.w, h: box.h },
      };
      return;
    }

    dragRef.current = {
      kind: "pan",
      startX: e.clientX,
      startY: e.clientY,
      view,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    /* 双指缩放 */
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const p = pinchRef.current;
      const ratio = dist / p.dist;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.view.scale * ratio));
      const k = scale / p.view.scale;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      setView({
        scale,
        tx: cx - (p.cx - p.view.tx) * k + (cx - p.cx),
        ty: cy - (p.cy - p.view.ty) * k + (cy - p.cy),
      });
      return;
    }

    const d = dragRef.current;
    if (!d) return;
    const dxPx = e.clientX - d.startX;
    const dyPx = e.clientY - d.startY;

    if (d.kind === "pan") {
      if (!d.moved && Math.hypot(dxPx, dyPx) > TAP_SLOP) d.moved = true;
      if (d.moved) setView({ ...d.view, tx: d.view.tx + dxPx, ty: d.view.ty + dyPx });
      return;
    }

    const { dx, dy } = toNorm(dxPx, dyPx);

    if (d.kind === "move") {
      patch(d.id, { ...d.box, x: d.box.x + dx, y: d.box.y + dy });
      return;
    }

    // resize：按拖动的角计算新的 x/y/w/h
    const b = d.box;
    let { x, y, w, h } = b;
    if (d.corner === "se") {
      w = b.w + dx;
      h = b.h + dy;
    } else if (d.corner === "sw") {
      x = b.x + dx;
      w = b.w - dx;
      h = b.h + dy;
    } else if (d.corner === "ne") {
      y = b.y + dy;
      w = b.w + dx;
      h = b.h - dy;
    } else {
      x = b.x + dx;
      y = b.y + dy;
      w = b.w - dx;
      h = b.h - dy;
    }
    patch(d.id, { x, y, w, h });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;

    /* 空白处未移动 = 点击 → 在该点新建框 */
    if (d.kind === "pan" && !d.moved) {
      const stage = stageRef.current;
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
        onSelect(null);
        return;
      }
      const { w: sw, h: sh } = stageSize();
      const h = (DEFAULT_W * DEFAULT_H_RATIO * sw) / sh; // 高 = 宽的25%，按像素等比换算回归一化
      const box = clampBox({ x: nx - DEFAULT_W / 2, y: ny - h / 2, w: DEFAULT_W, h });
      const id = newId();
      onChange([...boxes, { id, origin: "manual", wrong: true, ...box }]);
      onSelect(id);
    }
  };

  /* 图片可能在 React 挂载前就已从缓存加载完成，此时 onLoad 不会触发，需主动补判 */
  useEffect(() => {
    setReady(false);
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setReady(true);
  }, [src]);

  /* 滚轮缩放（桌面调试用） */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setView((v) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * (1 - e.deltaY / 500)));
        const k = scale / v.scale;
        const r = el.getBoundingClientRect();
        const cx = e.clientX - r.left;
        const cy = e.clientY - r.top;
        return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const inv = 1 / view.scale;

  return (
    <div
      ref={viewportRef}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-neutral-100 dark:bg-neutral-900"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={stageRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          width: "100%",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt="作业照片"
          draggable={false}
          onLoad={() => setReady(true)}
          className="block w-full"
        />

        {ready &&
          boxes.map((b, i) => {
            const sel = b.id === selectedId;
            return (
              <div
                key={b.id}
                data-box={b.id}
                className="absolute"
                style={{
                  left: `${b.x * 100}%`,
                  top: `${b.y * 100}%`,
                  width: `${b.w * 100}%`,
                  height: `${b.h * 100}%`,
                  outline: `${(sel ? 2.5 : 1.5) * inv}px solid ${
                    b.wrong ? "rgb(220 38 38)" : "rgba(120,120,120,.75)"
                  }`,
                  background: b.wrong
                    ? "rgba(220,38,38,.10)"
                    : "rgba(140,140,140,.10)",
                  borderRadius: `${3 * inv}px`,
                }}
              >
                {/* 序号 */}
                <span
                  className="pointer-events-none absolute font-mono font-semibold text-white"
                  style={{
                    left: 0,
                    top: 0,
                    transform: `scale(${inv})`,
                    transformOrigin: "top left",
                    background: b.wrong ? "rgb(220 38 38)" : "rgb(120 120 120)",
                    padding: "1px 5px",
                    fontSize: 11,
                    borderRadius: "3px 0 3px 0",
                  }}
                >
                  {i + 1}
                </span>

                {sel && (
                  <>
                    {(["nw", "ne", "sw", "se"] as Corner[]).map((c) => (
                      <span
                        key={c}
                        data-handle={c}
                        className="absolute rounded-full border-2 border-red-600 bg-white"
                        style={{
                          width: 18 * inv,
                          height: 18 * inv,
                          left: c[1] === "w" ? 0 : "100%",
                          top: c[0] === "n" ? 0 : "100%",
                          marginLeft: -9 * inv,
                          marginTop: -9 * inv,
                        }}
                      />
                    ))}
                    <button
                      aria-label="删除这道题"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(boxes.filter((x) => x.id !== b.id));
                        onSelect(null);
                      }}
                      className="absolute flex items-center justify-center rounded-full bg-neutral-800 font-bold text-white"
                      style={{
                        width: 22 * inv,
                        height: 22 * inv,
                        right: 0,
                        top: 0,
                        marginRight: -11 * inv,
                        marginTop: -11 * inv,
                        fontSize: 13 * inv,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
