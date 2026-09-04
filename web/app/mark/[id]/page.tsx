"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MarkCanvas from "@/components/MarkCanvas";
import MaskEditor from "@/components/MaskEditor";
import { Box, MarkedBox, clampBox } from "@/lib/types";
import { apiFetch } from "@/lib/paths";

type Mask = Box & { id: string };
type Detail = { correctAnswer: string; childAnswer: string; masks: Mask[] };

export default function MarkCapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [boxes, setBoxes] = useState<MarkedBox[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [cursor, setCursor] = useState(0);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    apiFetch(`/api/captures/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("找不到这次拍摄"))))
      .then((d) => {
        setImageUrl(d.imageUrl);
        if (d.marked) return;
        // 自动切题耗时约 10 秒，放后台跑：家长可以立刻手动圈，
        // 框到了再铺上去，任何失败都静默降级为纯手动
        setDetecting(true);
        apiFetch(`/api/captures/${id}/detect`, { method: "POST" })
          .then((r) => r.json())
          .then((r) => {
            const bs: Box[] = r.boxes ?? [];
            if (bs.length) {
              setBoxes((prev) => [
                ...bs.map((b, i) => ({
                  ...b,
                  id: `d${i}`,
                  origin: "detected" as const,
                  wrong: false,
                })),
                ...prev,
              ]);
            }
          })
          .catch(() => {})
          .finally(() => setDetecting(false));
      })
      .catch((e) => setLoadError(e.message));
  }, [id]);

  const wrong = useMemo(() => boxes.filter((b) => b.wrong), [boxes]);
  const selected = boxes.find((b) => b.id === selectedId) ?? null;
  const current = wrong[cursor];
  const detail = current ? (details[current.id] ?? { correctAnswer: "", childAnswer: "", masks: [] }) : null;

  const setDetail = (p: Partial<Detail>) => {
    if (!current) return;
    setDetails((d) => ({ ...d, [current.id]: { ...(d[current.id] ?? { correctAnswer: "", childAnswer: "", masks: [] }), ...p } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/captures/${id}/problems`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: wrong.map((b) => {
            const d = details[b.id] ?? { correctAnswer: "", childAnswer: "", masks: [] };
            return {
              cropBox: { x: b.x, y: b.y, w: b.w, h: b.h },
              maskBoxes: d.masks.map(({ x, y, w, h }) => ({ x, y, w, h })),
              correctAnswer: d.correctAnswer,
              childAnswer: d.childAnswer || undefined,
              // 训练信号：这个框是模型给的还是家长补的、有没有被改过（痛点§三）
              boxOrigin: b.origin,
              boxAdjusted: !!b.adjusted,
            };
          }),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "保存失败");
      router.push("/mistakes");
    } catch (e) {
      setSaving(false);
      alert(e instanceof Error ? e.message : "保存失败");
    }
  };

  if (loadError) return <Center>{loadError}</Center>;
  if (!imageUrl) return <Center>加载中…</Center>;

  /* ---------------- Step 2 ---------------- */
  if (step === 2 && current && detail) {
    const last = cursor === wrong.length - 1;
    return (
      <div className="flex h-dvh flex-col bg-white dark:bg-neutral-950">
        <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
          <button
            onClick={() => (cursor === 0 ? setStep(1) : setCursor(cursor - 1))}
            className="text-sm text-neutral-500"
          >
            返回
          </button>
          <span className="font-mono text-sm tabular-nums">
            {cursor + 1} / {wrong.length}
          </span>
          <span className="w-8" />
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <MaskEditor
            src={imageUrl}
            cropBox={{ x: current.x, y: current.y, w: current.w, h: current.h }}
            masks={detail.masks}
            onChange={(m) => setDetail({ masks: m })}
          />

          <Field label="正确答案">
            <input
              value={detail.correctAnswer}
              onChange={(e) => setDetail({ correctAnswer: e.target.value })}
              placeholder="可不填，回收时再补"
              className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-base outline-none focus:border-red-500 dark:border-neutral-700"
            />
          </Field>
          <Field label="孩子写的答案">
            <input
              value={detail.childAnswer}
              onChange={(e) => setDetail({ childAnswer: e.target.value })}
              placeholder="可不填"
              className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-base outline-none focus:border-red-500 dark:border-neutral-700"
            />
          </Field>
        </div>

        <footer className="shrink-0 border-t border-neutral-200 p-3 dark:border-neutral-800">
          <button
            disabled={saving}
            onClick={() => (last ? save() : setCursor(cursor + 1))}
            className="w-full rounded-lg bg-red-600 py-3 text-base font-semibold text-white disabled:bg-neutral-300 dark:disabled:bg-neutral-700"
          >
            {saving ? "保存中…" : last ? "完成" : "下一题"}
          </button>
        </footer>
      </div>
    );
  }

  /* ---------------- Step 1 ---------------- */
  return (
    <div className="flex h-dvh flex-col bg-white dark:bg-neutral-950">
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
        <div className="text-sm">
          <span className="font-semibold">圈出做错的题</span>
          <span className="ml-2 text-neutral-500">
            已圈 <b className="tabular-nums text-red-600">{wrong.length}</b> 道
          </span>
        </div>
        {/* 主路径是圈完即存。答案挪到扫码回收那一屏顺手补——那时家长
            手里有原卷和孩子重做的，本来就在逐题看（痛点§2.3） */}
        <div className="flex items-center gap-2">
          <button
            disabled={wrong.length === 0 || saving}
            onClick={() => {
              setCursor(0);
              setStep(2);
            }}
            className="rounded-md px-2.5 py-1.5 text-xs text-neutral-500 disabled:opacity-40"
          >
            逐题填答案
          </button>
          <button
            disabled={wrong.length === 0 || saving}
            onClick={save}
            className="rounded-md bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white disabled:bg-neutral-300 dark:disabled:bg-neutral-700"
          >
            {saving ? "保存中…" : `保存 ${wrong.length} 道`}
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <MarkCanvas
          src={imageUrl}
          boxes={boxes}
          onChange={setBoxes}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {boxes.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-neutral-500">
            {detecting ? "正在自动找题，也可以直接点一下自己圈" : "点一下错题所在的位置就能圈出来 · 双指缩放"}
          </p>
        )}
        {boxes.length > 0 && (
          <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-neutral-500">
            {detecting
              ? "正在自动找题…"
              : wrong.length === 0
                ? "点一下灰框，把做错的题标成红色"
                : "灰框=没选中 · 红框=已圈 · 拖角调大小"}
          </p>
        )}
      </div>

      {selected && (
        <div className="shrink-0 space-y-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <Slider label="宽度" value={selected.w} onChange={(w) => resize(selected.id, { w })} />
          <Slider label="高度" value={selected.h} onChange={(h) => resize(selected.id, { h })} />
        </div>
      )}
    </div>
  );

  function resize(bid: string, p: Partial<Box>) {
    setBoxes((bs) =>
      bs.map((b) =>
        b.id === bid
          ? { ...b, ...clampBox({ ...b, ...p }), adjusted: b.origin === "detected" || b.adjusted }
          : b,
      ),
    );
  }
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-dvh items-center justify-center text-sm text-neutral-500">{children}</div>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-neutral-500">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </span>
      {children}
    </label>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
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
