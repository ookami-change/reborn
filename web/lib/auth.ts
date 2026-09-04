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

/** 监护人同意的条款版本。改条款就改这里，所有人会被要求重新同意。 */
export const POLICY_VERSION = "2026-09-04";

export type Session = {
  aid: string;
  exp: number;
  /** 已同意的条款版本。与 POLICY_VERSION 不符即视为未同意。
   *  放在签过名的 cookie 里，proxy 判断时零数据库开销——它每次请求都要跑，
   *  不能为了这个查库。DB 里的 consent_log 才是记录本身，这里只是快路径。 */
  cv?: string;
};

/** 生成会话 token：<payload>.<签名>。payload 里是账号 id 和过期时间。 */
export function issueToken(accountId: string, consentVersion?: string, now = Date.now()): string {
  const claim: Session = {
    aid: accountId,
    exp: Math.floor(now / 1000) + MAX_AGE,
    ...(consentVersion ? { cv: consentVersion } : {}),
  };
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
    return { aid: c.aid, exp: c.exp, ...(typeof c.cv === "string" ? { cv: c.cv } : {}) };
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

/** 生成一个够用的随机密钥，供 deploy 首次初始化 */
export const randomSecret = () => randomBytes(32).toString("base64url");
