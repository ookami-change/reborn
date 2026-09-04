/* 鉴权断言（node --experimental-strip-types scripts/test-auth.mjs） */
process.env.SESSION_SECRET = "test-secret-at-least-16-chars";
process.env.APP_PASSWORD = "correct horse battery staple";

const { issueToken, verifyToken, checkPassword } = await import("../lib/auth.ts");

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log(`  ✓ ${m}`)) : (fail++, console.log(`  ✗ ${m}`)));

console.log("会话 token");
const t = issueToken();
ok(verifyToken(t), "刚签发的 token 通过");
ok(!verifyToken(undefined), "缺 token 不通过");
ok(!verifyToken(""), "空 token 不通过");
ok(!verifyToken("garbage"), "无点分隔的串不通过");
ok(!verifyToken(`${t}x`), "签名被改一个字符就不通过");

// 篡改 payload 把过期时间推远，签名不变 —— 这是最典型的伪造
const [payload, sig] = t.split(".");
const claim = JSON.parse(Buffer.from(payload, "base64url").toString());
const forged = Buffer.from(JSON.stringify({ exp: claim.exp + 86400 * 3650 })).toString("base64url");
ok(!verifyToken(`${forged}.${sig}`), "改 payload 保留原签名 → 不通过");

// 换密钥后旧 token 应失效（换密钥 = 全员登出）
const t2 = issueToken();
process.env.SESSION_SECRET = "another-secret-at-least-16-chars";
ok(!verifyToken(t2), "换 SESSION_SECRET 后旧 token 失效");
process.env.SESSION_SECRET = "test-secret-at-least-16-chars";

// 过期
const old = issueToken(Date.now() - 31 * 24 * 3600 * 1000);
ok(!verifyToken(old), "31 天前签发的 token 已过期");
ok(verifyToken(issueToken(Date.now() - 29 * 24 * 3600 * 1000)), "29 天前签发的仍有效");

console.log("口令");
ok(checkPassword("correct horse battery staple"), "正确口令通过");
ok(!checkPassword("wrong"), "错误口令不通过");
ok(!checkPassword(""), "空口令不通过");
ok(!checkPassword("correct horse battery stapl"), "少一个字符不通过");

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
