import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("缺少环境变量 DATABASE_URL");

// Next.js 开发模式热重载会重复建连接，挂到 globalThis 上复用
const g = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };
const sql = g.__pg ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") g.__pg = sql;

export const db = drizzle(sql, { schema });
export { schema };
