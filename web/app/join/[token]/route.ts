import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { issueToken, sessionCookie } from "@/lib/auth";
import { childIdFor } from "@/lib/db/seed";
import { apiUrl } from "@/lib/paths";

export const runtime = "nodejs";

/* magic link：一家一条不可猜的长链接，点开即登录（《试用分发方案》§六）。
 *
 * 零注册摩擦、天然数据隔离、不用短信也不用密码。代价是链接被转发出去等于
 * 账号泄露——5–10 个家庭的试用范围内可接受。撤销某个家庭的访问 =
 * 改掉它的 join_token。
 *
 * 是 GET 而不是 POST：家长是在微信里点开一条链接，不是提交表单。
 *
 * 跳转发的是**相对 Location**，不是绝对地址。绝对地址这里拼不出来：
 * 容器里 `req.url` 的 host 是 0.0.0.0:3000，`req.nextUrl` 在路由处理函数里
 * 同样不认 x-forwarded-host（只有 proxy.ts 里的那个认），两条路拼出来的都是
 * `https://0.0.0.0:3000/`——家长点开邀请链接直接进死胡同。相对路径没有这个问题，
 * 浏览器会自己按当前地址补全。basePath 要手动带上（apiUrl）。
 */
const redirect = (path: string) =>
  new NextResponse(null, { status: 307, headers: { Location: apiUrl(path) } });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [acc] = await db
    .select({ id: schema.account.id })
    .from(schema.account)
    .where(and(eq(schema.account.joinToken, token), isNull(schema.account.deletedAt)))
    .limit(1);

  // 不说"链接无效"和"链接已撤销"的区别，也不回显 token
  if (!acc) return redirect("/login");

  // 首次点开就把孩子建出来，家长进去不会看到空白的初始化状态
  await childIdFor(acc.id);
  await db
    .update(schema.account)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.account.id, acc.id));

  const res = redirect("/");
  res.cookies.set(sessionCookie(issueToken(acc.id)));
  return res;
}
