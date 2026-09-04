import COS from "cos-nodejs-sdk-v5";

/* 腾讯云 COS 封装。
 * 走服务端上传而非浏览器直传：COS 桶由 CloudBase 托管，其 CORS 白名单
 * 不含本项目的域名，且应用与桶同在 ap-shanghai，服务端上传可走内网。 */

const Bucket = () => process.env.COS_BUCKET!;
const Region = () => process.env.COS_REGION || "ap-shanghai";
const Prefix = () => process.env.COS_PREFIX || "reborn/";

let _cos: COS | null = null;
function cos() {
  if (!_cos) {
    _cos = new COS({
      SecretId: process.env.TENCENT_SECRET_ID!,
      SecretKey: process.env.TENCENT_SECRET_KEY!,
    });
  }
  return _cos;
}

const call = <T>(m: keyof COS, p: unknown): Promise<T> =>
  new Promise((res, rej) =>
    // @ts-expect-error SDK 的回调签名未泛型化
    cos()[m](p, (e, d) => (e ? rej(e) : res(d as T))),
  );

export const key = (...parts: string[]) => Prefix() + parts.join("/");

export async function putObject(k: string, body: Buffer, contentType: string) {
  await call("putObject", { Bucket: Bucket(), Region: Region(), Key: k, Body: body, ContentType: contentType });
  return k;
}

/* 读对象不走 SDK 的 getObject。
 *
 * 该 SDK 被 Next 打包进 server chunk 后，getObject 会间歇性返回**内容损坏**
 * 的 Body（实测约 1/3，串行调用也一样），长度看着正常，但不是原始字节。
 * 表现是组卷时 pdf-lib 抛一句 "SOI not found in JPEG"，且时好时坏、
 * 换哪道题都可能中招——极难定位。
 *
 * 签名 URL + 原生 fetch 取的是同一个对象、同一套鉴权，实测稳定。
 * 顺带做一次 JPEG 魔数校验，坏数据就地报出 key，不再让它流到 pdf-lib。 */
export async function getObject(k: string): Promise<Buffer> {
  const wantJpeg = /\.jpe?g$/i.test(k);
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(signedUrl(k, 300));
    if (!res.ok) {
      last = `HTTP ${res.status}`;
    } else {
      const b = Buffer.from(await res.arrayBuffer());
      if (b.length > 0 && (!wantJpeg || (b[0] === 0xff && b[1] === 0xd8))) return b;
      last = `长度 ${b.length}，开头 ${b.subarray(0, 8).toString("hex")}`;
    }
    await new Promise((r) => setTimeout(r, 120 * attempt));
  }
  throw new Error(`COS 读取异常（重试 3 次）：${k}（${last}）`);
}

export async function deleteObject(k: string) {
  await call("deleteObject", { Bucket: Bucket(), Region: Region(), Key: k });
}

/** 生成带签名的临时读取链接，默认 1 小时。图片不公开可访问（PRD §7 隐私） */
export function signedUrl(k: string, expiresSec = 3600) {
  return cos().getObjectUrl({
    Bucket: Bucket(), Region: Region(), Key: k, Method: "GET", Expires: expiresSec, Sign: true,
  });
}
