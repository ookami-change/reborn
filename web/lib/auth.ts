import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/* 单口令鉴权（T9）
 *
 * 目标是挡住随机访问者，不是防定向攻击：应用挂在公网 IP 的 /reborn 下，
 * 之前没有任何校验——知道 URL 就能看到全部错题、上传、删数据。
 *
 * 两条入口：
 *   ① 口令（APP_PASSWORD）→ owner 账号，给我自己用
 *   ② magic link `/join/<token>` → 该家庭的账号，给试用家长用
 * 会话 token 里带 accountId，所有查询按它收敛（《试用分发方案》§六）。
 *
 * cookie 的 secure 由 BASE_URL 推导，不硬编码：线上是 https 必须设 true，
 * 本地开发是 http://localhost，设了 true 浏览器不回传就登不上。
 */

const COOKIE = "reborn_session";
const MAX_AGE = 30 * 24 * 3600; // 30 天：扫码回收在手机上只需登录一次

const b64u = (b: Buffer) => b.toString("base64url");

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("缺少 SESSION_SECRET（至少 16 字符）");
  }
  return s;
}

function sign(payload: string): string {
  return b64u(createHmac("sha256", secret()).update(payload).digest());
}

export type Session = { aid: string; exp: number };

/** 生成会话 token：<payload>.<签名>。payload 里是账号 id 和过期时间。 */
export function issueToken(accountId: string, now = Date.now()): string {
  const claim: Session = { aid: accountId, exp: Math.floor(now / 1000) + MAX_AGE };
  const payload = b64u(Buffer.from(JSON.stringify(claim)));
  return `${payload}.${sign(payload)}`;
}

/** 校验 token，通过则返回会话，否则返回 null。
 *  签名不对、已过期、缺 aid 都返回 null，不区分——不给攻击者额外信息。 */
export function verifyToken(token: string | undefined, now = Date.now()): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const got = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(payload));
  // 长度不等时 timingSafeEqual 会抛，先挡掉
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<Session>;
    if (typeof c.exp !== "number" || c.exp <= Math.floor(now / 1000)) return null;
    if (typeof c.aid !== "string" || !c.aid) return null;
    return { aid: c.aid, exp: c.exp };
  } catch {
    return null;
  }
}

/** magic link 的随机串。32 字节，不可枚举。 */
export const newJoinToken = () => randomBytes(24).toString("base64url");

/** 应用内部用来传递已验证账号 id 的请求头。
 *  proxy 每次都会覆写它，客户端伪造无效——但仍要在 proxy 里显式删掉。 */
export const ACCOUNT_HEADER = "x-reborn-account";

/** 口令比对。必须定长比较，否则可以按响应时间逐字符猜。 */
export function checkPassword(input: string): boolean {
  const want = process.env.APP_PASSWORD;
  if (!want) throw new Error("缺少 APP_PASSWORD");
  // 先做一次 HMAC 把两边压成等长，避免长度本身泄漏信息
  const a = createHmac("sha256", secret()).update(input).digest();
  const b = createHmac("sha256", secret()).update(want).digest();
  return timingSafeEqual(a, b);
}

export const cookieName = COOKIE;
export const cookieMaxAge = MAX_AGE;

/** 会话 cookie 的统一属性。三处签发（口令 / magic link / 同意）共用，
 *  避免改了一处漏两处——secure 漏设一次就是明文传输。 */
export function sessionCookie(token: string) {
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: (process.env.BASE_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: MAX_AGE,
  };
}

/** 生成一个够用的随机密钥，供 deploy 首次初始化 */
export const randomSecret = () => randomBytes(32).toString("base64url");
