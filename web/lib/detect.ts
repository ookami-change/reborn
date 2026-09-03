import type { Box } from "@/lib/types";

/* 自动切题检出（TRD §7）
 *
 * 输入层三级自动化里的 L1：把整页切成候选题框，家长只需点选哪几道错了，
 * 不用拖框。检出失败或未开启时静默降级为纯手动，不影响主流程。
 *
 * 实测（2026-09-03，1600×2200 合成作业页）：
 *   kimi-k3                    12/12 全中，但 125–146s —— 推理模型，太慢
 *   kimi-k2.6                  12/12 全中，136s —— 同上
 *   kimi-k2.7-code-highspeed   12/12 全中，9–11.5s，三次运行稳定 ← 采用
 * 注意该账号 RPM 上限为 3，429 需退避重试。
 */

export type Detector = {
  /** 落库用的模型标识，不是展示名。none = 未启用检出 */
  name: string;
  detect(jpeg: Buffer): Promise<Box[]>;
};

const PROMPT = [
  "这是一张小学数学作业照片。请框出页面上每一道独立的题目（含题号、题干和作答区）。",
  "宁可多框也不要漏框——多框出来的家长不点就行，漏掉的家长就找不到了。",
  '只输出 JSON 数组，元素形如 {"x":0.08,"y":0.12,"w":0.84,"h":0.05}，',
  "x/y 为左上角，坐标是相对图片宽高的比例(0~1)。不要输出其他文字或代码块标记。",
].join("\n");

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** 容错解析：模型可能裹代码块、可能在 JSON 前后带说明文字 */
function parseBoxes(text: string): Box[] {
  let s = text.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);

  const raw: unknown = JSON.parse(s);
  if (!Array.isArray(raw)) return [];

  return raw
    .map((b) => {
      const o = b as Record<string, unknown>;
      return {
        x: clamp(Number(o.x)),
        y: clamp(Number(o.y)),
        w: clamp(Number(o.w)),
        h: clamp(Number(o.h)),
      };
    })
    .filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y) && b.w > 0.01 && b.h > 0.005)
    .map((b) => ({ ...b, w: Math.min(b.w, 1 - b.x), h: Math.min(b.h, 1 - b.y) }));
}

class VlmDetector implements Detector {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
  ) {}

  get name() {
    return this.model;
  }

  async detect(jpeg: Buffer): Promise<Box[]> {
    const body = JSON.stringify({
      model: this.model,
      // 不要传 temperature：这些模型只接受 1，传别的值会 400
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    // RPM 上限很低（实测 3），429 退避重试
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(90_000),
      });

      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 20_000));
        continue;
      }
      if (!res.ok) {
        throw new Error(`检出服务返回 ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      return parseBoxes(text);
    }
    throw new Error("检出服务持续限流");
  }
}

const noop: Detector = { name: "none", detect: async () => [] };

export function getDetector(): Detector {
  const mode = process.env.DETECT_MODE ?? "none";
  if (mode !== "vlm") return noop;
  const baseUrl = process.env.VLM_BASE_URL;
  const apiKey = process.env.VLM_API_KEY;
  const model = process.env.VLM_MODEL;
  if (!baseUrl || !apiKey || !model) return noop;
  return new VlmDetector(baseUrl, apiKey, model);
}
