import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "./index";
import { newJoinToken } from "@/lib/auth";

/* 账号与孩子的解析（T9b）。
 *
 * v0.1 每个账号固定一个孩子——多孩子家庭是后面的事，但 child.account_id
 * 这条归属关系现在就建立，否则以后是数据迁移。 */

let ownerCache: string | null = null;

/** owner 账号：口令登录进的那个，也就是我自己家。迁移里已建好，这里只兜底。 */
export async function ownerAccountId(): Promise<string> {
  if (ownerCache) return ownerCache;
  const [row] = await db
    .select({ id: schema.account.id })
    .from(schema.account)
    .where(and(eq(schema.account.isOwner, true), isNull(schema.account.deletedAt)))
    .limit(1);
  if (row) return (ownerCache = row.id);

  const [created] = await db
    .insert(schema.account)
    .values({ name: "我家", joinToken: newJoinToken(), isOwner: true })
    .returning({ id: schema.account.id });
  return (ownerCache = created.id);
}

/** 该账号名下的孩子。没有就建一个。 */
export async function childIdFor(accountId: string): Promise<string> {
  const [row] = await db
    .select({ id: schema.child.id })
    .from(schema.child)
    .where(eq(schema.child.accountId, accountId))
    .limit(1);
  if (row) return row.id;

  const [created] = await db
    .insert(schema.child)
    .values({ accountId, name: "我的孩子", grade: 4 })
    .returning({ id: schema.child.id });
  return created.id;
}
