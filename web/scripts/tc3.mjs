/** 腾讯云 TC3-HMAC-SHA256 签名的极简调用器，供探测脚本复用 */
import crypto from "node:crypto";
import fs from "node:fs";

export function loadEnv(p = ".env.local") {
  return Object.fromEntries(
    fs.readFileSync(p, "utf8").split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
}

const sha256hex = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hmac = (k, s) => crypto.createHmac("sha256", k).update(s).digest();

export async function tcCall({ secretId, secretKey, service, host, action, version, region, payload = {} }) {
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10);

  const canonical = ["POST", "/", "",
    `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`,
    "content-type;host;x-tc-action", sha256hex(body)].join("\n");
  const scope = `${date}/${service}/tc3_request`;
  const toSign = ["TC3-HMAC-SHA256", ts, scope, sha256hex(canonical)].join("\n");
  const sig = crypto.createHmac("sha256",
    hmac(hmac(hmac(hmac("TC3" + secretKey, date), service), "tc3_request"), "")
      .length ? hmac(hmac(hmac("TC3" + secretKey, date), service), "tc3_request") : ""
  ).update(toSign).digest("hex");

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    Host: host,
    "X-TC-Action": action,
    "X-TC-Version": version,
    "X-TC-Timestamp": String(ts),
    Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host;x-tc-action, Signature=${sig}`,
  };
  if (region) headers["X-TC-Region"] = region;

  const r = await fetch(`https://${host}`, { method: "POST", headers, body });
  return r.json();
}
