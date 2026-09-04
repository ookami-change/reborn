import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { POLICY_VERSION } from "@/lib/auth";

/** 该账号是否已同意当前版本条款。只在登录/进入时查一次，不进每请求路径。 */
export async function hasConsented(accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ action: schema.consentLog.action })
    .from(schema.consentLog)
    .where(
      and(
        eq(schema.consentLog.accountId, accountId),
        eq(schema.consentLog.policyVersion, POLICY_VERSION),
      ),
    )
    .orderBy(desc(schema.consentLog.createdAt))
    .limit(1);
  return row?.action === "agree";
}
