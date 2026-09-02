import COS from "cos-nodejs-sdk-v5";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const cos = new COS({ SecretId: env.TENCENT_SECRET_ID, SecretKey: env.TENCENT_SECRET_KEY });
const call = (m, p) => new Promise((res, rej) => cos[m](p, (e, d) => (e ? rej(e) : res(d))));

const { Buckets } = await call("getService", {});
for (const b of Buckets) {
  console.log(`\n══ ${b.Name}  (${b.Location}) ══`);
  try {
    const r = await call("getBucket", { Bucket: b.Name, Region: b.Location, Delimiter: "/", MaxKeys: 200 });
    const dirs = (r.CommonPrefixes ?? []).map((p) => p.Prefix);
    const files = (r.Contents ?? []).map((o) => `${o.Key} (${o.Size}B)`);
    console.log("  目录:", dirs.length ? dirs.join("  ") : "无");
    console.log("  文件:", files.length ? files.join("  ") : "无");
  } catch (e) {
    console.log("  列举失败:", e.code || e.message);
  }
}
