import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/* 单口令鉴权（T9）
 *
 * 目标是挡住随机访问者，不是防定向攻击：应用挂在公网 IP 的 /reborn 下，
 * 之前没有任何校验——知道 URL 就能看到全部错题、上传、删数据。
 *
 * 只做一个共享口令，不建 account 表。真到家长群试用要按家庭隔离数据时，
 * 需要 account 表 + child 归属 + 每个查询加作用域（T9b，估 1–2 天）。
 * 现在只有一个用户，造一张只有一行、密码还在环境变量里的 account 表，
 * 是"看起来准备好了其实没有"的半成品，比不造更糟。
 *
 * ⚠️ 站点走的是 http（IP 直连没有证书），口令和 cookie 都是明文传输。
 * 这挡得住误入的人，挡不住同网络的嗅探。上真实用户前必须先上 TLS。
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

/** 生成会话 token：<payload>.<签名>，payload 里只有过期时间 */
export function issueToken(now = Date.now()): string {
  const payload = b64u(Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + MAX_AGE })));
  return `${payload}.${sign(payload)}`;
}

/** 校验 token。签名不对或已过期都返回 false，不区分——不给攻击者额外信息。 */
export function verifyToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const got = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(payload));
  // 长度不等时 timingSafeEqual 会抛，先挡掉
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: number };
    return typeof exp === "number" && exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

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

/** 生成一个够用的随机密钥，供 deploy 首次初始化 */
export const randomSecret = () => randomBytes(32).toString("base64url");
