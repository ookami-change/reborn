"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/paths";

type Item = {
  cardId: string;
  problemId: string;
  cropImageUrl: string;
  correctAnswer: string;
  nextDueDate: string;
  boxLevel: number;
};

const MIN_ITEMS = 4;

export default function NewSheetPage() {
  const router = useRouter();
  const [due, setDue] = useState<Item[]>([]);
  const [upcoming, setUpcoming] = useState<Item[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/review/due"))
      .then((r) => r.json())
      .then((d) => {
        setDue(d.due);
        setUpcoming(d.upcoming);
        setPicked(new Set(d.due.map((x: Item) => x.problemId)));
        setLoading(false);
      });
  }, []);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const fillUp = () => {
    const need = MIN_ITEMS - picked.size;
    setPicked((s) => new Set([...s, ...upcoming.slice(0, need).map((x) => x.problemId)]));
  };

  const generate = async () => {
    setBusy(true);
    try {
      const all = [...due, ...upcoming];
      const ordered = all.filter((x) => picked.has(x.problemId)).map((x) => x.problemId);
      const res = await fetch(apiUrl("/api/review/sheets"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemIds: ordered, perPage: 5 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "生成失败");
      router.push(`/review/${d.shortCode}/collect`);
    } catch (e) {
      setBusy(false);
      alert(e instanceof Error ? e.message : "生成失败");
    }
  };

  if (loading) return <p className="p-8 text-center text-sm text-neutral-500">加载中…</p>;

  const short = picked.size < MIN_ITEMS && upcoming.length > 0;

  return (
    <div className="min-h-dvh bg-white pb-28 dark:bg-neutral-950">
      <header className="sticky top-0 flex items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <button onClick={() => router.back()} className="text-sm text-neutral-500">返回</button>
        <h1 className="flex-1 font-semibold">生成复习卷</h1>
        <span className="text-xs tabular-nums text-neutral-500">选了 {picked.size} 道</span>
      </header>

      {short && (
        <div className="m-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          只有 {picked.size} 道到期，题太少不值得打印。
          <button onClick={fillUp} className="ml-1 font-semibold text-amber-700 underline dark:text-amber-400">
            加入 {Math.min(MIN_ITEMS - picked.size, upcoming.length)} 道即将到期的
          </button>
        </div>
      )}

      <Section title={`到期 ${due.length} 道`} items={due} picked={picked} toggle={toggle} />
      {upcoming.length > 0 && (
        <Section title={`即将到期 ${upcoming.length} 道`} items={upcoming} picked={picked} toggle={toggle} dim />
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
        <button
          disabled={picked.size === 0 || busy}
          onClick={generate}
          className="w-full rounded-xl bg-red-600 py-3.5 text-base font-semibold text-white disabled:bg-neutral-300 dark:disabled:bg-neutral-700"
        >
          {busy ? "生成中…" : `生成 PDF（${picked.size} 道）`}
        </button>
      </div>
    </div>
  );
}

function Section({
  title, items, picked, toggle, dim,
}: {
  title: string; items: Item[]; picked: Set<string>; toggle: (id: string) => void; dim?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className={dim ? "opacity-80" : ""}>
      <h2 className="px-4 pb-1 pt-4 text-xs font-medium text-neutral-500">{title}</h2>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {items.map((m) => {
          const on = picked.has(m.problemId);
          return (
            <li key={m.problemId}>
              <button
                onClick={() => toggle(m.problemId)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-xs font-bold text-white ${
                    on ? "border-red-600 bg-red-600" : "border-neutral-300 dark:border-neutral-600"
                  }`}
                >
                  {on ? "✓" : ""}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.cropImageUrl} alt="" className="h-12 w-20 shrink-0 rounded border border-neutral-200 object-cover dark:border-neutral-700" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">答案 <b>{m.correctAnswer}</b></p>
                  <p className="text-xs text-neutral-500">第 {m.boxLevel} 档 · {m.nextDueDate}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
