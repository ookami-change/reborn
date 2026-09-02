# TRD｜错题本 v0.1 技术方案文档

| 项 | 内容 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-09-02 |
| 状态 | 待开发 |
| 配套文档 | 《PRD-错题本v0.1.md》 |

---

## 1. 架构

### 1.1 分层

```
┌───────────────────────────────────────────────────┐
│ 输入层  错题是怎么产生的                             │
│   v0.1  家长手动圈选 + 手动填答案                    │
│   v0.3  模型自动判对错 + 家长确认                    │
└──────────────────────┬────────────────────────────┘
                       │  统一产出 Attempt 记录
        ╔══════════════▼══════════════════════════╗
        ║  稳定接口                                 ║
        ║  Attempt {                               ║
        ║    problem_id, child_answer, verdict,    ║
        ║    source: 'manual'|'model', confidence  ║
        ║  }                                       ║
        ╚══════════════┬══════════════════════════╝
                       │
┌──────────────────────▼────────────────────────────┐
│ 领域层  错题产生之后怎么办（无模型依赖）              │
│   · 错题卡创建                                     │
│   · Leitner 复习调度状态机                          │
│   · 掌握状态判定                                    │
└──────────────────────┬────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────┐
│ 输出层                                             │
│   · 首页聚合                                       │
│   · A4 PDF 组卷渲染                                │
│   · 扫码回收                                       │
└───────────────────────────────────────────────────┘
```

**这条分层是强制的。** 输入层的三个自动化级别只改变 Attempt 记录如何被创建，领域层和输出层不得依赖任何输入方式的细节。禁止让页面直接写数据库，禁止把「家长点了叉」这个动作和「错题卡」揉进同一张表。

### 1.2 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 全栈框架 | Next.js（App Router） | 前后端同一项目，不拆微服务 |
| 数据库 | PostgreSQL | Neon 或 Supabase 免费档即可 |
| ORM | Prisma 或 Drizzle | 任选 |
| 对象存储 | Cloudflare R2 或阿里云 OSS | S3 兼容协议 |
| 图片处理 | `sharp` | 服务端压缩、裁剪 |
| PDF 生成 | `pdf-lib` | 纯 JS，可嵌入 JPEG/PNG。**不要用 puppeteer**，在 serverless 环境过重 |
| 二维码 | `qrcode` | 生成 PNG 后嵌入 PDF |
| 前端图片交互 | 原生 DOM + Pointer Events | 已实现，见 `web/components/MarkCanvas.tsx`。不需要 Konva |

#### 实测版本（2026-09-02 已装）

`next@16.3.4` / `react@19.2.8` / `tailwindcss@4.3.3` / Node 25。此版本有两处与旧写法不同，写代码前请注意：

1. **动态路由的 `params` 是 Promise**，必须 await：
   ```ts
   export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
     const { code } = await params;
   }
   ```
2. `web/AGENTS.md` 由 `next dev` 自动生成并要求：写代码前先读 `node_modules/next/dist/docs/` 下对应文档，不要凭旧版本记忆写。该文件随仓库提交，不要删。

Route Handlers 的约定与旧版一致：`app/**/route.ts` 导出 `GET`/`POST` 等具名函数，默认不缓存。

---

## 2. 数据模型

### 2.1 DDL

