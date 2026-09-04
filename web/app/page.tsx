"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, apiUrl } from "@/lib/paths";

type Home = {
  dueCount: number;
  earliestDueDate: string | null;
  unmarkedCaptureCount: number;
  pendingSheetCount: number;
  totalMistakes: number;
  learningCount: number;
  masteredCount: number;
};

export default function HomePage() {
  const [d, setD] = useState<Home | null>(null);

  useEffect(() => {
    apiFetch("/api/home").then((r) => r.json()).then(setD);
  }, []);

  return (
    <div className="min-h-dvh bg-neutral-50 pb-8 dark:bg-neutral-950">
      <header className="flex items-start justify-between px-5 pb-4 pt-8">
        <div>
          <h1 className="text-2xl font-semibold">今天</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}
          </p>
        </div>
        <button
          onClick={async () => {
            await apiFetch("/api/auth/logout", { method: "POST" });
            window.location.href = apiUrl("/login");
          }}
          className="mt-1 text-xs text-neutral-400"
        >
          退出
        </button>
      </header>

      <div className="space-y-3 px-5">
        <Card
          href="/review/new"
          disabled={!d || d.learningCount === 0}
          title="今天要复习"
          value={d ? `${d.dueCount} 道` : "…"}
          hint={
            !d
              ? ""
              : d.dueCount > 0
                ? "生成复习卷 ›"
                : d.learningCount > 0
                  ? "没有到期的，也可挑几道生成复习卷 ›"
                  : "还没有复习中的题"
          }
          accent
        />

        {d && d.unmarkedCaptureCount > 0 && (
          <Card
            href="/captures"
            title="待整理"
            value={`${d.unmarkedCaptureCount} 张`}
            hint="有作业拍了还没圈题"
          />
        )}

        {d && d.pendingSheetCount > 0 && (
          <Card
            href="/review"
            title="待回收"
            value={`${d.pendingSheetCount} 张卷`}
            hint="孩子做完了就来录结果"
          />
        )}

        <Link
          href="/mistakes"
          className="block rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="grid grid-cols-3 divide-x divide-neutral-100 dark:divide-neutral-800">
            <Stat label="全部" value={d?.totalMistakes} />
            <Stat label="复习中" value={d?.learningCount} />
            <Stat label="已掌握" value={d?.masteredCount} />
          </div>
        </Link>
      </div>

      <div className="px-5 pt-6">
        <Link
          href="/capture"
          className="block rounded-2xl bg-red-600 py-4 text-center text-base font-semibold text-white"
        >
          拍作业
        </Link>
      </div>
    </div>
  );
}

function Card({
  href, title, value, hint, accent, disabled,
}: {
  href: string; title: string; value: string; hint: string; accent?: boolean; disabled?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-neutral-500">{title}</span>
        <span className={`text-2xl font-semibold tabular-nums ${accent && !disabled ? "text-red-600" : ""}`}>
          {value}
        </span>
      </div>
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </>
  );
  const cls =
    "block rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900";
  return disabled ? (
    <div className={`${cls} opacity-60`}>{inner}</div>
  ) : (
    <Link href={href} className={cls}>{inner}</Link>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="text-center">
      <div className="text-xl font-semibold tabular-nums">{value ?? "—"}</div>
      <div className="mt-0.5 text-xs text-neutral-500">{label}</div>
    </div>
  );
}
