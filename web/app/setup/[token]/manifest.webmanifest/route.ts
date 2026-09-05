import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

/* 每个家庭一份 manifest，因为 start_url 里要带上他自己的 magic link——
 * 从桌面图标启动时必须能直接登录进去（iOS 上桌面应用的存储与 Safari 隔离，
 * 拿不到 Safari 里的 cookie）。
 *
 * 里面的地址一律用**相对路径**：manifest 里的 URL 按 manifest 自身的地址解析，
 * 这样线上的 /reborn 前缀和本地的无前缀都不用特判，也不依赖 BASE_URL 配对。
 * 本文件在 /setup/<token>/manifest.webmanifest，所以 ../../ 就是应用根。
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [acc] = await db
    .select({ id: schema.account.id })
    .from(schema.account)
    .where(and(eq(schema.account.joinToken, token), isNull(schema.account.deletedAt)))
    .limit(1);
  if (!acc) return new NextResponse(null, { status: 404 });

  return NextResponse.json(
    {
      name: "错题本",
      short_name: "错题本",
      description: "拍作业、圈错题、按时复习",
      lang: "zh-CN",
      start_url: `../../join/${token}`,
      scope: "../../",
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: "#dc2626",
      icons: [
        // 满幅纯色底，安卓裁成圆形也不会切到字，所以可以同时声明 maskable
        { src: "../../icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "../../icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        // token 在 URL 里，别让中间缓存留下来
        "cache-control": "private, max-age=0, must-revalidate",
      },
    },
  );
}
