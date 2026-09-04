import { NextRequest, NextResponse } from "next/server";
import { POLICY_VERSION, checkPassword, cookieMaxAge, cookieName, issueToken } from "@/lib/auth";
import { ownerAccountId } from "@/lib/db/seed";
import { hasConsented } from "@/lib/consent";

export const runtime = "nodejs";

/* 登录失败计数。单实例部署，放内存足够；重启即清空，这是可接受的——
 * 目的是让暴力猜口令变慢，不是做完整的风控。 */
const fails = new Map<string, { n: number; until: number }>();
const LOCK_AFTER = 8;
const LOCK_MS = 10 * 60_000;

/* X-Forwarded-For 是「客户端, 代理1, 代理2」的追加链，**最左边那个是客户端
 * 自己填的**，可以随便伪造——按它分桶等于没有限流，换个假 IP 就是全新额度。
 * 取最右边：那是我们自己的 Caddy 追加的，是它实际看到的对端地址。
 *
 * 兜底 "unknown" 时所有人共用一个桶：最坏是被刷满后 10 分钟没人能登录，
 * 但已登录的会话不受影响（只有这个接口限流），且会自动恢复。 */
function clientIp(req: NextRequest): string {
  const parts = (req.headers.get("x-forwarded-for") ?? "")
    .split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const now = Date.now();
  const rec = fails.get(ip);
  if (rec && rec.n >= LOCK_AFTER && rec.until > now) {
    const mins = Math.ceil((rec.until - now) / 60_000);
    return NextResponse.json({ error: `尝试太多次，${mins} 分钟后再试` }, { status: 429 });
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !checkPassword(password)) {
    const n = (rec && rec.until > now ? rec.n : 0) + 1;
    fails.set(ip, { n, until: now + LOCK_MS });
    return NextResponse.json({ error: "口令不对" }, { status: 401 });
  }

  fails.delete(ip);
  // 口令登录进的是 owner 账号（我自己家）；试用家长走 /join/<token>
  const accountId = await ownerAccountId();
  // 带上已同意的版本：换设备/重新登录不该被要求重新同意
  const cv = (await hasConsented(accountId)) ? POLICY_VERSION : undefined;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName, issueToken(accountId, cv, now), {
    httpOnly: true,
    sameSite: "lax",
    // 站点是 http（IP 直连无证书），设了 secure 浏览器就不会回传，直接登不上。
    // 上 TLS 后这里要改成 true。
    secure: false,
    path: "/",
    maxAge: cookieMaxAge,
  });
  return res;
}
