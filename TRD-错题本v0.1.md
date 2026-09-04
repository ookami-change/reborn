# TRD｜错题本 v0.1 技术方案文档

| 项 | 内容 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-09-02 |
| 状态 | 待开发 |
| 配套文档 | 《PRD-错题本v0.1.md》 |

---

---

## 0. 本文档的状态

**v0.1 已全部实现并上线**（http://124.223.185.175/reborn ）。本文档已按实际代码回填，
可直接作为接手开发的依据。与初版设计不一致的地方都在对应章节标注了「实际」与原因。

| 章节 | 与初版设计的差异 |
|---|---|
| §2.1 | 新增 3 列训练信号；`correct_answer` 改为可选 |
| §3.0 | 新增全站鉴权，初版写的「v0.1 无鉴权」已作废 |
| §3.1 | 上传改为服务端接收，**不做浏览器直传**（桶 CORS 不含本域名） |
| §6 | 中文**不内嵌字体**，改画字形轮廓；作答区高度改为钳制 |
| §7 | 路线 A（OCR 题号锚点）**未实现**，实际只有路线 B |
| §8 | 部署平台改为腾讯云轻量服务器 + Docker + Caddy |
| §3.0 | 已按家庭隔离数据（T9b），登录改为 magic link + owner 口令 |
| §10 | 9 项全部完成，后续开发项见 §11 |

代码约定见 `web/AGENTS.md`：**这是 Next 16，很多 API 与训练数据里的不一样，
动手前先读 `node_modules/next/dist/docs/` 里对应的文档。** 例如 `middleware.ts`
已废弃并改名 `proxy.ts`。

## 1. 架构

### 1.1 分层

