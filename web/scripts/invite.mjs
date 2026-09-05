/* 生成 / 列出家庭邀请链接（《试用分发方案》§六）
 *
 *   node scripts/invite.mjs                 列出全部家庭
 *   node scripts/invite.mjs add "小明家"     新建一个家庭，打印它的专属链接
 *   node scripts/invite.mjs revoke <名字>    换掉该家庭的 token，旧链接立刻失效
 *   node scripts/invite.mjs group           打印发家长群的那条领取链接
 *
 * 服务器上用 deploy/invite.sh 跑（依赖解析见那个脚本的注释）。
 *
 * 发出去的是 /setup/<token> 而不是 /join/<token>：前者会教家长把应用加到
 * 手机桌面，并把这条链接显示出来让他自己存好；后者是机器入口，点开直接进。
 */
import { randomBytes } from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const base = process.env.BASE_URL ?? "http://localhost:3000";
const bp = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
if (!url) { console.error("缺少 DATABASE_URL"); process.exit(1); }

const sql = postgres(url, { max: 2 });
const token = () => randomBytes(24).toString("base64url");
const link = (t) => `${base}${bp}/setup/${t}`;
const [cmd, arg] = process.argv.slice(2);

if (cmd === "add") {
  if (!arg) { console.error('用法: node scripts/invite.mjs add "小明家"'); process.exit(1); }
  const [row] = await sql`
    INSERT INTO account (name, join_token) VALUES (${arg}, ${token()})
    RETURNING name, join_token`;
  console.log(`已创建「${row.name}」\n  ${link(row.join_token)}`);
} else if (cmd === "revoke") {
  if (!arg) { console.error('用法: node scripts/invite.mjs revoke "小明家"'); process.exit(1); }
  const rows = await sql`
    UPDATE account SET join_token = ${token()}
    WHERE name = ${arg} AND is_owner = false RETURNING name, join_token`;
  if (!rows.length) console.log(`没找到「${arg}」（owner 账号不能撤销）`);
  else console.log(`已撤销「${arg}」的旧链接，新链接：\n  ${link(rows[0].join_token)}`);
} else if (cmd === "group") {
  const limit = Number(process.env.CLAIM_LIMIT ?? 0);
  const code = process.env.CLAIM_CODE ?? "";
  if (!(limit > 0)) {
    console.log("自助领取是关的。在 .env.server 里设 CLAIM_LIMIT=12（和 CLAIM_CODE），再跑一次 deploy.sh。");
  } else {
    const [{ used }] = await sql`
      SELECT count(*)::int AS used FROM account WHERE is_owner = false AND deleted_at IS NULL`;
    console.log(`已用 ${used}/${limit} 个名额\n  ${base}${bp}/claim${code ? `?c=${encodeURIComponent(code)}` : ""}`);
  }
} else {
  const rows = await sql`
    SELECT a.name, a.join_token, a.is_owner, a.last_seen_at, a.claimed_at,
           (SELECT count(*) FROM mistake_card m
              JOIN child c ON c.id = m.child_id WHERE c.account_id = a.id) AS mistakes
    FROM account a WHERE a.deleted_at IS NULL ORDER BY a.is_owner DESC, a.created_at`;
  if (!rows.length) console.log("还没有任何家庭");
  for (const r of rows) {
    const seen = r.last_seen_at ? new Date(r.last_seen_at).toLocaleString("zh-CN") : "从未打开";
    const how = r.is_owner ? "" : r.claimed_at ? "  [群里自助领的]" : "";
    console.log(`${r.is_owner ? "★" : " "} ${r.name}  错题 ${r.mistakes} 道  最近 ${seen}${how}`);
    console.log(`   ${r.is_owner ? "（口令登录，无需链接）" : link(r.join_token)}`);
  }
}
await sql.end();
