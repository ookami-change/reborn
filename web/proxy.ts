import { NextResponse, type NextRequest } from "next/server";
import { ACCOUNT_HEADER, cookieName, verifyToken } from "@/lib/auth";

/* 全站鉴权网关（T9 / T9b）
 *
 * Next 16 里 middleware.ts 已废弃并改名 proxy.ts，且默认跑在 Node.js
 * runtime（15.x 时是 Edge），所以这里可以直接用 node:crypto 验签。
 *
 * 页面未登录 → 302 到 /login 并带上 next 参数；
 * 接口未登录 → 401 JSON，让前端自己跳，不要给 fetch 返回一个登录页 HTML。
 *
 * 校验通过后把账号 id 放进请求头传给路由——这是官方文档给的传值方式
 * （proxy 与渲染代码不共享模块和全局变量）。
 */

/** 不需要登录就能访问的路径。注意这里的 pathname 已经不含 basePath。
 *
 *  /claim 与 /setup 是自助领取的入口（《试用分发方案》§六 方案 B）：
 *  家长第一次点开时当然还没有会话，拦下来就没人能领了。
 *  /setup/<token> 只凭那条不可猜的 token 显示"加到桌面"的说明，不读任何错题数据。 */
const PUBLIC = ["/login", "/api/auth/login", "/join", "/claim", "/api/claim", "/setup"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 无论如何先删掉外部传进来的账号头，杜绝伪造
  const headers = new Headers(req.headers);
  headers.delete(ACCOUNT_HEADER);

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next({ request: { headers } });
  }

  const session = verifyToken(req.cookies.get(cookieName)?.value);
  if (session) {
    headers.set(ACCOUNT_HEADER, session.aid);
    return NextResponse.next({ request: { headers } });
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  // clone() 保留 basePath，手拼 new URL() 会丢掉 /reborn 前缀
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  // 登录后跳回原地址。只收站内相对路径，避免变成开放重定向
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  /* 放行静态资源与图标，其余全部经过校验。
   * _next/static 与 _next/image 是构建产物，不含用户数据。
   * sw.js 和 icon-*.png 必须匿名可取：浏览器判定"能不能装到桌面"时会去拉它们，
   * 拿到 302 登录页就当作不可安装。 */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|apple-icon|icon-192.png|icon-512.png|sw.js).*)"],
};
