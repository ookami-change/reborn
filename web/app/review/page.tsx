"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/paths";

type Item = {
  shortCode: string;
  status: string;
  createdAt: string;
  itemCount: number;
  pdfUrl: string | null;
};

/** 复习卷列表：待回收的可点进去录结果，已回收的只做记录。 */
export default function ReviewSheetsPage() {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/review/sheets"))
      .then((r) => r.json())
      .then((d) => setItems(d.items));
  }, []);

  return (
    <div className="min-h-dvh bg-white pb-20 dark:bg-neutral-950">
      <header className="sticky top-0 flex items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <Link href="/" className="text-sm text-neutral-500">返回</Link>
        <h1 className="flex-1 font-semibold">复习卷</h1>
        <Link href="/review/new" className="text-sm font-semibold text-red-600">新建</Link>
      </header>

      {items === null && <p className="p-8 text-center text-sm text-neutral-500">加载中…</p>}
      {items?.length === 0 && (
        <p className="p-8 text-center text-sm text-neutral-500">
          还没有复习卷，<Link href="/review/new" className="text-red-600">去生成一张</Link>
        </p>
      )}

      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {items?.map((s) => {
          const collected = s.status === "collected";
          const row = (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="font-mono text-sm font-semibold tabular-nums">{s.shortCode}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{s.itemCount} 道题</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {new Date(s.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  collected
                    ? "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"
                    : "bg-red-50 font-medium text-red-600 dark:bg-red-950/50"
                }`}
              >
                {collected ? "已回收" : "待回收 ›"}
              </span>
            </div>
          );
          return (
            <li key={s.shortCode}>
              {collected ? (
                <div className="opacity-70">{row}</div>
              ) : (
                <Link href={`/review/${s.shortCode}/collect`} className="block active:bg-neutral-50 dark:active:bg-neutral-900">
                  {row}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
