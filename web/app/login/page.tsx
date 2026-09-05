"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiUrl } from "@/lib/paths";

function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 只接受站内相对路径，否则会变成开放重定向 */
  const nextPath = (() => {
    const n = params.get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "登录失败");
      // 用整页跳转而不是 router.push：cookie 刚种下，需要重新走一遍 proxy
      window.location.href = apiUrl(nextPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
      setBusy(false);
      setPassword("");
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex h-dvh flex-col items-center justify-center gap-5 bg-white p-8 dark:bg-neutral-950"
    >
      <div className="text-center">
        <h1 className="text-lg font-semibold">错题本</h1>
        <p className="mt-1 text-sm text-neutral-500">输入口令继续</p>
      </div>

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        autoComplete="current-password"
        placeholder="口令"
        className="w-full max-w-xs rounded-xl border border-neutral-300 bg-transparent px-4 py-3.5 text-base outline-none focus:border-red-500 dark:border-neutral-700"
      />

      <button
        type="submit"
        disabled={busy || !password}
        className="w-full max-w-xs rounded-xl bg-red-600 py-3.5 text-base font-semibold text-white disabled:bg-neutral-300 dark:disabled:bg-neutral-700"
      >
        {busy ? "登录中…" : "进入"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

export default function LoginPage() {
  // useSearchParams 需要 Suspense 边界，否则整页会退化为动态渲染
  return (
    <Suspense fallback={<div className="h-dvh" />}>
      <LoginForm />
    </Suspense>
  );
}
