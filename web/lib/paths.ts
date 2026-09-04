/** Next.js 的 basePath 只会自动作用于 next/link、next/image 和路由，
 *  手写的 fetch 不会被前缀化，因此客户端调 API 一律走这个函数。 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const apiUrl = (path: string) => `${BASE}${path}`;
export const assetUrl = (path: string) => `${BASE}${path}`;

/** 带鉴权处理的 fetch：会话过期时 proxy 返回 401，直接把人送回登录页并
 *  记住当前位置，否则页面会卡在"加载中…"或弹一个看不懂的错误。 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(apiUrl(path), init);
  if (typeof window !== "undefined" && (res.status === 401 || res.status === 403)) {
    const here = window.location.pathname.slice(BASE.length) + window.location.search;
    const to =
      res.status === 403 ? "/consent" : `/login?next=${encodeURIComponent(here)}`;
    window.location.href = apiUrl(to);
    // 让调用方的 await 永远不返回，避免它继续用一个空响应渲染
    await new Promise(() => {});
  }
  return res;
}
