"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiUrl } from "@/lib/paths";
import { readJson } from "@/lib/http";

/* 领取页：群里发的就是这个地址（带 ?c=<暗号>）。
 * 点一下开一个账号，然后跳到 /setup/<token> 教他加到桌面。 */

function ClaimForm() {
  const code = useSearchParams().get("c") ?? "";
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/claim"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code }),
      });
      const { token } = await readJson<{ token: string }>(res);
      // 整页跳转：接下来要读 manifest 和注册 service worker，别走客户端路由
      window.location.href = apiUrl(`/setup/${token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "开通失败");
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-6 py-10"
    >
      <div>
        <h1 className="text-xl font-semibold">错题本</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          拍下作业、圈出做错的题，到该复习的日子自动排进复习卷，打印出来给孩子重做。
          免费，个人业余做的。
        </p>
      </div>

      <label className="block">
        <span className="text-sm text-neutral-500">怎么称呼你</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={20}
          placeholder="比如：小明妈妈"
          className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3.5 text-base outline-none focus:border-red-500 dark:border-neutral-700"
        />
        <span className="mt-1.5 block text-xs text-neutral-400">
          只用来让我认出是谁，不会显示给别人
        </span>
      </label>

      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded-xl bg-red-600 py-3.5 text-base font-semibold text-white disabled:bg-neutral-300 dark:disabled:bg-neutral-700"
      >
        {busy ? "开通中…" : "开始用"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-xs leading-relaxed text-neutral-400">
        作业照片会存在腾讯云上海，开启自动找题时会发给月之暗面（Kimi）的模型框题，
        不出境、不给其他第三方。详见
        <a href={apiUrl("/about")} className="underline">
          数据说明
        </a>
        。
      </p>
    </form>
  );
}

export default function ClaimPage() {
  // useSearchParams 需要 Suspense 边界，否则整页会退化为动态渲染
  return (
    <Suspense fallback={<div className="h-dvh" />}>
      <ClaimForm />
    </Suspense>
  );
}
