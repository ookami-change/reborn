import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { POLICY_VERSION, issueToken, sessionCookie } from "@/lib/auth";
import { currentAccountId } from "@/lib/session";

export const runtime = "nodejs";

/* 记录监护人同意（T7 / 《商业化瓶颈》§五）。
 *
 * consent_log 只增不改——出事时它是唯一证据，覆盖等于毁证。
 * 写完重新签发 cookie 把版本带上，proxy 之后就不用查库了。 */
export async function POST() {
  const accountId = await currentAccountId();

  await db.insert(schema.consentLog).values({
    accountId,
    action: "agree",
    policyVersion: POLICY_VERSION,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(issueToken(accountId, POLICY_VERSION)));
  return res;
}
