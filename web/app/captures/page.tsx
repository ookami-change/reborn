"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/paths";

type Item = { id: string; imageUrl: string; sourceType: string; createdAt: string };

/** 待整理：拍了还没圈题的作业，点进去继续圈题（/mark/[id]）。 */
export default function PendingCapturesPage() {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/captures"))
      .then((r) => r.json())
      .then((d) => setItems(d.items));
  }, []);

  return (
    <div className="min-h-dvh bg-white pb-20 dark:bg-neutral-950">
      <header className="sticky top-0 flex items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <Link href="/" className="text-sm text-neutral-500">返回</Link>
        <h1 className="flex-1 font-semibold">待整理</h1>
        <span className="text-xs text-neutral-500 tabular-nums">{items ? `${items.length} 张` : ""}</span>
      </header>

      {items === null && <p className="p-8 text-center text-sm text-neutral-500">加载中…</p>}
      {items?.length === 0 && (
        <p className="p-8 text-center text-sm text-neutral-500">
          没有待整理的作业，去<Link href="/capture" className="text-red-600">拍一份</Link>
        </p>
      )}

      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {items?.map((c) => (
          <li key={c.id}>
            <Link
              href={`/mark/${c.id}`}
              className="flex items-center gap-3 px-4 py-3 active:bg-neutral-50 dark:active:bg-neutral-900"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.imageUrl}
                alt=""
                className="h-20 w-16 shrink-0 rounded border border-neutral-200 object-cover dark:border-neutral-700"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">继续圈题 ›</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {new Date(c.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