```sql
CREATE TABLE child (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  grade       int  NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 一次拍摄事件
CREATE TABLE capture (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id         uuid NOT NULL REFERENCES child(id),
  image_key        text NOT NULL,              -- 对象存储 key
  source_type      text NOT NULL,              -- 'homework'|'exam'|'review_redo'
  review_sheet_id  uuid NULL REFERENCES review_sheet(id),
  marked           boolean NOT NULL DEFAULT false,  -- 是否已完成圈题
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON capture (child_id, marked, created_at DESC);

-- 一道题的身份
CREATE TABLE problem (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id           uuid NOT NULL REFERENCES child(id),
  source_capture_id  uuid NOT NULL REFERENCES capture(id),
  crop_box           jsonb NOT NULL,   -- {x,y,w,h} 归一化 0-1，相对原图
  crop_image_key     text  NOT NULL,   -- 裁剪后的图
  mask_boxes         jsonb NOT NULL DEFAULT '[]',  -- [{x,y,w,h}] 归一化，相对裁剪图
  correct_answer     text  NOT NULL,
  stem_text          text  NULL,       -- v0.1 留空，OCR 接入后填充
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON problem (child_id, created_at DESC);

-- 一次作答，同一道题可有多条
CREATE TABLE attempt (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id   uuid NOT NULL REFERENCES problem(id) ON DELETE CASCADE,
  capture_id   uuid NULL REFERENCES capture(id),
  child_answer text NULL,
  verdict      text NOT NULL,   -- 'right'|'wrong'|'blank'|'unclear'
  source       text NOT NULL,   -- 'manual'|'model'
  confidence   real NULL,       -- source='model' 时填
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON attempt (problem_id, created_at);

-- 复习调度单位，与 problem 一对一
CREATE TABLE mistake_card (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id           uuid NOT NULL UNIQUE REFERENCES problem(id) ON DELETE CASCADE,
  child_id             uuid NOT NULL REFERENCES child(id),
  box_level            int  NOT NULL DEFAULT 1,   -- 1..5
  next_due_date        date NULL,                 -- mastered 时为 NULL
  consecutive_correct  int  NOT NULL DEFAULT 0,
  status               text NOT NULL DEFAULT 'learning',  -- 'learning'|'mastered'
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON mistake_card (child_id, status, next_due_date);

CREATE TABLE review_sheet (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    uuid NOT NULL REFERENCES child(id),
  short_code  text NOT NULL UNIQUE,   -- 'R07'
  item_order  jsonb NOT NULL,         -- [{seq:1, problem_id:"...", code:"01"}, ...]
  per_page    int  NOT NULL DEFAULT 5,
  with_answer_page boolean NOT NULL DEFAULT true,
  pdf_key     text NULL,
  status      text NOT NULL DEFAULT 'generated',  -- 'generated'|'collected'
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

### 2.2 三张表分离的原因

`problem`（题目身份）、`attempt`（每次作答）、`mistake_card`（复习状态）必须分开。

同一道题会被作答多次（原始 + 多次重做）。如果只有一张「错题表」，重做记录无处存放，掌握状态只能写成表上的一个计数器字段。后果是复习规则一旦调整（例如从「连对 2 次」改为「间隔 30 天后仍答对」），历史数据无法重算，作答历史时间线也无数据可展示。

**掌握状态必须能由 attempt 序列推导出来，不能是唯一事实来源。**

### 2.3 坐标约定

所有框坐标一律使用**归一化值**（0–1 的小数，表示占图片宽/高的比例），不存像素值。

- `problem.crop_box` 相对**原图**
- `problem.mask_boxes` 相对**裁剪图**

---

## 3. API 设计

所有接口位于 `/api/*`，返回 JSON。v0.1 无鉴权。

### 3.1 上传

```
POST /api/upload-url
  req:  { contentType: "image/jpeg" }
  res:  { uploadUrl: string, imageKey: string }
```
返回对象存储的预签名上传链接（presigned URL，带签名和有效期的临时链接，浏览器可直接 PUT 上传，不经过应用服务器）。前端拿到后直接 `PUT uploadUrl`。

```
POST /api/captures
  req:  { childId, imageKeys: string[], sourceType: "homework"|"exam"|"review_redo", reviewSheetId?: string }
  res:  { captureIds: string[] }
```

### 3.2 圈题

```
GET  /api/captures/:id
  res: { id, imageUrl, marked, detectedBoxes: Box[] | null }
```
`imageUrl` 为带签名的临时读取链接。`detectedBoxes` 在 `DETECT_MODE=none` 时返回 `null`。

```
POST /api/captures/:id/detect
  res: { boxes: Box[] }          // Box = { x, y, w, h }  归一化
```
按需触发自动切题。前端在圈题页加载时调用，失败或未开启时静默降级为纯手动模式。

```
POST /api/captures/:id/problems
  req:  { items: [{
            cropBox:   Box,
            maskBoxes: Box[],
            correctAnswer: string,
            childAnswer?:  string
          }] }
  res:  { problemIds: string[] }
```
**一次事务内完成**：裁剪图片并上传、创建 `problem`、创建 `attempt`(verdict='wrong', source='manual')、创建 `mistake_card`(box_level=1, next_due_date=明天)、将 capture 标记为 `marked=true`。

### 3.3 错题

```
GET    /api/mistakes?status=all|learning|due|mastered&sort=recent|due
  res: { items: [{ id, cropImageUrl, correctAnswer, status, boxLevel, nextDueDate }] }

GET    /api/mistakes/:id
  res: { ...detail, attempts: [{ id, verdict, source, createdAt, originLabel }] }
       // originLabel: "原始作业" | "复习卷 R07"

PATCH  /api/mistakes/:id
  req: { correctAnswer?: string, action?: "mark_mastered"|"reset" }

DELETE /api/mistakes/:id
```

### 3.4 复习

```
GET  /api/review/due
  res: { due: Item[], upcoming: Item[] }    // upcoming = 未来 3 天内到期

POST /api/review/sheets
  req: { childId, problemIds: string[], perPage?: 5, withAnswerPage?: true }
  res: { sheetId, shortCode: "R07", pdfUrl: string }

GET  /api/review/sheets/:code
  res: { shortCode, status, items: [{ seq, code, problemId, cropImageUrl }], pdfUrl }

POST /api/review/sheets/:code/collect
  req: { results: [{ problemId, verdict: "right"|"wrong" }] }
  res: { rightCount, wrongCount, resetCount, masteredCount }
```
回收接口在一个事务内：为每题写入 `attempt`、按 §4.1 更新 `mistake_card`、将 sheet 置为 `collected`。**同一张卷重复回收应返回 409。**

### 3.5 首页

```
GET /api/home?childId=
  res: { dueCount, earliestDueDate, unmarkedCaptureCount,
         pendingSheetCount, totalMistakes, learningCount, masteredCount }
```

---

## 4. 核心算法

### 4.1 Leitner 状态机

```
BOX_INTERVALS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 }   // 单位：天

function applyAttempt(card, verdict):
    if verdict == 'right':
        card.consecutive_correct += 1
        if card.box_level >= 5:
            card.status        = 'mastered'
            card.next_due_date = NULL
        else:
            card.box_level    += 1
            card.next_due_date = today + BOX_INTERVALS[card.box_level]
    else:
        card.consecutive_correct = 0
        card.box_level           = 1
        card.next_due_date       = today + 1
        card.status              = 'learning'      // 已掌握的题答错会回到学习中
    card.updated_at = now()
```

逾期不做任何处理：`next_due_date` 早于今天的题继续算作到期，档位不变。

### 4.2 组卷选题

```
MIN_ITEMS = 4
UPCOMING_WINDOW = 3   // 天

due      = cards WHERE child_id=? AND status='learning' AND next_due_date <= today
                 ORDER BY next_due_date ASC

if len(due) < MIN_ITEMS:
    upcoming = cards WHERE status='learning'
                       AND next_due_date > today
                       AND next_due_date <= today + UPCOMING_WINDOW
                     ORDER BY next_due_date ASC
                     LIMIT MIN_ITEMS - len(due)
    // 返回给前端提示，由家长确认后再合并，不自动加入
```

### 4.3 短码生成

`shortCode` = `R` + 该孩子已生成卷数 + 1，两位补零（`R01`…`R99`），超过 99 后改用三位。全库唯一约束兜底，冲突时重试。

---

## 5. 图片处理

### 5.1 处理链路

| 阶段 | 处理 |
|---|---|
| 上传 | 前端压缩至最长边 2000px、JPEG 质量 0.85 后再上传，减少流量和存储 |
| 原图存储 | `raw/{captureId}.jpg`，保留 90 天后可归档或删除 |
| 裁剪 | 服务端用 `sharp` 按 `crop_box` 从原图裁出，JPEG 质量 0.9，存 `crop/{problemId}.jpg`，**永久保留** |
| 遮罩 | **不修改图片文件**。遮罩只存坐标，在 PDF 渲染时用白色实心矩形覆盖在题图之上 |

### 5.2 存储估算

单孩子一学期约 2000 张原图（约 600MB）+ 500 张裁剪图（约 50MB）。原图设置生命周期规则自动过期，长期占用主要是裁剪图。

---

## 6. PDF 生成

用 `pdf-lib` 在服务端渲染。

### 6.1 版式参数

| 参数 | 值 |
|---|---|
| 纸张 | A4 纵向，595 × 842 pt |
| 页边距 | 40 pt |
| 内容区宽度 | 515 pt |
| 页眉高度 | 60 pt |
| 二维码 | 50 × 50 pt，位于右上角 |
| 短码列宽 | 24 pt |
| 题图可用宽度 | 515 − 24 − 8 = 483 pt，等比缩放 |
| 作答区高度 | 题图高度 × 0.6 |
| 题间距 | 16 pt |

### 6.2 渲染步骤

1. 读取每道题的裁剪图
2. 计算等比缩放后的宽高，累加判断当前页是否放得下（放不下则新建页，**题目不允许跨页截断**）
3. 绘制短码文本
4. 绘制题图
5. **在题图之上，按 `mask_boxes` 的归一化坐标换算成 pt，绘制白色实心矩形**
6. 预留作答区空白
7. 全部题目绘制完成后，若 `with_answer_page` 为 true，新建一页写答案列表
8. 输出 PDF 上传对象存储，回填 `review_sheet.pdf_key`

### 6.3 二维码内容

编码为回收页完整 URL：`{BASE_URL}/review/{shortCode}/collect`

---

## 7. 模型接入

### 7.1 v0.1 的定位

模型只用于**自动切题检出**一处，且**可选**。`DETECT_MODE=none` 时系统完整可用，家长通过点击手动生成框。

**开发顺序：先按无模型跑通全流程，检出作为增强后加。**

### 7.2 接口抽象

```ts
type Box = { x: number; y: number; w: number; h: number };  // 归一化 0-1

interface Detector {
  detect(imageUrl: string): Promise<Box[]>;
}

// 由环境变量 DETECT_MODE 选择实现
// 'none' -> NoopDetector      返回 []
// 'ocr'  -> OcrAnchorDetector 路线 A
// 'vlm'  -> VlmDetector       路线 B
```

新增实现不得修改调用方代码。

### 7.3 路线 A：OCR + 题号锚点（推荐先做）

1. 调用云 OCR 的「通用文字识别（含位置）」接口，得到每个文本块的 `{ text, box }`
2. 用正则匹配题号：`^\d+[.、]`、`^[(（]\d+[)）]`、`^[①②③④⑤⑥⑦⑧⑨⑩]`
3. 按 y 坐标升序排列题号锚点
4. 相邻两个题号锚点之间的纵向区域即为一道题，横向取内容区全宽
5. 最后一个题号到页面底部（或最后一个文本块下沿）为最后一题

特性：延迟 1–2 秒，成本每千次调用数元，切分逻辑完全在自有代码中，可调试。

### 7.4 路线 B：VLM 直接输出框

调用多模态模型，要求返回题目框坐标的 JSON。

**接入时必须先用一张图验证坐标基准**：各厂商返回的坐标可能是 0–1 小数、0–1000 整数或原图像素值。统一转换为归一化值后再返回。

延迟 5–15 秒。

### 7.5 供应商

| 用途 | 供应商 | Base URL / 接口 | 注意事项 |
|---|---|---|---|
| OCR | 阿里云 / 腾讯云 / 百度智能云 | 各家 SDK | 选「通用文字识别高精度版」，必须是**返回位置坐标**的那个接口 |
| VLM | 阿里云百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | OpenAI 兼容格式，可直接用 openai sdk 改 baseURL |
| VLM | 火山方舟 | `https://ark.cn-beijing.volces.com/api/v3` | **需先在控制台创建「推理接入点」，请求中填 endpoint id 而非模型名** |
| VLM | 智谱 | `https://open.bigmodel.cn/api/paas/v4` | GLM-4V 系列 |

具体模型 ID 以各厂商控制台当前在售版本为准。

**合规约束**：本产品处理未成年人的作业图片。开放给自家以外的用户时，**只能使用境内可商用模型**，不得调用境外模型服务。

### 7.6 调用链路

```
浏览器
  │ ① GET  /api/upload-url          取预签名上传链接
  │ ② PUT  <presigned URL>          图片直传对象存储，不经过应用服务器
  │ ③ POST /api/captures/:id/detect
  ▼
Next.js API Route（服务端）
  │ ④ 由 image_key 生成带签名的临时读取链接
  │ ⑤ 调 OCR / VLM（API key 仅存在于服务端环境变量）
  │ ⑥ 解析结果 → 转归一化坐标 → 返回
  ▼
浏览器渲染灰色候选框
```

---

## 8. 部署

### 8.1 环境变量

```
DATABASE_URL=
BASE_URL=

S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

DETECT_MODE=none          # none | ocr | vlm
OCR_PROVIDER=
OCR_KEY=
OCR_SECRET=
VLM_BASE_URL=
VLM_API_KEY=
VLM_MODEL=
```

### 8.2 部署平台

不建议部署到 Vercel。原因是 serverless 函数存在执行时长上限（免费档 10 秒、Pro 档 60 秒），VLM 调用和 PDF 生成都可能超时被中断。

**推荐 Railway、Fly.io 或普通云服务器**，无函数执行时长限制。

若必须使用 Vercel，则将检出改为异步任务：`POST /api/captures/:id/detect` 立即返回任务 ID，前端轮询 `/api/captures/:id/detect/status`。

### 8.3 交付形态

移动端网页，链接直接分发。**不做小程序、不做 App 打包、不上应用商店、不申请备案。**

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| **圈题页的图片框选交互** | 这是整个项目唯一有技术难度的部分，小屏上缩放、拖框、精确对齐都很难做好，容易大幅超期 | **第一个开发，独立验证。** 先做纯前端原型跑通交互，再接后端 |
| serverless 函数超时 | 检出和 PDF 生成被中断 | 见 §8.2，选用无时长限制的平台 |
| 请求体大小限制 | 图片以 base64 内联时超限 | 图片一律走对象存储签名链接，禁止 base64 内联传给模型 |
| 各厂商坐标基准不一致 | 框位置整体错乱 | 统一在 Detector 实现内转为归一化坐标，接入时用单张图验证 |
| 复习卷题数不足 | 只有 2 道题的卷不值得打印 | 见 §4.2，提示补入即将到期的题 |
| 复习卷丢失 | 孩子弄丢纸质卷 | `review_sheet.item_order` 持久化，可重新生成完全相同的 PDF |
| 图片存储增长 | 成本上升 | 原图设 90 天生命周期规则，裁剪图永久保留 |
| 微信内置浏览器限制 | PDF 下载、相机调用可能受限 | 提测时必须在微信内实测，PDF 提供「在浏览器中打开」的兜底提示 |

---

## 10. 开发顺序

| 序 | 内容 | 预估 |
|---|---|---|
| 1 | **圈题页框选交互原型**（纯前端，不接后端） | 2–3 天 |
| 2 | 建库建表、对象存储打通、上传链路 | 1 天 |
| 3 | 圈题 Step2（遮罩、答案录入）+ 裁剪落库 | 1 天 |
| 4 | 错题本列表、详情页 | 1 天 |
| 5 | Leitner 状态机 + 首页聚合 | 1 天 |
| 6 | 组卷 + PDF 渲染 + 二维码 | 2 天 |
| 7 | 扫码回收 + 状态更新 | 1 天 |
| 8 | 真机联调（iOS Safari / Android Chrome / 微信） | 1 天 |
| 9 | 接入自动检出（可选） | 1 天 |

合计约 11–12 人天。

**第 1 项必须最先做。** 框选交互跑不顺，后续所有工作都建立在无法使用的入口之上。
