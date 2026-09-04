"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/paths";
import { readJson } from "@/lib/http";

export default function CapturePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("sourceType", "homework");
      const res = await apiFetch("/api/captures", { method: "POST", body: fd });
      const data = await readJson<{ captureId: string }>(res);
      router.push(`/mark/${data.captureId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
      setBusy(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-white p-8 dark:bg-neutral-950">
      <div className="text-center">
        <h1 className="text-lg font-semibold">拍作业</h1>
        <p className="mt-1 text-sm text-neutral-500">拍一整页，下一步再圈错题</p>
      </div>

      <button
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="w-full max-w-xs rounded-xl bg-red-600 py-4 text-base font-semibold text-white disabled:bg-neutral-300 dark:disabled:bg-neutral-700"
      >
        {busy ? "上传中…" : "拍照 / 从相册选"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => upload(e.target.files?.[0])}
      />
    </div>
  );
}
