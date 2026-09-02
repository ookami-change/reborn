import { db, schema } from "./index";

/** v0.1 无账号体系，全局固定一个孩子。首次调用时创建。 */
let cached: string | null = null;

export async function defaultChildId(): Promise<string> {
  if (cached) return cached;
  const rows = await db.select({ id: schema.child.id }).from(schema.child).limit(1);
  if (rows[0]) return (cached = rows[0].id);
  const [created] = await db
    .insert(schema.child)
    .values({ name: "我的孩子", grade: 4 })
    .returning({ id: schema.child.id });
  return (cached = created.id);
}
