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

export async function getObject(k: string): Promise<Buffer> {
  const r = await call<{ Body: Buffer }>("getObject", { Bucket: Bucket(), Region: Region(), Key: k });
  return r.Body;
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
