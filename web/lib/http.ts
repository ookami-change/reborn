/** 解析 API 响应：先判状态码，再尽力解析 JSON。
 *
 *  不要直接 `await res.json()`——服务端 500 时响应体可能是空的，此时抛的是
 *  "Unexpected end of JSON input"，真正的错误原因被完全盖掉（组卷失败时
 *  就是这样，排查了很久才发现是存储层并发取图拿到空 Body）。 */
export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      /* 不是 JSON，下面按纯文本报错 */
    }
  }
  if (!res.ok) {
    const fromBody = (body as { error?: string } | null)?.error;
    throw new Error(fromBody || text.slice(0, 200) || `请求失败（HTTP ${res.status}）`);
  }
  return body as T;
}
