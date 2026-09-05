/* 鉴权断言（node --experimental-strip-types scripts/test-auth.mjs） */
process.env.SESSION_SECRET = "test-secret-at-least-16-chars";
process.env.APP_PASSWORD = "correct horse battery staple";

const { issueToken, verifyToken, checkPassword, newJoinToken } = await import("../lib/auth.ts");

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log(`  ✓ ${m}`)) : (fail++, console.log(`  ✗ ${m}`)));

const AID = "11111111-2222-3333-4444-555555555555";

console.log("会话 token");
const t = issueToken(AID);
ok(verifyToken(t)?.aid === AID, "刚签发的 token 通过，且带回正确的账号 id");
ok(!verifyToken(undefined), "缺 token 不通过");
ok(!verifyToken(""), "空 token 不通过");
ok(!verifyToken("garbage"), "无点分隔的串不通过");
ok(!verifyToken(`${t}x`), "签名被改一个字符就不通过");

// 篡改 payload 把过期时间推远，签名不变 —— 这是最典型的伪造
const [payload, sig] = t.split(".");
const claim = JSON.parse(Buffer.from(payload, "base64url").toString());
const forged = Buffer.from(JSON.stringify({ ...claim, exp: claim.exp + 86400 * 3650 })).toString("base64url");
ok(!verifyToken(`${forged}.${sig}`), "改 payload 延长有效期、保留原签名 → 不通过");

// 换账号 id 是 T9b 下最要命的伪造：改成别家的 aid 就能看别家的数据
const swapped = Buffer.from(JSON.stringify({ ...claim, aid: "other-account" })).toString("base64url");
ok(!verifyToken(`${swapped}.${sig}`), "把 aid 换成别家的、保留原签名 → 不通过");
ok(!verifyToken(`${Buffer.from(JSON.stringify({ exp: claim.exp })).toString("base64url")}.${sig}`),
   "payload 缺 aid → 不通过");

// 换密钥后旧 token 应失效（换密钥 = 全员登出）
const t2 = issueToken(AID);
process.env.SESSION_SECRET = "another-secret-at-least-16-chars";
ok(!verifyToken(t2), "换 SESSION_SECRET 后旧 token 失效");
process.env.SESSION_SECRET = "test-secret-at-least-16-chars";

// 过期
const old = issueToken(AID, undefined, Date.now() - 31 * 24 * 3600 * 1000);
ok(!verifyToken(old), "31 天前签发的 token 已过期");
ok(verifyToken(issueToken(AID, undefined, Date.now() - 29 * 24 * 3600 * 1000)), "29 天前签发的仍有效");

console.log("口令");
ok(checkPassword("correct horse battery staple"), "正确口令通过");
ok(!checkPassword("wrong"), "错误口令不通过");
ok(!checkPassword(""), "空口令不通过");
ok(!checkPassword("correct horse battery stapl"), "少一个字符不通过");

console.log("cookie 属性");
{
  const { sessionCookie } = await import("../lib/auth.ts");
  process.env.BASE_URL = "https://www.twincle.com.cn";
  const c = sessionCookie("x");
  ok(c.secure === true && c.httpOnly === true && c.sameSite === "lax",
     `https 下 secure=${c.secure} httpOnly=${c.httpOnly} sameSite=${c.sameSite}`);
  process.env.BASE_URL = "http://localhost:3000";
  ok(sessionCookie("x").secure === false, "本地 http 下 secure=false，否则浏览器不回传就登不上");
}

console.log("监护人同意版本");
{
  const { POLICY_VERSION } = await import("../lib/auth.ts");
  ok(verifyToken(issueToken(AID))?.cv === undefined, "未同意时 token 里没有 cv");
  ok(verifyToken(issueToken(AID, POLICY_VERSION))?.cv === POLICY_VERSION, "同意后 cv 带回正确版本");
  const t3 = issueToken(AID, POLICY_VERSION);
  const [pl, sg] = t3.split(".");
  const c3 = JSON.parse(Buffer.from(pl, "base64url").toString());
  const fake = Buffer.from(JSON.stringify({ ...c3, cv: "9999-99-99" })).toString("base64url");
  ok(!verifyToken(`${fake}.${sg}`), "伪造 cv 绕过同意 → 签名不符，不通过");
}

console.log("magic link token");
const toks = new Set(Array.from({ length: 200 }, () => newJoinToken()));
ok(toks.size === 200, "200 次生成无重复");
const one = newJoinToken();
ok(one.length >= 32, `长度 ${one.length} ≥ 32，不可枚举`);
ok(/^[A-Za-z0-9_-]+$/.test(one), "只含 URL 安全字符，可直接放进链接");

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
