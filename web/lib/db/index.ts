import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

/* 惰性建立连接。构建期 Next.js 会 import 各个 route 模块来收集元信息，
 * 那时没有 DATABASE_URL；若在模块顶层就读取环境变量会导致构建失败。 */
const g = globalThis as unknown as { __pg?: ReturnType<typeof postgres>; __db?: Db };

function getDb(): Db {
  if (g.__db) return g.__db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("缺少环境变量 DATABASE_URL");
  // 开发模式热重载会重复建连接，挂到 globalThis 上复用
  g.__pg ??= postgres(url, { max: 10 });
  g.__db = drizzle(g.__pg, { schema });
  return g.__db;
}

export const db = new Proxy({} as Db, {
  get: (_t, prop, receiver) => Reflect.get(getDb(), prop, receiver),
  has: (_t, prop) => Reflect.has(getDb(), prop),
});

export { schema };
