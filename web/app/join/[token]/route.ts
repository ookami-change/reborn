import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { cookieMaxAge, cookieName, issueToken } from "@/lib/auth";
import { childIdFor } from "@/lib/db/seed";

export const runtime = "nodejs";

/* magic link：一家一条不可猜的长链接，点开即登录（《试用分发方案》§六）。
 *
 * 零注册摩擦、天然数据隔离、不用短信也不用密码。代价是链接被转发出去等于
 * 账号泄露——5–10 个家庭的试用范围内可接受。撤销某个家庭的访问 =
 * 改掉它的 join_token。
 *
 * 是 GET 而不是 POST：家长是在微信里点开一条链接，不是提交表单。 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const home = new URL(req.url);
  home.pathname = home.pathname.replace(/\/join\/[^/]+$/, "") || "/";
  home.search = "";

  const [acc] = await db
    .select({ id: schema.account.id })
    .from(schema.account)
    .where(and(eq(schema.account.joinToken, token), isNull(schema.account.deletedAt)))
    .limit(1);

  if (!acc) {
    // 不说"链接无效"和"链接已撤销"的区别，也不回显 token
    const login = new URL(home);
    login.pathname = `${login.pathname.replace(/\/$/, "")}/login`;
    return NextResponse.redirect(login);
  }

  // 首次点开就把孩子建出来，家长进去不会看到空白的初始化状态
  await childIdFor(acc.id);
  await db
    .update(schema.account)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.account.id, acc.id));

  const res = NextResponse.redirect(home);
  res.cookies.set(cookieName, issueToken(acc.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // 站点是 http，设 true 浏览器不回传。上 TLS 后改
    path: "/",
    maxAge: cookieMaxAge,
  });
  return res;
}
