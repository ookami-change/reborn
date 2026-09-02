"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/paths";

type Item = {
  id: string;
  cropImageUrl: string;
  correctAnswer: string;
  boxLevel: number;
  nextDueDate: string | null;
  status: string;
};

export default function MistakesPage() {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/mistakes"))
      .then((r) => r.json())
      .then((d) => setItems(d.items));
  }, []);

  return (
    <div className="min-h-dvh bg-white pb-20 dark:bg-neutral-950">
      <header className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <h1 className="font-semibold">错题本</h1>
        <span className="text-xs text-neutral-500 tabular-nums">
          {items ? `${items.length} 道` : ""}
        </span>
      </header>

      {items === null && <p className="p-8 text-center text-sm text-neutral-500">加载中…</p>}
      {items?.length === 0 && (
        <p className="p-8 text-center text-sm text-neutral-500">
          还没有错题，去<Link href="/capture" className="text-red-600">拍一份作业</Link>
        </p>
      )}

      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {items?.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.cropImageUrl}
              alt=""
              className="h-16 w-24 shrink-0 rounded border border-neutral-200 object-cover dark:border-neutral-700"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                答案 <b>{m.correctAnswer}</b>
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {m.status === "mastered" ? "已掌握" : `第 ${m.boxLevel} 档 · ${m.nextDueDate} 复习`}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <Link
        href="/capture"
        className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-lg"
      >
        拍作业
      </Link>
    </div>
  );
}
