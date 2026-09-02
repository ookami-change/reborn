"use client";

import { useMemo, useRef, useState } from "react";
import MarkCanvas from "@/components/MarkCanvas";
import { MarkedBox, clampBox } from "@/lib/types";

const SAMPLE = "/sample-homework.svg";

export default function MarkPage() {
  const [src, setSrc] = useState(SAMPLE);
  const [boxes, setBoxes] = useState<MarkedBox[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => boxes.find((b) => b.id === selectedId) ?? null,
    [boxes, selectedId],
  );
  const wrongCount = boxes.filter((b) => b.wrong).length;

  const patchSelected = (p: Partial<MarkedBox>) => {
    if (!selectedId) return;
    setBoxes((bs) =>
      bs.map((b) => (b.id === selectedId ? { ...b, ...clampBox({ ...b, ...p }) } : b)),
    );
  };

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    setSrc(URL.createObjectURL(f));
    setBoxes([]);
    setSelectedId(null);
  };

  return (
    <div className="flex h-dvh flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* 顶栏 */}
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
        <div className="text-sm">
          <span className="font-semibold">圈出做错的题</span>
          <span className="ml-2 text-neutral-500">
            已圈 <b className="tabular-nums text-red-600">{wrongCount}</b> 道
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-600 active:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:active:bg-neutral-800"
          >
            换图
          </button>
          <button
            disabled={wrongCount === 0}
            className="rounded-md bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white disabled:bg-neutral-300 dark:disabled:bg-neutral-700"
          >
            下一步
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
      </header>

      {/* 画布 */}
      <div className="relative min-h-0 flex-1">
        <MarkCanvas
          src={src}
          boxes={boxes}
          onChange={setBoxes}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {boxes.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-neutral-500">
            点一下错题所在的位置就能圈出来 · 双指缩放
          </p>
        )}
      </div>

      {/* 精调滑块：仅选中框时出现 */}
      {selected && (
        <div className="shrink-0 space-y-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <Slider
            label="宽度"
            value={selected.w}
            onChange={(w) => patchSelected({ w })}
          />
          <Slider
            label="高度"
            value={selected.h}
            onChange={(h) => patchSelected({ h })}
          />
        </div>
      )}

      {/* 缩略条 */}
      <footer className="shrink-0 border-t border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
        {boxes.length === 0 ? (
          <p className="py-1.5 text-center text-xs text-neutral-400">还没有圈题</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {boxes.map((b, i) => (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className={`relative h-14 w-20 shrink-0 overflow-hidden rounded border-2 bg-neutral-100 dark:bg-neutral-800 ${
                  b.id === selectedId
                    ? "border-red-600"
                    : "border-neutral-200 dark:border-neutral-700"
                }`}
              >
                <div
                  className="absolute inset-0 bg-cover"
                  style={{
                    backgroundImage: `url(${src})`,
                    backgroundPosition: `${(b.x / Math.max(1e-6, 1 - b.w)) * 100}% ${
                      (b.y / Math.max(1e-6, 1 - b.h)) * 100
                    }%`,
                    backgroundSize: `${100 / b.w}% auto`,
                  }}
                />
                <span className="absolute left-0 top-0 bg-red-600 px-1 font-mono text-[10px] font-semibold text-white">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-xs">
      <span className="w-8 shrink-0 text-neutral-500">{label}</span>
      <input
        type="range"
        min={0.02}
        max={1}
        step={0.005}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 flex-1 accent-red-600"
      />
      <span className="w-10 shrink-0 text-right font-mono tabular-nums text-neutral-400">
        {(value * 100).toFixed(0)}%
      </span>
    </label>
  );
}
