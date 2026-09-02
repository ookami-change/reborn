"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/paths";
import type { Box } from "@/lib/types";

type Attempt = {
  id: string;
  verdict: string;
  source: string;
  childAnswer: string | null;
  createdAt: string;
  originLabel: string;
};
type Detail = {
  id: string;
  cropImageUrl: string;
  maskBoxes: Box[];
  correctAnswer: string;
  boxLevel: number;
  maxBox: number;
  nextDueDate: string | null;
  status: string;
  attempts: Attempt[];
};

export default function MistakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [showMask, setShowMask] = useState(true);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch(apiUrl(`/api/mistakes/${id}`))
      .then((r) => r.json())
      .then((x) => { setD(x); setAnswer(x.correctAnswer ?? ""); });

  useEffect(() => { load(); }, [id]);

  const act = async (body: object) => {
    setBusy(true);
    await fetch(apiUrl(`/api/mistakes/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
    setBusy(false);
  };

  const remove = async () => {
    if (!confirm("删除这道错题？作答历史一并删除。")) return;
    await fetch(apiUrl(`/api/mistakes/${id}`), { method: "DELETE" });
    router.push("/mistakes");
  };

  if (!d) return <div className="p-8 text-center text-sm text-neutral-500">加载中…</div>;

  return (
    <div className="min-h-dvh bg-white pb-10 dark:bg-neutral-950">
      <header className="sticky top-0 flex items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <button onClick={() => router.back()} className="text-sm text-neutral-500">返回</button>
        <h1 className="flex-1 font-semibold">错题详情</h1>
        <button onClick={remove} className="text-sm text-neutral-400">删除</button>
      </header>

      <div className="space-y-6 p-4">
        {/* 题干图，可切换是否应用遮罩 */}
        <div>
          <div className="relative overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.cropImageUrl} alt="题目" className="block w-full" />
            {showMask &&
              d.maskBoxes.map((m, i) => (
                <div
                  key={i}
                  className="absolute bg-white"
                  style={{
                    left: `${m.x * 100}%`, top: `${m.y * 100}%`,
                    width: `${m.w * 100}%`, height: `${m.h * 100}%`,
                  }}
                />
              ))}
          </div>
          {d.maskBoxes.length > 0 && (
            <button
              onClick={() => setShowMask((v) => !v)}
              className="mt-2 text-xs text-neutral-500 underline"
            >
              {showMask ? "查看原图（含孩子答案）" : "应用遮罩"}
            </button>
          )}
        </div>

        {/* 正确答案 */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-neutral-500">正确答案</span>
          <div className="flex gap-2">
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-base outline-none focus:border-red-500 dark:border-neutral-700"
            />
            {answer !== d.correctAnswer && (
              <button
                disabled={busy || !answer.trim()}
                onClick={() => act({ correctAnswer: answer })}
                className="rounded-lg bg-red-600 px-4 text-sm font-semibold text-white disabled:bg-neutral-300"
              >
                保存
              </button>
            )}
          </div>
        </div>

        {/* 掌握状态 */}
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-500">掌握状态</span>
            <span className="text-sm font-semibold">
              {d.status === "mastered" ? "已掌握" : `第 ${d.boxLevel} / ${d.maxBox} 档`}
            </span>
          </div>
          <div className="mt-2.5 flex gap-1">
            {Array.from({ length: d.maxBox }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  d.status === "mastered" || i < d.boxLevel
                    ? "bg-red-600"
                    : "bg-neutral-200 dark:bg-neutral-700"
                }`}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            {d.status === "mastered" ? "已退出复习计划" : `下次复习 ${d.nextDueDate}`}
          </p>
          <div className="mt-3 flex gap-2">
            {d.status !== "mastered" && (
              <button
                disabled={busy}
                onClick={() => act({ action: "mark_mastered" })}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
              >
                标为已掌握
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => act({ action: "reset" })}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
            >
              重置到第 1 档
            </button>
          </div>
        </div>

        {/* 作答历史 —— 每次作答一条，不覆盖（PRD FR-3） */}
        <div>
          <h2 className="mb-2 text-xs font-medium text-neutral-500">作答历史</h2>
          <ol className="space-y-0">
            {d.attempts.map((a, i) => (
              <li key={a.id} className="flex gap-3 py-2.5">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                      a.verdict === "right" ? "bg-emerald-600" : "bg-red-600"
                    }`}
                  >
                    {a.verdict === "right" ? "✓" : "✗"}
                  </span>
                  {i < d.attempts.length - 1 && (
                    <span className="mt-1 w-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
                  )}
                </div>
                <div className="pb-1">
                  <p className="text-sm">
                    {a.originLabel}
                    {a.childAnswer && (
                      <span className="ml-2 text-neutral-500">写了 {a.childAnswer}</span>
                    )}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {new Date(a.createdAt).toLocaleString("zh-CN", {
                      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
