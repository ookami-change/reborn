"use client";

import { useState } from "react";
import { apiUrl } from "@/lib/paths";

/* 监护人同意（T12）。
 *
 * 文案原则：如实说清楚，不用「我们承诺保护您的隐私」这种空话。
 * 尤其是**照片会发给第三方模型**这一条——不写就是隐瞒。 */
export default function ConsentPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agree = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/consent"), { method: "POST" });
      if (!res.ok) throw new Error("提交失败，请重试");
      window.location.href = apiUrl("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 bg-white px-5 py-8 dark:bg-neutral-950">
      <div>
        <h1 className="text-lg font-semibold">开始之前</h1>
        <p className="mt-1 text-sm text-neutral-500">
          这是一个个人业余项目，免费，不收费。请监护人看完再决定。
        </p>
      </div>

      <Item title="会收集什么">
        你拍的作业照片。照片里通常有孩子的<b>姓名和笔迹</b>，可能还有学校名称。
        以及你填的正确答案、每道题的对错记录。
      </Item>

      <Item title="存在哪里">
        腾讯云上海的服务器和对象存储，都在中国境内。图片不公开，只能通过带签名的
        临时链接读取。
      </Item>

      <Item title="会不会给别人">
        开启「自动找题」时，作业照片会发给<b>月之暗面（Kimi）的模型接口</b>，
        用来框出页面上有哪几道题。这是境内厂商，照片不出境。除此之外不给任何第三方，
        不用于广告。
      </Item>

      <Item title="留多久">
        原图计划保留 90 天，题目裁剪图长期保留（复习卷要用）。你随时可以要我删掉
        全部数据。
      </Item>

      <Item title="现在的安全水平" warn>
        网站暂时还没有 HTTPS，登录口令和登录状态是<b>明文传输</b>的。在自己家里的
        WiFi 用没什么问题，不建议在公共 WiFi 上用。等域名备案下来会立刻补上。
      </Item>

      <Item title="这条链接" warn>
        你收到的登录链接就是你家的钥匙，<b>转发给别人等于把数据给了对方</b>。
        不小心发出去了告诉我，我可以作废重发一条。
      </Item>

      <button
        onClick={agree}
        disabled={busy}
        className="mt-1 w-full rounded-xl bg-red-600 py-3.5 text-base font-semibold text-white disabled:bg-neutral-300 dark:disabled:bg-neutral-700"
      >
        {busy ? "提交中…" : "我是孩子的监护人，同意"}
      </button>
      {error && <p className="text-center text-sm text-red-600">{error}</p>}
      <p className="text-center text-xs text-neutral-400">
        不同意就直接关掉页面，不会留下任何数据。
      </p>
    </div>
  );
}

function Item({ title, children, warn }: { title: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <section
      className={`rounded-xl border p-3.5 ${
        warn
          ? "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{children}</p>
    </section>
  );
}
