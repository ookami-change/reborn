/** Next.js 的 basePath 只会自动作用于 next/link、next/image 和路由，
 *  手写的 fetch 不会被前缀化，因此客户端调 API 一律走这个函数。 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const apiUrl = (path: string) => `${BASE}${path}`;
export const assetUrl = (path: string) => `${BASE}${path}`;
