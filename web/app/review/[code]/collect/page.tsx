"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/paths";

type Item = { seq: number; code: string; problemId: string; correctAnswer: string; cropImageUrl: string | null };
type Sheet = { shortCode: string; status: string; pdfUrl: string | null; items: Item[] };
type Summary = { rightCount: number; wrongCount: number; resetCount: number; masteredCount: number };

export default function CollectPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, "right" | "wrong">>({});
  /** 圈题时没填答案的，在这里顺手补（痛点§2.4）。key 是 problemId */
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(apiUrl(`/api/review/sheets/${code}`))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("找不到这张卷"))))
      .then(setSheet)
      .catch((e) => setError(e.message));
  }, [code]);

  if (error) return <Center>{error}</Center>;
  if (!sheet) return <Center>加载中…</Center>;

  if (summary) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-3xl font-semibold tabular-nums">
          对 {summary.rightCount} 道，错 {summary.wrongCount} 道
        </p>
        <p className="text-sm text-neutral-500">
          {summary.wrongCount > 0 && `${summary.wrongCount} 道已回到第 1 档，明天再练。`}
          {summary.masteredCount > 0 && `${summary.masteredCount} 道已掌握，退出复习。`}
        </p>
        <Link href="/" className="mt-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white">
          回首页
        </Link>
      </div>
    );
  }

  const done = sheet.items.every((i) => marks[i.problemId]);
  const collected = sheet.status === "collected";

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/review/sheets/${code}/collect`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: sheet.items.map((i) => ({
            problemId: i.problemId,
            verdict: marks[i.problemId],
            correctAnswer: answers[i.problemId],
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "提交失败");
      setSummary(d);
    } catch (e) {
      setBusy(false);
      alert(e instanceof Error ? e.message : "提交失败");
    }
  };

  return (
    <div className="min-h-dvh bg-white pb-28 dark:bg-neutral-950">
      <header className="sticky top-0 flex items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <h1 className="flex-1 font-semibold">录入 {sheet.shortCode} 的结果</h1>
        {sheet.pdfUrl && (
          <a href={sheet.pdfUrl} target="_blank" rel="noreferrer" className="text-sm text-neutral-500">
            看卷子
          </a>
        )}
      </header>

      {collected ? (
        <p className="p-8 text-center text-sm text-neutral-500">这张卷已经录过了。</p>
      ) : (
        <>
          <div className="flex justify-end px-4 pt-3">
            <button
              onClick={() =>
                setMarks(Object.fromEntries(sheet.items.map((i) => [i.problemId, "right" as const])))
              }
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
            >
              全部标对
            </button>
          </div>

          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {sheet.items.map((i) => (
              <li key={i.problemId} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 shrink-0 font-mono text-xs text-neutral-400">{i.code}</span>
                {i.cropImageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={i.cropImageUrl} alt="" className="h-12 w-20 shrink-0 rounded border border-neutral-200 object-cover dark:border-neutral-700" />
                )}
                {i.correctAnswer ? (
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-500">
                    {i.correctAnswer}
                  </span>
                ) : (
                  <input
                    value={answers[i.problemId] ?? ""}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [i.problemId]: e.target.value }))
                    }
                    placeholder="补正确答案"
                    className="min-w-0 flex-1 rounded-md border border-dashed border-neutral-300 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-neutral-400 focus:border-solid focus:border-red-500 dark:border-neutral-700"
                  />
                )}
                <div className="flex shrink-0 gap-2">
                  {(["right", "wrong"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setMarks((m) => ({ ...m, [i.problemId]: v }))}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-base font-bold ${
                        marks[i.problemId] === v
                          ? v === "right"
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-red-600 bg-red-600 text-white"
                          : "border-neutral-300 text-neutral-400 dark:border-neutral-600"
                      }`}
                    >
                      {v === "right" ? "✓" : "✗"}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <button
              disabled={!done || busy}
              onClick={submit}
              className="w-full rounded-xl bg-red-600 py-3.5 text-base font-semibold text-white disabled:bg-neutral-300 dark:disabled:bg-neutral-700"
            >
              {busy ? "提交中…" : done ? "提交" : `还有 ${sheet.items.filter((i) => !marks[i.problemId]).length} 道没标`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-dvh items-center justify-center text-sm text-neutral-500">{children}</div>;
}
