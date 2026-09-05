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
const old = issueToken(AID, Date.now() - 31 * 24 * 3600 * 1000);
ok(!verifyToken(old), "31 天前签发的 token 已过期");
ok(verifyToken(issueToken(AID, Date.now() - 29 * 24 * 3600 * 1000)), "29 天前签发的仍有效");

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

console.log("magic link token");
const toks = new Set(Array.from({ length: 200 }, () => newJoinToken()));
ok(toks.size === 200, "200 次生成无重复");
const one = newJoinToken();
ok(one.length >= 32, `长度 ${one.length} ≥ 32，不可枚举`);
ok(/^[A-Za-z0-9_-]+$/.test(one), "只含 URL 安全字符，可直接放进链接");

console.log("自助领取门禁");
{
  const { claimGate, familyLabel } = await import("../lib/claim.ts");
  const open = { limit: 12, used: 0, wantCode: "sanban", gotCode: "sanban" };

  ok(claimGate(open).ok, "开着、有名额、暗号对 → 放行");
  ok(!claimGate({ ...open, limit: 0 }).ok, "CLAIM_LIMIT=0 → 关闭（默认值就是 0，必须显式打开）");
  ok(!claimGate({ ...open, limit: NaN }).ok, "CLAIM_LIMIT 填成非数字 → 关闭，不是放行");
  ok(!claimGate({ ...open, limit: -1 }).ok, "CLAIM_LIMIT 为负 → 关闭");
  ok(!claimGate({ ...open, gotCode: "" }).ok, "没带暗号 → 拒绝");
  ok(!claimGate({ ...open, gotCode: "SANBAN" }).ok, "暗号大小写不同 → 拒绝");
  ok(claimGate({ ...open, gotCode: " sanban " }).ok, "暗号两边有空格 → 放行（微信复制链接常带空格）");
  ok(claimGate({ ...open, wantCode: "", gotCode: "" }).ok, "没设 CLAIM_CODE → 不校验暗号");
  ok(!claimGate({ ...open, used: 12 }).ok, "名额刚好用完 → 拒绝");
  ok(!claimGate({ ...open, used: 99 }).ok, "名额超了 → 拒绝");
  ok(claimGate({ ...open, used: 11 }).ok, "还剩一个名额 → 放行");
  // 关闭状态必须压过暗号：想紧急停掉领取时，改 CLAIM_LIMIT 一处就够
  ok(!claimGate({ limit: 0, used: 0, wantCode: "sanban", gotCode: "sanban" }).ok,
     "关闭时暗号正确也拒绝");
  ok(claimGate({ ...open, gotCode: "" }).ok === false
     && claimGate({ ...open, gotCode: "" }).error !== claimGate({ ...open, used: 12 }).error,
     "暗号错和名额满给的是不同提示（自己排查时要能分清）");

  ok(familyLabel("小明妈妈") === "小明妈妈", "称呼原样保留");
  ok(familyLabel("  小明妈妈  ") === "小明妈妈", "去掉两边空格");
  ok(familyLabel("") === null && familyLabel(null) === null && familyLabel(undefined) === null,
     "空称呼返回 null，由路由回 400");
  ok(familyLabel("a".repeat(50)).length === 20, "超长截到 20 字，不撑乱 invite.sh 的列表");
  ok(!familyLabel("小明\n妈妈").includes("\n"), "换行被吃掉，不能靠它伪造多行输出");
}

console.log("打开链接的环境判别（决定给哪套加桌面的说明）");
{
  const { detectEnv } = await import("../lib/claim.ts");
  const nav = (userAgent, platform = "", maxTouchPoints = 0) => ({ userAgent, platform, maxTouchPoints });

  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
  const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
  // 微信内置浏览器的 UA 就是在系统 UA 后面追加 MicroMessenger
  const WX_IOS = `${IPHONE} MicroMessenger/8.0.49(0x18003125) NetType/WIFI Language/zh_CN`;
  const WX_AND = `${PIXEL} MMWEBID/1234 MicroMessenger/8.0.49.2740(0x28003152) WeChat/arm64 Weixin NetType/WIFI`;
  const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  ok(detectEnv(nav(IPHONE)) === "ios", "iPhone Safari → iOS 那套（分享按钮）");
  ok(detectEnv(nav(IPAD, "MacIntel", 5)) === "ios", "iPadOS 的 UA 伪装成 Mac，靠触点数认出来");
  ok(detectEnv(nav(MAC, "MacIntel", 0)) === "desktop", "真 Mac（无触摸）不是 iOS");
  ok(detectEnv(nav(PIXEL)) === "android", "安卓 Chrome → 安卓那套（⋮ 菜单）");
  // 安卓上 platform 也可能是 MacIntel（Chrome 手机模拟就是），必须先判安卓
  ok(detectEnv(nav(PIXEL, "MacIntel", 5)) === "android", "安卓 + MacIntel + 有触摸 → 仍判为安卓，不是 iPad");
  ok(detectEnv(nav(WX_IOS)) === "wechat-ios", "iPhone 微信 → 提示「在Safari中打开」");
  ok(detectEnv(nav(WX_AND)) === "wechat-other", "安卓微信 → 提示「在浏览器打开」");
  ok(detectEnv(nav(MAC)) === "desktop", "电脑上 → 让他用手机打开");
}

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