```
┌───────────────────────────────────────────────────┐
│ 输入层  错题是怎么产生的                             │
│   v0.1  模型自动切题 + 家长点选（L1，已实现）         │
│   v0.3  模型自动判对错 + 家长确认（L2，未开始）        │
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
| 数据库 | PostgreSQL 17 | **自建容器**，不用 Neon/Supabase（境外）。腾讯云 TencentDB 报价 218.4 元/月，不值 |
| ORM | **Drizzle** | `drizzle-orm` + `postgres` |
| 对象存储 | **腾讯云 COS** | `cos-nodejs-sdk-v5`。不是 S3 协议，签名走 TC3-HMAC-SHA256 |
| 鉴权 | 自己写 | `proxy.ts` + HMAC 签名 cookie。没上 next-auth，单口令不值得引依赖 |
| 图片处理 | `sharp` | 服务端压缩、裁剪 |
| PDF 生成 | `pdf-lib` | 纯 JS，可嵌入 JPEG/PNG。**不要用 puppeteer**，在 serverless 环境过重 |
| 二维码 | `qrcode` | 生成 PNG 后嵌入 PDF |
| 前端图片交互 | 原生 DOM + Pointer Events | 见 `web/components/MarkCanvas.tsx`。不需要 Konva |
| 字体 | `@pdf-lib/fontkit` | **只用来取字形轮廓，不嵌字体**，原因见 §6 |

#### 实测版本（2026-09-02 已装）

`next@16.3.4` / `react@19.2.8` / `tailwindcss@4.3.3` / Node 25 / pnpm 11。此版本有几处与旧写法不同，写代码前请注意：

1. **动态路由的 `params` 是 Promise**，必须 await：
   ```ts
   export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
     const { code } = await params;
   }
   ```
2. **`middleware.ts` 已废弃并改名 `proxy.ts`**，导出的函数叫 `proxy`。而且它现在
   默认跑 **Node.js runtime**（15.x 时是 Edge），所以里面可以直接用 `node:crypto`。
3. `web/AGENTS.md` 由 `next dev` 自动生成并要求：写代码前先读
   `node_modules/next/dist/docs/` 下对应文档，不要凭旧版本记忆写。该文件随仓库提交，不要删。
   **这条不是形式主义**——上面两条就是照做才发现的。

Route Handlers 的约定与旧版一致：`app/**/route.ts` 导出 `GET`/`POST` 等具名函数，默认不缓存。

---

## 2. 数据模型

### 2.1 DDL

```sql
-- 一个家庭一个 account。数据隔离的根（§3.0）
CREATE TABLE account (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,          -- 家庭标识，只给运营者看
  join_token   text NOT NULL UNIQUE,   -- magic link 的随机串，改掉它即撤销访问
  is_owner     boolean NOT NULL DEFAULT false,  -- owner 走口令登录
  last_seen_at timestamptz NULL,
  deleted_at   timestamptz NULL,       -- 软删除（T7）
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 监护人同意记录（T7）。出事时这是唯一证据，只增不改
CREATE TABLE consent_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES account(id),
  action         text NOT NULL,   -- 'agree'|'withdraw'
  policy_version text NOT NULL,   -- 改了条款要能区分谁同意的是哪一版
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE child (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid REFERENCES account(id),   -- 隔离的根，见 §3.0
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
  detected_boxes   jsonb NULL,   -- 自动切题的完整结果，见下方说明
  retention_until  timestamptz NULL,  -- 原图保存期限（T7），到期由清理任务删除
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
  correct_answer     text  NOT NULL DEFAULT '',      -- 可为空，见下方说明
  box_origin         text  NOT NULL DEFAULT 'manual',-- 'detected'|'manual'
  box_adjusted       boolean NOT NULL DEFAULT false, -- detected 的框是否被家长改过
  stem_text          text  NULL,       -- v0.1 留空，OCR 接入后填充
  deleted_at         timestamptz NULL, -- 软删除（T7）
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
  short_code  text NOT NULL,          -- 'R07'。唯一性是 (child_id, short_code)，见 §3.0
  item_order  jsonb NOT NULL,         -- [{seq:1, problem_id:"...", code:"01"}, ...]
  per_page    int  NOT NULL DEFAULT 5,
  with_answer_page boolean NOT NULL DEFAULT true,
  pdf_key     text NULL,
  status      text NOT NULL DEFAULT 'generated',  -- 'generated'|'collected'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON review_sheet (child_id, short_code);
```

**软删除为什么不是物理删除**（T7）

`DELETE /api/mistakes/:id` 只置 `problem.deleted_at`，不物理删。物理删会 cascade
掉 `attempt`，而那批作答记录是掌握状态可重算的唯一依据（§2.2）。错题卡同时置为
`mastered` 让它退出复习调度。

**`correct_answer` 为什么可以为空**

这个字段的全部引用都是展示，没有一处参与逻辑判断：生成 PDF 要的是题图和遮罩，
扫码判对错家长对着原卷判，Leitner 状态机根本不碰它。初版把它设成必填，等于逼
家长在刚检查完作业最不耐烦的时刻逐题打字，圈 5 道题要超过 1 分钟。现在圈完即存，
答案在扫码回收那一屏顺手补——那时家长手里有原卷和孩子重做的，本来就在逐题看。
详见《痛点与针对性设计》§二。

**`box_origin` / `box_adjusted` / `detected_boxes` 是什么**

家长每一次操作都是一条免费的检出标注，这三列把它们留下来：

| 家长动作 | 等价标注 |
|---|---|
| 采纳模型给的框 | `box_origin='detected'`，正样本 |
| 手画模型没给的框 | `box_origin='manual'`，**漏检样本**（最值钱） |
| 拖动/缩放模型的框 | `box_adjusted=true`，框回归修正样本 |
| 无视模型给的框 | 只出现在 `detected_boxes` 里，虚检样本 |

`capture.detected_boxes` 存的是模型输出的**全部**框（含家长没采纳的），结构为
`{ model, ms, boxes: Box[], at, error? }`。**只存被采纳的框就永远算不出虚检率和
召回率**，这是这一列存在的全部理由。`scripts/export-dataset.mjs` 把它导成
YOLO 标签 + manifest + 统计。

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

所有接口位于 `/api/*`，返回 JSON。**除 `/api/auth/login` 外全部需要登录**。

### 3.0 鉴权与数据隔离

两条登录入口，都产出一个**绑定到某个 account 的会话**：

| 入口 | 谁用 | 怎么进 |
|---|---|---|
| 口令 `APP_PASSWORD` | 我自己 | `/login` 输口令 → owner 账号 |
| **magic link** | 试用家长 | `/join/<32 字符随机串>` 点开即登录 → 该家庭的账号 |

magic link 的取舍：零注册摩擦、天然数据隔离、不用短信也不用密码；代价是链接
被转发出去等于账号泄露，5–10 个家庭的试用范围内可接受（《试用分发方案》§六）。
撤销某个家庭 = 改掉它的 `join_token`（`deploy/invite.sh revoke "名字"`）。

`proxy.ts`（Next 16 里 `middleware.ts` 已废弃并改名）拦截所有请求：

| 情况 | 响应 |
|---|---|
| 已登录 | 放行 |
| 未登录且访问页面 | 307 → `/login?next=<原路径>` |
| 未登录且访问接口 | 401 `{"error":"未登录"}` |
| `/login`、`/api/auth/login`、`/join/*`、`_next/static` | 直接放行 |
| 已登录但未同意条款 | 页面 302 → `/consent`；接口 403（见下） |

```
POST /api/auth/login
  req: { password: string }
  res: { ok: true }        + Set-Cookie: reborn_session（绑定 owner 账号）
  401  口令错误   429  同一 IP 连续失败 8 次，锁 10 分钟

POST /api/auth/logout
  res: { ok: true }        + 清除 cookie

GET  /join/:token
  302 → 首页 + Set-Cookie（绑定该家庭的账号）
  token 无效时 302 → /login，不区分"不存在"和"已撤销"，也不回显 token
```

会话 token 是 `<payload>.<HMAC-SHA256>`，payload 是 `{ aid, exp }`，有效期 30 天
（扫码回收发生在手机上，每次都要登录会毁掉「扫码即用」这个关键设计）。

**账号 id 怎么传到路由**：`proxy` 验签后写进请求头 `x-reborn-account`，
路由用 `lib/session.ts` 的 `currentAccountId()` / `currentChildId()` 读。
这是官方文档给的传值方式——proxy 与渲染代码不共享模块和全局变量。
proxy **无条件先删掉外部传进来的同名头**，所以客户端伪造无效。

`currentAccountId()` 拿不到值时**抛异常，不降级**。走到那里还没有值只可能是
proxy 的 matcher 漏了路径，默默降级就等于「看所有人的数据」。

#### 监护人同意（T12）

未同意当前版本条款的账号，除 `/consent` 与 `/api/consent` 外一律拦下：页面 302 到
同意页，接口返回 `403 {"consent":true}`（前端 `apiFetch` 见到 403 就跳同意页）。

**已同意的版本放在签过名的 cookie 里**（`Session.cv`），不是每次查库——proxy 每个
请求都要跑，不能为它引入一次数据库往返。`POST /api/consent` 写完 `consent_log`
后重新签发 cookie 把版本带上；`/login` 与 `/join` 也会查一次已有同意并带上，
所以换设备不会被要求重新同意。`consent_log` 只增不改，它才是记录本身。

改条款就改 `POLICY_VERSION`，所有人会被要求重新同意。

同意页文案的原则：**如实说清楚**，不写「我们承诺保护您的隐私」这种空话。
尤其是「照片会发给月之暗面（Kimi）的模型接口」这一条——不写就是隐瞒。

```
POST /api/consent
  res: { ok: true }   写入 consent_log + 重签 cookie
```

#### 数据隔离的四条规则

四张主表（`capture` / `problem` / `mistake_card` / `review_sheet`）都有 `child_id`，
`child.account_id` 指向 account。**每一个碰这四张表的查询都必须带 `childId`。**

| 规则 | 为什么 |
|---|---|
| 列表查询加 `where child_id = ?` | 漏一处就是把别家的数据显示出来 |
| **详情/改/删按 `(id, child_id)` 查**，不是只按 id | 只按 id 查 = 任何人拿到 UUID 就能读写别家的数据。这是最常见的越权漏洞 |
| 查不到时返回 **404 而不是 403** | 403 会泄漏「这个 id 存在，只是不属于你」 |
| **短码查询必须带 `childId`** | `R01`/`R02` 是连号，**可以枚举**。输个 `R08` 就能读甚至改别家的复习卷 |

短码的唯一索引也从 `(short_code)` 改成 `(child_id, short_code)`——全局唯一在多账号
下会撞键，因为每个孩子的第一张卷都叫 `R01`。

**实测隔离结果**（B 家的 cookie 直取 owner 的资源）：

| 接口 | B 家 | owner |
|---|---|---|
| `GET /api/captures/:id` | 404 | 200 |
| `POST /api/captures/:id/detect` | 404 | 200 |
| `POST /api/captures/:id/problems` | 404 | 200 |
| `GET /api/mistakes/:id` | 404 | 200 |
| `PATCH /api/mistakes/:id` | 404 | 200 |
| `GET /api/review/sheets/:code` | 404 | 200 |
| `POST /api/review/sheets/:code/collect` | 404 | 409 |

改动这一层时**必须重跑这张表**。脚本思路见提交 `T9b`。

**接口一定要返回 401 JSON，不能返回登录页 HTML**，否则前端 `fetch` 拿到的是一坨
解析不了的东西。客户端统一用 `lib/paths.ts` 的 `apiFetch`，它在 401 时把人送回
登录页并记住当前位置。

**重定向必须用 `req.nextUrl.clone()`**，手拼 `new URL()` 会丢掉 `/reborn` 前缀。

限流按 `X-Forwarded-For` 的**最右**值分桶：最左那个是客户端自己填的，可以随便
伪造，按它分桶等于没有限流；最右是我们自己的 Caddy 追加的真实对端地址。

⚠️ 站点目前走 http（IP 直连无证书），口令与 cookie 明文传输。挡得住误入的人，
挡不住同网络嗅探。上真实用户前必须先上 TLS，同时把登录 cookie 的 `secure` 改为
`true`（现在设 `true` 浏览器就不回传，直接登不上）。

### 3.1 上传

```
POST /api/captures            multipart/form-data
  req:  file=<图片>, sourceType=homework|exam|review_redo
  res:  { captureId: string }
  400 缺少文件   413 超过 10MB
```

**走服务端接收，不做浏览器直传。** 初版设计的 `POST /api/upload-url` 预签名直传
**没有实现**：桶由 CloudBase 托管，CORS 白名单不含本项目域名，浏览器直接 PUT 会被
拦。服务端收到后用 `sharp` 按 EXIF 摆正、压到最长边 2000px / JPEG q85 再存 COS。

```
GET /api/captures
  res: { items: [{ id, imageUrl, sourceType, createdAt }] }
```
待整理列表：拍了还没圈题的作业，排除 `review_redo`。

### 3.2 圈题

```
GET  /api/captures/:id
  res: { id, imageUrl, marked, detectedBoxes: Box[] | null }
```
`imageUrl` 为带签名的临时读取链接。`detectedBoxes` 返回**已落库的**检出结果；
未跑过、检出关闭或跑失败时为 `null`，此时前端再触发下面的 POST。
**跑过就不要重跑**：一次约 12 秒，还占一个 RPM 额度（账号上限只有 3）。

```
POST /api/captures/:id/detect
  res: { boxes: Box[] }          // Box = { x, y, w, h }  归一化
```
按需触发自动切题。前端在圈题页加载时调用，失败或未开启时静默降级为纯手动模式。

```
POST /api/captures/:id/problems
  req:  { items: [{
            cropBox:   Box,
            maskBoxes?: Box[],
            correctAnswer?: string,          // 可选，见 §2.1
            childAnswer?:  string,
            boxOrigin?: "detected" | "manual",  // 训练信号，见 §2.1
            boxAdjusted?: boolean
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

GET  /api/review/sheets
  res: { items: [{ id, shortCode, status, itemCount, pdfUrl, createdAt }] }
       // 复习卷列表，待回收的可点进去录结果

POST /api/review/sheets
  req: { problemIds: string[], perPage?: 5, withAnswerPage?: true }
  res: { sheetId, shortCode: "R07", pdfUrl: string }
       // childId 由服务端取，不从请求体收

GET  /api/review/sheets/:code
  res: { shortCode, status, items: [{ seq, code, problemId, cropImageUrl }], pdfUrl }

POST /api/review/sheets/:code/collect
  req: { results: [{ problemId, verdict: "right"|"wrong",
                     correctAnswer?: string }] }   // 顺手补答案，见 §2.1
  res: { rightCount, wrongCount, resetCount, masteredCount }
```
回收接口在一个事务内：为每题写入 `attempt`、按 §4.1 更新 `mistake_card`、将 sheet 置为 `collected`。**同一张卷重复回收应返回 409。**

### 3.5 首页

```
GET /api/home
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
| 上传 | **服务端**用 `sharp` 按 EXIF 摆正、压到最长边 2000px、JPEG q85。放在服务端是因为不能浏览器直传（§3.1） |
| 原图存储 | `raw/{captureId}.jpg`，保留 90 天后可归档或删除 |
| 裁剪 | 服务端用 `sharp` 按 `crop_box` 从原图裁出，JPEG 质量 0.9，存 `crop/{problemId}.jpg`，**永久保留** |
| 遮罩 | **不修改图片文件**。遮罩只存坐标，在 PDF 渲染时用白色实心矩形覆盖在题图之上 |

### 5.2 存储估算

单孩子一学期约 2000 张原图（约 600MB）+ 500 张裁剪图（约 50MB）。原图设置生命周期规则自动过期，长期占用主要是裁剪图。

### 5.3 已知坑：COS 并发取图会返回空 Body

`getObject` 在被 Next 打包进 server chunk 后，**并发调用会间歇性返回空 Body**
（组卷取 3 张图时约一半请求中招）。下游 `pdf-lib` 只会抛一句
`SOI not found in JPEG`，完全看不出是存储层的问题。

`lib/storage.ts` 已加校验 + 3 次重试，失败时报出 key。**调用方仍应避免并发调用**。

---

## 6. PDF 生成

用 `pdf-lib` 在服务端渲染。

**中文不内嵌字体，改画字形轮廓。** 初版写的「以子集方式嵌入」实测走不通：

| 做法 | 结果 |
|---|---|
| `embedFont(otf, { subset: true })` | 中文和数字**全部乱码**——pdf-lib 对 CFF/OTF 子集化会产生错误的字形映射 |
| 换变量 TTF + 子集化 | 只渲染出一个字形 |
| `subset: false` | 正确，但每个 PDF 涨到 **7.1MB** |
| 离线用 fonttools 预裁子集 | 仍乱码。我第一次取了 CJK 区段的前 3500 个码点，但那个区段是按部首笔画排的不是按频率，「我」「的」都不在里面 |
| **`fontkit.create()` + `glyph.path.scale(1,-1).toSVG()` + `drawSvgPath()`** | **正确，PDF 48KB，无缺字** ← 采用 |

代价是 PDF 里的文字不可选中——打印用的卷子无所谓。

注意 fontkit 字形的 y 轴向上，而 `drawSvgPath` 按 SVG 的 y 轴向下，要先 `scale(1,-1)` 抵消。

字体文件 `web/assets/NotoSansSC-Regular.otf`（7.9MB）**被 gitignore 排除**，克隆后
必须自行下载放入，否则前面一切正常、一点「生成复习卷」才报文件不存在。下载方式见 README。

### 6.1 版式参数

| 参数 | 值 |
|---|---|
| 纸张 | A4 纵向，595 × 842 pt |
| 页边距 | 40 pt |
| 内容区宽度 | 515 pt |
| 页眉高度 | 76 pt |
| 二维码 | 64 × 64 pt，右上角 |
| 短码列宽 | 24 pt |
| 题图可用宽度 | 515 − 24 − 8 = 483 pt，等比缩放 |
| **作答区高度** | `clamp(题图高度 × 0.6, 34pt, 170pt)`，即 12–60mm |
| 题间距 | 16 pt |

**作答区为什么要钳制。** 初版的「题图高度 × 0.6」方向就是错的：孩子的字高是固定的，
跟题图多高无关。实测口算行的题图只有 34pt 高，作答区就只剩 **7.2mm，写不下**；
而竖式题图 221pt 高，作答区给到 46.9mm，纯浪费。越简单的题给的空间越小，正好反了。
下限 34pt = 12mm 是一行手写数字的最小高度，上限 170pt = 60mm 再大就是浪费纸。

**二维码为什么是 64 而不是 50。** 48 字的回收链接是 33×33 模块，50pt 边长时单模块
只有 0.53mm，正好卡在家用打印机的可靠阈值上。扫码是整个闭环的硬依赖——扫不出来
家长就完全没法录结果。64pt 时是 0.68mm。页眉另印一行小字的回收链接作为扫码失败的退路。

### 6.2 渲染步骤

1. 读取每道题的裁剪图
2. 计算等比缩放后的宽高，累加判断当前页是否放得下（放不下则新建页，**题目不允许跨页截断**）
3. 绘制短码文本
4. 绘制题图
5. **在题图之上，按 `mask_boxes` 的归一化坐标换算成 pt，绘制白色实心矩形**
6. 预留作答区空白
7. 全部题目绘制完成后，若 `with_answer_page` 为 true **且至少有一道题填了答案**，
   新建一页写答案列表。**只列非空的**，否则印出来是一列光秃秃的题号
8. 输出 PDF 上传对象存储，回填 `review_sheet.pdf_key`

### 6.3 二维码内容

编码为回收页完整 URL：`{BASE_URL}/review/{shortCode}/collect`

---

## 7. 模型接入

### 7.1 v0.1 的定位

模型只用于**自动切题检出**一处，且**可选**。`DETECT_MODE=none` 时系统完整可用，
家长通过点击手动生成框。检出失败一律静默降级为手动，不阻塞主流程。

**已实现，线上开启中。** 用的是路线 B。

### 7.2 接口抽象

```ts
type Box = { x: number; y: number; w: number; h: number };  // 归一化 0-1

type Detector = {
  name: string;                          // 落库到 detected_boxes.model
  detect(jpeg: Buffer): Promise<Box[]>;  // 收图片字节，不是 URL
};

// 由环境变量 DETECT_MODE 选择实现
// 'none' -> noop         返回 []
// 'vlm'  -> VlmDetector  路线 B
```

**签名与初版不同**：初版写的是 `detect(imageUrl: string)`，实际收 `Buffer`。
因为图片要以 base64 内联进请求体发给模型，服务端本来就得先取回字节；传 URL 会
多一次往返，而且模型侧未必能访问我们的签名链接。

新增实现不得修改调用方代码。

### 7.3 路线 A：OCR + 题号锚点 —— **未实现**

初版推荐先做这条，实际**没有做**：拿到的是 Kimi 的 key，它是 VLM 不是 OCR 服务，
路线 A 根本没有可用的供应商入口。这条路线的设计保留在下面，接手后如果拿到 OCR
额度可以按此实现，它的优势是延迟 1–2 秒且切分逻辑完全在自有代码里、可调试。

1. 调用云 OCR 的「通用文字识别（含位置）」接口，得到每个文本块的 `{ text, box }`
2. 用正则匹配题号：`^\d+[.、]`、`^[(（]\d+[)）]`、`^[①②③④⑤⑥⑦⑧⑨⑩]`
3. 按 y 坐标升序排列题号锚点
4. 相邻两个题号锚点之间的纵向区域即为一道题，横向取内容区全宽
5. 最后一个题号到页面底部（或最后一个文本块下沿）为最后一题

### 7.4 路线 B：VLM 直接输出框 —— 已实现

`lib/detect.ts`。提示词要求只输出 `[{x,y,w,h}]` 的 JSON，坐标为相对宽高的 0–1 比例，
并明确要求**宁可多框也不要漏框**（多框家长不点就行，漏掉家长就找不到了）。

解析要容错：模型可能裹代码块、可能在 JSON 前后带说明文字。`parseBoxes()` 会剥
围栏、截取首个 `[` 到末个 `]`、钳到 0–1、滤掉过小的框。

**接入新供应商时必须先用一张图验证坐标基准**：各厂商返回的可能是 0–1 小数、
0–1000 整数或原图像素值。统一转成归一化值再返回。

**实测（2026-09-03，1600×2200 合成作业页，12 道题）**：

| 模型 | 检出 | 耗时 | 结论 |
|---|---|---:|---|
| `kimi-k3` | 12/12 | 125–146s | 推理模型，输出 6000+ token 思考。不可用 |
| `kimi-k2.6` | 12/12 | 136s | 同上 |
| **`kimi-k2.7-code-highspeed`** | **12/12** | **9–12s** | 三次运行稳定，**线上用这个** |

⚠️ **这个 12/12 不作数**：跑的是合成图——正射、无阴影、印刷体、纯白底，是最容易的
输入。真实照片有透视倾斜、褶皱阴影、铅笔淡痕、手指入镜。**接手后第一件事是拿
20 张真实作业照片复测**，判据见《切题检出测试方案》。

**踩过的坑：**

| 坑 | 现象 |
|---|---|
| `temperature` 参数 | 这些模型只接受 1，传别的值直接 400 |
| RPM 上限 3 | 429。已加 20 秒退避重试 3 次，但那是缓解不是解决，多家庭并发会排队 |
| 漏配 `DETECT_MODE` | 接口正常返回 **0 个框**，表现得像模型不可用。`deploy.sh` 已加启动校验 |

### 7.5 供应商

| 用途 | 供应商 | Base URL | 注意事项 |
|---|---|---|---|
| **VLM（在用）** | Moonshot / Kimi | `https://api.moonshot.cn/v1` | OpenAI 兼容。不要传 `temperature`。注意 RPM 限额 |
| VLM | 阿里云百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | OpenAI 兼容格式 |
| VLM | 火山方舟 | `https://ark.cn-beijing.volces.com/api/v3` | **需先在控制台创建「推理接入点」，请求中填 endpoint id 而非模型名** |
| VLM | 智谱 | `https://open.bigmodel.cn/api/paas/v4` | GLM-4V 系列 |
| OCR（路线 A 用） | 阿里云 / 腾讯云 / 百度智能云 | 各家 SDK | 必须是**返回位置坐标**的那个接口 |

**不使用境外模型**（含 Anthropic / OpenAI 等）。除合规原因外，这是项目的明确选型约束。

具体模型 ID 以各厂商控制台当前在售版本为准。

**合规约束**：本产品处理未成年人的作业图片。开放给自家以外的用户时，**只能使用
境内可商用模型**，不得调用境外模型服务。

**选型的下一步**：检出其实用不到 VLM 的推理能力，只需要认版式。专用的版面分析模型
（DocLayout-YOLO、PaddleOCR PP-Structure）在 CPU 上 0.3–1 秒就能跑完，无 RPM 限制，
而且本地推理**图片不出服务器**。值得测一次对照。详见《模型选型与训练路线》§二。

### 7.6 调用链路

```
浏览器
  │ ① POST /api/captures  (multipart)   图片经服务端存入 COS
  │ ② GET  /api/captures/:id            已有检出结果就直接用，跳过 ③
  │ ③ POST /api/captures/:id/detect     后台异步触发，不阻塞圈题
  ▼
Next.js API Route（服务端）
  │ ④ 由 image_key 从 COS 取回图片字节
  │ ⑤ 调 VLM，图片 base64 内联（API key 仅存在于服务端环境变量）
  │ ⑥ 解析 → 归一化 → **连同模型名与耗时一起落库 capture.detected_boxes**
  │ ⑦ 返回 boxes
  ▼
浏览器把灰色候选框铺上去
```

**检出走后台异步**：12 秒超出 PRD 要求的 5 秒，但圈题页一打开就能手动圈，
框到了再铺上去，用户感知不到延迟。任何失败都静默降级。

---

## 8. 部署

### 8.1 环境变量

`web/.env.example` 是权威清单，下面是说明。本地放 `web/.env.local`，
服务器放 `/opt/reborn/.env.server`（`chmod 600`），两者都被 gitignore。

```
DATABASE_URL=                 # postgres://user:pass@host:5432/db
BASE_URL=                     # 复习卷二维码里写死的前缀，必须是孩子手机能访问到的
NEXT_PUBLIC_BASE_PATH=        # 挂在 Caddy 子路径下时填 /reborn，本地留空

COS_BUCKET=                   # 腾讯云 COS，不是 S3
COS_REGION=
COS_PREFIX=
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=

APP_PASSWORD=                 # 全站共享口令
SESSION_SECRET=               # 会话签名密钥，≥16 字符。留空时 deploy.sh 自动生成并写回
                              # 换掉它 = 所有人被登出

DETECT_MODE=none              # none | vlm
VLM_BASE_URL=
VLM_API_KEY=
VLM_MODEL=

PG_USER= PG_PASSWORD= PG_DB=  # 仅 deploy.sh 用，用来拼 DATABASE_URL
```

**`NEXT_PUBLIC_BASE_PATH` 在构建时固化**，改了必须重新构建镜像。

`deploy.sh` 会校验必填项。这条校验是有来历的：`.env.server` 曾漏了 `DETECT_MODE`，
接口一切正常但永远返回 0 个框，表现得像模型不可用，排查了很久。**宁可启动就失败。**

### 8.2 部署平台

**实际：腾讯云轻量应用服务器（4G 内存），Docker + Caddy。** 初版写的
Railway / Fly.io 没有采用——那是境外，与「作业图片不出境」的约束冲突。

```
Caddy (80/443)
  ├─ path /reborn /reborn/*  → reborn-app:3000
  └─ 其余                     → 同机的其他项目
reborn-app  (Next standalone, output: "standalone")
reborn-db   (postgres:17-alpine，**不映射公网端口**，只在 docker 网络内可见)
```

同机还跑着别的生产项目，共用 `a-share-net` 网络与同一个 Caddy 入口。
**改 Caddyfile 前先备份**，备份在 `/opt/a-share-sector-pilot/deploy/Caddyfile.bak.*`。

Caddy 里**不能**再写 `/reborn` → `/reborn/` 的跳转：Next 的 basePath 会把
`/reborn/` 规范化回 `/reborn`，两者互相重定向成环。用一个匹配器
`path /reborn /reborn/*` 同时覆盖。

不建议 Vercel：serverless 有执行时长上限（免费档 10 秒），VLM 调用和 PDF 生成都会超时。

**部署脚本**

| 脚本 | 作用 |
|---|---|
| `deploy/sync.sh` | 本地 → 服务器同步并部署。**日常只用这个** |
| `deploy/deploy.sh` | 在服务器上执行：建库容器、跑迁移、构建镜像、重启 |
| `deploy/export-dataset.sh` | 导出检出训练集 |
| `deploy/invite.sh` | 家庭邀请链接：`invite.sh` 列出 / `add "小明家"` 新建 / `revoke "小明家"` 撤销 |

⚠️ `sync.sh` 用 `rsync --delete`，会删掉服务器上本地没有的文件。**`.env.server`
只存在于服务器**，曾因忘了排除被整个删掉（14 个变量，靠 `docker inspect reborn-app`
从运行中的容器里捞回来的）。改 `EXCLUDES` 数组前想清楚。

迁移是 `for f in drizzle/*.sql` 每次部署全部重跑，所以**每条 DDL 必须幂等**
（`ADD COLUMN IF NOT EXISTS` 之类）。

⚠️ 导出脚本不能直接用 `reborn:latest` 跑：Next 的 standalone 产物把 `postgres`
打包进了 server chunk，`/app/node_modules` 里没有独立模块；也不能只把脚本挂进去，
**ESM 是从脚本所在目录往上找 `node_modules` 而不是 cwd**。

### 8.3 交付形态

移动端网页，链接直接分发。**不做小程序、不做 App 打包、不上应用商店、不申请备案。**

### 8.4 测试

```bash
pnpm test     # 30 条断言
```

| 文件 | 覆盖 |
|---|---|
| `scripts/test-leitner.mjs` | 9 条，状态机的每条转移 |
| `scripts/test-pdf.mjs` | 8 条，答案页跳过、作答区上下限、不跨页截断 |
| `scripts/test-auth.mjs` | 13 条，重点是伪造：改 payload 保留原签名、换密钥、过期边界 |

`scripts/preview-sheet.mjs` 本地生成复习卷 PDF 并转 PNG，供肉眼查排版，不连库不连 COS。

**排版断言直接测几何函数 `answerHeight`，不反解像素**——像素启发式太脆，量出过负数。

---

## 9. 风险与对策

| 风险 | 状态 | 对策 |
|---|---|---|
| 圈题页的图片框选交互 | 🟢 已完成 | 纯 Pointer Events，框是百分比定位的 div 放在带变换的 stage 里，自动跟随缩放 |
| 检出的 12/12 是**合成图**跑出来的 | 🔴 **未验证** | 必须拿真实作业照片复测，见 §7.4 |
| Kimi 账号 RPM 上限 3 | 🟡 | 已加 429 退避重试；多家庭并发仍会排队。考虑换本地版面模型 |
| ~~共享口令，没有按家庭隔离数据~~ | 🟢 已修 | magic link + 每个查询按 childId 收敛，7 个接口的越权实测全 404（§3.0） |
| magic link 被转发出去 = 账号泄露 | 🟡 接受 | 5–10 个家庭的试用范围内可接受。撤销用 `invite.sh revoke` |
| **站点走 http，口令与 cookie 明文** | 🔴 | 上 TLS，见 §11 的 T11 |
| 数据模型缺合规字段 | 🟡 | `deleted_at` / `retention_until` / `consent_log`，见 §11 的 T7 |
| COS 并发取图返回空 Body | 🟡 已缓解 | 见 §5.3。已加重试，调用方仍应避免并发 |
| 字体文件被 gitignore | 🟢 已写明 | README 有下载命令 |
| 各厂商坐标基准不一致 | 🟢 | 统一在 Detector 实现内转归一化，接入时用单张图验证 |
| 复习卷丢失 | 🟢 | `item_order` 持久化，可重新生成完全相同的 PDF |
| 图片存储增长 | 🟡 | 原图设 90 天生命周期规则，裁剪图永久保留 |
| 微信内置浏览器限制 | 🔴 **未测** | PDF 下载、相机调用可能受限，必须实测 |
| 密钥曾在对话中明文出现 | 🟡 | 腾讯云 ×2、Kimi ×1，**建议轮换** |

---

## 10. 开发顺序 —— 已全部完成

| 序 | 内容 | 提交 |
|---|---|---|
| 1 | 圈题页框选交互原型 | `0e0bbef` |
| 2 | 建库建表、对象存储、上传链路 | `6b29266` `f57f8eb` |
| 3 | 圈题 Step2（遮罩、答案）+ 裁剪落库 | `eb3ca68` |
| 4 | 错题本列表、详情页 | `f708464` |
| 5 | Leitner 状态机 + 首页聚合 | `f708464` |
| 6 | 组卷 + PDF 渲染 + 二维码 | `9bb5aca` |
| 7 | 扫码回收 + 状态更新 | `9bb5aca` |
| 8 | 真机联调 | 🔴 **部分**：拍作业/圈错题/详情已走通；**打印手感与扫码未验证** |
| 9 | 接入自动检出 | `9726103` |

其后的改动：训练信号落库 `887b510`、PDF 排版三处修复 `e62893a`、答案改可选 `43aa95e`、
组卷与点选修复 `6403862`、鉴权 `ebfaa52`。

---

## 11. 接手后的开发项

优先级判据只有一条：**会不会导致家长在两周内停用**。完整清单见 `项目进度.md`。

| # | 事项 | 工作量 | 何时必须做完 |
|---|---|---|---|
| **T3** | **拿真实作业照片复测检出** | 1 小时 | **最先做**。现在所有检出结论都建立在一张合成图上 |
| T4 | 本地版面模型（DocLayout-YOLO / PP-Structure）对照测试 | 半天 | T3 之后 |
| ~~T9b~~ | ~~按家庭隔离数据~~ | 1–2 天 | ✅ 已完成，见 §3.0 |
| ~~T7~~ | ~~合规字段~~ | 半天 | ✅ 列已加、软删除已接。**同意流程的 UI 还没做** |
| **T11** | **上 TLS**，并把登录 cookie 的 `secure` 改回 `true` | 半天 | ⏸ 卡在域名+备案，见《试用分发方案》§四 |
| ~~T12~~ | ~~监护人同意 UI~~ | 半天 | ✅ 已完成，见 §3.0 |
| T13 | 原图到期清理任务（按 `capture.retention_until`） | 半天 | 不急，但列已加好 |
| T5 | 框住纸上的答案区（零打字补答案） | 半天 | 看 T1 之后家长实际怎么用 |
| T6 | `correction` 表 + 判定可追溯 | 1 天 | **接批改模型之前** |
| T8 | 假掌握处理 | —— | 暂不做，攒两个月数据再定 |

**接批改模型（L2）之前必须先做 T6。** 误判是竞品负面评价里排第一的，家长问
「凭什么判我孩子错」时必须能调出原图、模型输出、置信度。申诉记录同时是评测集
和微调训练集——误判从纯负债变成资产。详见《痛点与针对性设计》§四。

### 配套文档

| 文档 | 回答什么 |
|---|---|
| `PRD-错题本v0.1.md` | 要做什么功能，验收标准 |
| `项目进度.md` | **状态入口**，阻塞项 / 待办 / 决策记录 / 风险 |
| `痛点与针对性设计.md` | 用户会在哪里放弃，怎么改 |
| `模型选型与训练路线.md` | 用哪个模型，什么时候该自己训 |
| `切题检出测试方案.md` | 检出怎么测（错题召回率 + 虚检数） |
| `模型准确率基准测试方案.md` | 批改怎么测（coverage–FPR 曲线） |
| `试用分发方案.md` | **发给家长群前必须读**：域名/备案/HTTPS、微信里的坑、规模控制 |
| `商业化瓶颈.md` | 合规、获客、成本、单人业余的规模上限 |
| `系统架构.md` | 为什么这么分层，`Attempt` 接口为什么必须稳定 |
