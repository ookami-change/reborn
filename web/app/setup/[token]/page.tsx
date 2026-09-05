import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiUrl } from "@/lib/paths";
import SetupGuide from "./SetupGuide";

export const metadata = { title: "你的入口" };

/* 专属入口页（《试用分发方案》§六 方案 B）
 *
 * 这是家长唯一需要收藏的地址。它做三件事：
 *   ① 教他把应用加到手机桌面（安卓 / iOS 步骤完全不同，还要先跳出微信）
 *   ② 显示他的专属链接，换手机或清了浏览器数据时靠它找回
 *   ③ 从桌面图标启动时直接把人送进 /join/<token>
 *
 * 为什么 ③ 必须存在：iOS 上加到桌面的网页有一套**独立于 Safari 的存储**，
 * Safari 里的登录 cookie 带不过去；安卓上家长也可能清掉浏览器数据。
 * 每次从桌面启动都重走一遍 magic link，登录状态就永远不会丢。
 */
export default async function SetupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [acc] = await db
    .select({ name: schema.account.name })
    .from(schema.account)
    .where(and(eq(schema.account.joinToken, token), isNull(schema.account.deletedAt)))
    .limit(1);

  if (!acc) {
    // 不区分"不存在"和"已撤销"，也不回显 token
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-neutral-500">这条链接用不了了，找我要一条新的。</p>
        <Link href="/login" className="text-sm text-red-600">
          用口令登录
        </Link>
      </div>
    );
  }

  const joinHref = apiUrl(`/join/${token}`);

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col gap-4 px-6 py-10">
      {/*
        从桌面图标启动时立刻转去 magic link，别让家长每次都看见这页说明。
        用阻塞式内联脚本而不是 useEffect：后者要等 hydration，会先闪一下这一屏。
      */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            `(function(){try{if(window.matchMedia("(display-mode: standalone)").matches` +
            `||window.navigator.standalone){location.replace(${JSON.stringify(joinHref)})}}catch(e){}})()`,
        }}
      />
      <link rel="manifest" href={apiUrl(`/setup/${token}/manifest.webmanifest`)} />

      <div>
        <h1 className="text-xl font-semibold">{acc.name}，这是你的入口</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          把它加到手机桌面，以后像用 App 一样点开就行，不用再找链接。
        </p>
      </div>

      <SetupGuide token={token} joinHref={joinHref} />

      <Link href="/about" className="mt-2 text-center text-xs text-neutral-400">
        数据说明
      </Link>
    </div>
  );
}
