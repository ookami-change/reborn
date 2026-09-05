# reborn — 小学数学错题本

拍作业 → 圈错题 → 自动排复习 → 打印 A4 复习卷 → 孩子重做 → 扫码录对错 → 更新掌握档位。

面向小学 3–6 年级数学。定位是**练手作品 / 技术验证**，不是创业项目。

- 线上：**http://124.223.185.175/reborn**（域名 www.twincle.com.cn 备案中，未备案期间被运营商 RST 阻断，暂时走裸 IP）
- 进度：[项目进度.md](项目进度.md)

---

## 当前状态

v0.1 全部 9 项开发任务已完成并上线。输入层处于 **L1**（自动切题 + 家长点选），批改模型未接入。

| 能力 | 状态 |
|---|---|
| 拍照上传、手动圈题、遮罩、落库 | ✅ |
| 自动切题（Kimi VLM，约 12s，后台异步） | ✅ |
| Leitner 5 档复习调度 | ✅ |
| A4 复习卷 PDF + 回收二维码 | ✅ |
| 扫码逐题录对错 | ✅ |
| 自动判对错（L2） | ❌ 未开始 |
| 登录（口令 / magic link） | ✅ |
| 按家庭隔离数据 | ✅ |
| HTTPS | ⚠️ 证书和 Caddy 配置都就绪，但**域名未备案被阻断**，当前退回裸 IP 明文 HTTP |
| 自助领取 + 加到手机桌面（PWA） | ✅ |

---

## 本地跑起来

前置：Node 25+、pnpm 11+、PostgreSQL 17、一个腾讯云 COS 桶。

```bash
pnpm --dir web install
cp web/.env.example web/.env.local   # 填入真实值
psql "$DATABASE_URL" -f web/drizzle/0000_nifty_queen_noir.sql
pnpm --dir web dev
```

### ⚠️ 字体文件不在仓库里

`web/assets/NotoSansSC-Regular.otf`（7.9MB）被 `.gitignore` 排除了。**缺了它前面一切正常，一点「生成复习卷」就报文件不存在**——`lib/pdf.ts` 的 `cjkFont()` 直接读这个路径。`scripts/make-icons.mjs` 也读它，但图标产物已提交进仓库，平时不用跑。

自行下载放进去：

```bash
curl -Lo web/assets/NotoSansSC-Regular.otf \
  https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansSC-Regular.otf
```

PDF 里的中文是按**字形轮廓**画的，不内嵌字体（pdf-lib 对 CFF/OTF 子集化会产生错误的字形映射，实测中文和数字全乱码；不做子集化则每个 PDF 涨到 7MB）。代价是 PDF 里的文字不可选中，打印无影响。

---

## 部署

单台腾讯云轻量服务器，Docker 容器 + Caddy 反向代理挂在 `/reborn` 子路径。同机还跑着别的项目，共用 `a-share-net` 网络。

```bash
scp -r web/ root@<host>:/opt/reborn/
ssh root@<host> "cd /opt/reborn && bash deploy/deploy.sh"
```

`deploy.sh` 会建 Postgres 容器（不映射公网端口）、应用 `drizzle/*.sql`、重建应用镜像、校验必填环境变量。服务器上需要 `/opt/reborn/.env.server`（`chmod 600`）。

### 发给试用家长

```bash
bash deploy/invite.sh group          # 发家长群的自助领取链接（需先设 CLAIM_LIMIT / CLAIM_CODE）
bash deploy/invite.sh                # 看谁领了、各自多少道错题
bash deploy/invite.sh add "小明家"    # 单独给某一家生成链接
bash deploy/invite.sh revoke "小明家" # 换掉 token，旧链接立刻失效
```

发出去的是 `/setup/<token>`：这一页会教家长把应用加到手机桌面，并让他自己存一份链接。
详见《试用分发方案》§六。

---

## 目录

```
├── PRD-错题本v0.1.md          产品需求，FR-1…FR-8 带验收标准
├── TRD-错题本v0.1.md          技术方案，DDL / API / 部署 / 风险
├── 系统架构.md                 分层架构与 Attempt 稳定接口
├── 项目进度.md                 ← 进度看板，每次改动更新这里
├── 痛点与针对性设计.md          针对文档所列痛点的具体设计
├── 模型选型与训练路线.md         选型矩阵、数据飞轮、什么时候该训
├── 模型准确率基准测试方案.md      批改准确率怎么测（coverage–FPR 曲线）
├── 切题检出测试方案.md           切题检出怎么测
├── 商业化瓶颈.md               合规、获客、成本、规模上限
├── 作业批改与错题管理App市场调研及可行性分析.md   市场、竞品、用户评价
└── web/
    ├── app/                   页面与 API 路由（Next.js App Router）
    ├── components/            MarkCanvas 圈题画布、MaskEditor 遮罩编辑
    ├── lib/                   db / storage / leitner / pdf / detect
    ├── drizzle/               建表 SQL
    ├── public/                桌面图标与空 service worker（PWA 安装用）
    ├── deploy/deploy.sh       服务器部署脚本
    └── scripts/               COS / PG 探测、单测、邀请链接、生成图标
```

---

## 约束

- **不使用境外模型**（Anthropic / OpenAI 等）。作业图片含未成年人姓名与笔迹，调用境外 API 构成数据出境。
- 所有密钥仅存在于服务端环境变量，不进前端代码，不进仓库。
- 全项目坐标一律归一化（0–1 小数），禁止存像素值。
- 会话 cookie 的 `secure` 由 `BASE_URL` 是否 https 推导，不硬编码——硬编码 `true` 会让本地 `http://localhost` 开发登不上。
- 图片文件从不被修改，遮罩只存坐标、渲染 PDF 时才生效。
