/* 自助领取的准入判断（《试用分发方案》§六 方案 B）
 *
 * 群里发的是同一条链接，点开自动开一个新账号。方便，但代价是链接被转发到
 * 群外，陌生人也能开户。三道门禁挡这件事：
 *   ① CLAIM_LIMIT ≤ 0 → 整个功能关闭（默认值就是 0，必须显式打开）
 *   ② CLAIM_CODE     → 链接里带的暗号，挡住扫路径的爬虫
 *   ③ 名额上限       → 就算前两道破了，损失也是有界的，我随时能删
 *
 * 抽成纯函数是因为这三条一旦写错，后果是陌生人无限开户，必须能被测试直接打。
 */

export type ClaimGate = { ok: true } | { ok: false; status: number; error: string };

export function claimGate(opts: {
  /** CLAIM_LIMIT：允许自助领取的家庭总数上限，≤ 0 表示关闭 */
  limit: number;
  /** 已存在的非 owner、未删除账号数 */
  used: number;
  /** CLAIM_CODE，留空表示不校验 */
  wantCode?: string;
  gotCode?: string;
}): ClaimGate {
  const { limit, used } = opts;
  if (!Number.isFinite(limit) || limit <= 0) {
    return { ok: false, status: 403, error: "领取已关闭" };
  }
  const want = (opts.wantCode ?? "").trim();
  if (want && (opts.gotCode ?? "").trim() !== want) {
    // 不说"暗号不对"，免得提示对方去猜
    return { ok: false, status: 403, error: "这条链接不能用了，找我要一条新的" };
  }
  if (used >= limit) {
    return { ok: false, status: 403, error: "名额已满，找我加一个" };
  }
  return { ok: true };
}

/** 家庭标识，只给我自己在 invite.sh 里看，用来认出谁是谁。
 *  返回 null 表示没填。 */
export function familyLabel(input: unknown): string | null {
  const s = String(input ?? "")
    .replace(/\p{C}/gu, "") // 去掉换行等控制字符，否则 invite.sh 的列表会被撑乱
    .replace(/\s+/g, " ")
    .trim();
  return s ? s.slice(0, 20) : null;
}

/* 家长打开链接的环境。三个平台三套完全不同的「加到桌面」操作，而且十有八九
 * 是在**微信里**点开的——微信内置浏览器根本没有这个功能，必须先跳到系统浏览器。
 *
 * 参数是拆开的而不是直接收 navigator：这几条判断错一次，对应平台的家长就
 * 拿到一份没法照做的说明，必须能被测试直接打。 */
export type Env = "wechat-ios" | "wechat-other" | "ios" | "android" | "desktop";

export function detectEnv(nav: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}): Env {
  const ua = nav.userAgent;
  const wechat = /micromessenger/i.test(ua);
  /* 安卓要先判：iPadOS 13+ 的 UA 伪装成 Mac，只能靠「platform 是 Mac 但有触摸」
   * 认出来，而这条在安卓上也会成立（Chrome 的手机模拟就是这样），
   * 先排掉安卓才不会把安卓机当成 iPad。 */
  if (/android/i.test(ua)) return wechat ? "wechat-other" : "android";
  const ios =
    /iphone|ipad|ipod/i.test(ua) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  if (ios) return wechat ? "wechat-ios" : "ios";
  return wechat ? "wechat-other" : "desktop";
}
