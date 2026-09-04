import { headers } from "next/headers";
import { ACCOUNT_HEADER } from "@/lib/auth";

/* 路由侧读取当前账号（T9b）。
 *
 * 值由 proxy.ts 在验签后写入请求头，proxy 会先删掉外部传进来的同名头，
 * 所以这里拿到的一定是已验证的。走到这里还没有值只可能是 proxy 配置漏了
 * 路径——那是配置错误，必须抛，不能默默降级成"看所有人的数据"。 */
export async function currentAccountId(): Promise<string> {
  const h = await headers();
  const id = h.get(ACCOUNT_HEADER);
  if (!id) throw new Error("请求未经鉴权（proxy 未覆盖该路径？）");
  return id;
}

/** 当前账号名下的孩子。v0.1 一个账号一个孩子。
 *
 *  所有涉及用户数据的查询都必须用它收敛——四张主表都有 child_id，
 *  漏掉任何一处就是跨家庭越权。 */
export async function currentChildId(): Promise<string> {
  const { childIdFor } = await import("@/lib/db/seed");
  return childIdFor(await currentAccountId());
}
