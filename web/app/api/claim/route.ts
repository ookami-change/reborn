import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { newJoinToken } from "@/lib/auth";
import { claimGate, familyLabel } from "@/lib/claim";
import { childIdFor } from "@/lib/db/seed";

export const runtime = "nodejs";

/* 自助领取：群里发一条链接，点开开一个新账号（《试用分发方案》§六 方案 B）。
 * 门禁逻辑在 lib/claim.ts，这里只负责取数、限流、落库。 */

/* 两道限流，按 IP 的滑动小时窗。单实例部署放内存足够，重启即清空——目的是
 * 让刷号变慢，真正的兜底是 CLAIM_LIMIT 名额上限。
 *
 * 分成两个计数是因为它们防的不是一回事：
 *   MAX_NEW 防刷号——只统计**真的开出了账号**的请求。家长自己填错东西
 *           重试几次不该被算进去，否则他会被自己的手误锁在门外一小时。
 *   MAX_REQ 防猜暗号——暗号只是个词，不限次就能爆破出来。阈值放宽到 20，
 *           正常人怎么点都够。
 *
 * X-Forwarded-For 取最右边：最左边是客户端自己填的，按它分桶等于没限流
 * （详见 /api/auth/login 的同名注释）。 */
const seen = new Map<string, number[]>();
const made = new Map<string, number[]>();
const MAX_REQ = 20;
const MAX_NEW = 3;
const WINDOW = 3600_000;

function clientIp(req: NextRequest): string {
  const parts = (req.headers.get("x-forwarded-for") ?? "")
    .split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}

/** 窗口内已发生的时间点。顺手把过期的丢掉，Map 不会无限长大。 */
function recent(m: Map<string, number[]>, ip: string, now: number): number[] {
  const arr = (m.get(ip) ?? []).filter((t) => now - t < WINDOW);
  m.set(ip, arr);
  return arr;
}

export async function POST(req: NextRequest) {
  const now = Date.now();
  const ip = clientIp(req);

  const tries = recent(seen, ip, now);
  if (tries.length >= MAX_REQ) {
    return NextResponse.json({ error: "太频繁了，一小时后再试" }, { status: 429 });
  }
  tries.push(now);

  const body = (await req.json().catch(() => ({}))) as { name?: unknown; code?: unknown };
  const label = familyLabel(body.name);
  if (!label) return NextResponse.json({ error: "填一下称呼" }, { status: 400 });

  const [{ used }] = await db
    .select({ used: count() })
    .from(schema.account)
    .where(and(eq(schema.account.isOwner, false), isNull(schema.account.deletedAt)));

  const gate = claimGate({
    limit: Number(process.env.CLAIM_LIMIT ?? 0),
    used,
    wantCode: process.env.CLAIM_CODE,
    gotCode: typeof body.code === "string" ? body.code : "",
  });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const news = recent(made, ip, now);
  if (news.length >= MAX_NEW) {
    return NextResponse.json({ error: "开得太多了，一小时后再试" }, { status: 429 });
  }
  news.push(now);

  /* 「查名额」和「插一行」之间有竞态：两个人同时点，可能一起挤过上限。
   * 十来个熟人的规模下多出一两个账号没有后果，删掉即可，不值得为它上锁。 */
  const [acc] = await db
    .insert(schema.account)
    .values({ name: label, joinToken: newJoinToken(), claimedAt: new Date() })
    .returning({ id: schema.account.id, joinToken: schema.account.joinToken });

  // 先把孩子建出来，家长进去不会撞到空白的初始化状态
  await childIdFor(acc.id);

  return NextResponse.json({ token: acc.joinToken });
}
