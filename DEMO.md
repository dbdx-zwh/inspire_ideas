# Inspire Ideas · Demo 上手指南

面向新加入项目的开发者。目标是 **30 分钟内从零跑起来完整体验一遍**。

---

## 目录

1. [前置准备](#1-前置准备)
2. [第一次运行 · 从零到 Demo](#2-第一次运行--从零到-demo)
3. [两种运行模式](#3-两种运行模式)
4. [功能测试清单](#4-功能测试清单)
5. [Demo 演示脚本](#5-demo-演示脚本)
6. [常见问题排查](#6-常见问题排查)

---

## 1. 前置准备

你需要装：

| 工具 | 版本要求 | 安装方式 |
|---|---|---|
| **Node.js** | ≥ 18 | https://nodejs.org/ 或 `brew install node` |
| **npm** | ≥ 9 | 随 Node.js 一起装 |

**数据库**（二选一）：

- **推荐 · Supabase 云 Postgres**：注册免费账号，2 分钟建库，无需本地装任何东西
- **本地 Postgres**：Homebrew `brew install postgresql@16` 或 Docker `docker compose`

如果你只是想快速体验产品功能，**跳过数据库**：直接用 Mock 模式跑，全部数据由前端 MSW 拦截。见 [模式 A](#模式-a--纯前端-mock最快无需后端)。

---

## 2. 第一次运行 · 从零到 Demo

### Step 1 · 获取代码 & 装依赖

```bash
# 克隆代码（或从你拿到的 zip 解压）
cd inspire_ideas_v0

# 装所有依赖（monorepo，会同时装前端 + 后端 + shared）
npm install

# 初始化 MSW 的 service worker（第一次必须跑）
npx msw init public/ --save
```

装依赖大概 2-10 分钟，取决于网络。

### Step 2 · 选择运行模式

不同的验证目的走不同路径：

- **只想看 UI 交互效果** → [模式 A · 纯 Mock](#模式-a--纯前端-mock最快无需后端)
- **想验证真实后端 + 数据库 + arXiv 抓取** → [模式 B · 完整联调](#模式-b--完整联调有数据库--后端)

---

## 3. 两种运行模式

### 模式 A · 纯前端 Mock（最快，无需后端）

无需数据库和后端服务，所有 API 由浏览器 Service Worker 拦截返回 Mock 数据。

**Step A1 · 配环境变量**

创建 `.env.local`（项目根目录）：

```bash
VITE_USE_MOCK=true
```

或者直接跳过这一步——默认就是 Mock 模式。

**Step A2 · 启动**

```bash
npm run dev
```

打开 http://localhost:5173，无需登录，直接进入 Feed 页。

**限制**：数据不真实、页面刷新会重置状态、没有真实的 arXiv 论文。

---

### 模式 B · 完整联调（有数据库 + 后端）

**Step B1 · 建 Supabase 数据库（免费）**

1. 注册 https://supabase.com/
2. 建新项目（选个亚洲区，如 Tokyo/Singapore）
3. 记住你设置的**数据库密码**
4. 项目就绪后，从 **Project Settings → Database → Connection string** 拿两个连接串：
   - Transaction pooler (6543) — 应用查询用
   - Session pooler / Direct (5432) — Prisma migration 用

**Step B2 · 配后端环境变量**

创建 `apps/api/.env`（用真实密码替换 `YOURPASSWORD`）：

```bash
DATABASE_URL="postgresql://postgres.xxx:YOURPASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.xxx:YOURPASSWORD@aws-0-region.pooler.supabase.com:5432/postgres"

JWT_SECRET="dev-only-please-generate-a-real-64char-random-string-in-production"
PORT=4000
FRONTEND_ORIGIN="http://localhost:5173"
NODE_ENV="development"
```

> 💡 密码里如果有 `@` `$` `#` 等特殊字符，需要 URL encode（`@`→`%40`）。建议直接用不含特殊字符的密码。

**Step B3 · 建表 + 塞入 Demo 数据**

```bash
# 建表结构
npm run db:migrate
# 询问 migration 名字时输入 init

# 塞入 demo 用户和示例论文
npm run db:seed
```

seed 会创建：
- **Demo 账号**：`demo@inspire.local` / `demo1234`
- 3 位博主、10 个目录、2 篇示例论文

**Step B4 · 起后端**

新终端跑：

```bash
npm run api:dev
```

看到 `🚀 Inspire API listening on http://localhost:4000` 就 OK，**这个终端保持不关**。

**Step B5 · 配前端环境变量**

创建 `.env.local`（项目根目录）：

```bash
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:4000/api
```

**Step B6 · 起前端**

再开一个终端：

```bash
npm run dev
```

浏览器打开 http://localhost:5173

会自动跳到登录页，用 demo 账号登录：
- 邮箱：`demo@inspire.local`
- 密码：`demo1234`

---

## 4. 功能测试清单

登录后按以下顺序过一遍。**每一项都应该能正常工作**，如果发现任何问题记录下来。

### ✅ Feed 流

- [ ] 页面能看到 2 篇 seed 论文卡片（Seq Fusion + Long-Context Attention）
- [ ] 点顶部「刷新论文」按钮 → toast 提示"已抓取 XX 篇，新增 XX 篇"（模式 B 才有）
- [ ] 刷新后 Feed 列表出现真实的 arXiv 论文
- [ ] 切换筛选：领域下拉能过滤（如"推荐系统"）
- [ ] 切换筛选：来源"博主推荐"只显示有博主推荐的论文
- [ ] 搜索框输入关键词能过滤
- [ ] 滚动到底会自动加载更多

### ✅ 博主管理弹窗

- [ ] 点顶部「管理关注博主」按钮弹窗弹出
- [ ] 能看到 3 位 seed 博主：推荐系统前沿 / AI 论文速递 / LLM 工程实践
- [ ] 输入新博主名 → 点「+ 添加」→ 列表实时出现新博主 + 进度条抓取动画
- [ ] 点「移除」→ inline 确认 → 博主消失
- [ ] 关弹窗后回到 Feed，**滚动位置保持不变**

### ✅ 阅读器 + AI 卡片

- [ ] 点某篇论文的「开始精读」按钮
- [ ] 顶部导航多出一个论文 tab（可关闭 / 悬停显示完整标题）
- [ ] 三栏布局：左章节导航 / 中论文正文 / 右 AI 面板
- [ ] 左栏章节点击能定位跳转
- [ ] 滚动中栏，左栏当前章节高亮同步
- [ ] 右栏 AI 卡片流式生成（Motivation / Method 逐字出现）
- [ ] 中栏 hover 段落 → 右下出现"问 AI"小按钮
- [ ] 点"问 AI"→ 自动切到 Chat tab 并预填引用
- [ ] 右栏切到「Chat 问答」→ 输入问题 → AI 流式回答
- [ ] 顶部状态下拉：切"精读完成"→ toast 提示
- [ ] 底部「标记精读完成 → 归档」→ 归档弹窗弹出

### ✅ 归档弹窗

- [ ] 弹窗左栏能看到目录树，可展开收起
- [ ] 目录旁有 ⭐ 标记（AI 推荐目录，与论文 tags 相关）
- [ ] hover ⭐ 显示推荐理由
- [ ] 点某个叶子目录 → 右下角总结区**自动流式生成 AI 初稿**
- [ ] 手动编辑总结后，AI 初稿不再覆盖你的编辑
- [ ] 点「新建目录」→ inline 表单展开
- [ ] 底部多目录复选框：勾选多个目录同时归档
- [ ] 点「确认归档」→ 弹窗关闭 + toast 成功

### ✅ 多 tab 阅读器

- [ ] 从 Feed 陆续开多篇论文 → 顶部 tab 逐个出现
- [ ] 超过 5 个时最早的自动关闭 + toast 提示
- [ ] tab 之间切换 → 各自的滚动位置保持
- [ ] 关闭当前 tab → 自动切到相邻 tab

### ✅ Inspire 主页

- [ ] 顶部导航点「归档·Inspire」进入
- [ ] 左栏能看到目录树，展开叶子目录能看到论文条目
- [ ] 勾选论文 → 右上「已选灵感来源 Chip」实时出现
- [ ] 切换目录，之前勾选的仍保留（跨目录累积）
- [ ] 点 Chip 上的 × 单个移除；点「清空」全清
- [ ] 填业务场景 + 关联代码 → 点「基于已选论文生成 Idea」
- [ ] Idea 卡片出现，5 字段完整（假设 / 改动 / 来源 / 可行性 / 风险）
- [ ] Chat 输入"延迟要 <50ms"→ 被识别为锚点，出现在锚点历史
- [ ] Chat 输入普通问题（无约束词）→ AI 回复但不生成锚点
- [ ] 点 Idea 卡片「确认待实验」→ 卡片状态变为"已标记待实验"

### ✅ 全流程闭环

一个完整的用户旅程：

- [ ] 登录 → Feed 刷新拉真论文 → 点开一篇论文
- [ ] 阅读器右栏 AI 卡片流式生成
- [ ] Chat 里问几个问题
- [ ] 标记精读完成 → 归档到某目录 + AI 初稿总结
- [ ] 切到 Inspire → 从目录勾选刚归档的论文
- [ ] 生成 Idea → 提约束 → 确认待实验

---

## 5. Demo 演示脚本

如果你要向别人演示这个产品，按这个顺序讲最清楚：

**① 用户价值一句话**：
> "从 arXiv 上的一堆论文，到你自己的可实验 Idea，一站式闭环工具。"

**② Feed 流** (30 秒)
- 展示 Feed 卡片
- 演示筛选（领域 / 来源）
- 点「刷新」抓最新 arXiv 论文

**③ 阅读器 + AI 助手** (2 分钟)
- 打开一篇论文
- 展示三栏
- 让 AI 卡片流式生成完（Motivation / Method 等）
- Chat 提一个具体问题
- hover 某段"问 AI"演示段落级问答

**④ 归档 · 知识组织** (1 分钟)
- 精读完成 → 归档弹窗
- 展示目录树 + ⭐ AI 推荐目录
- 让 AI 自动生成归档总结
- 多目录同时归档

**⑤ Inspire · 生成 Idea** (2 分钟)
- 到 Inspire 页
- 从不同目录跨领域勾选 3-5 篇论文
- 填个业务场景（"精排冷启动样本量少"）
- 生成 Idea
- 提约束（"延迟要 <50ms"）看锚点被记录
- 强调"从论文到实验"的闭环

**⑥ 收尾**：
> "所有 AI 内容目前是 Mock，替换成真实 LLM 只需要改一个文件（`apps/api/src/lib/llm.ts`）。"

---

## 6. 常见问题排查

### 装依赖阶段

**Q: `EUNSUPPORTEDPROTOCOL Unsupported URL Type "workspace:"`**
- 你用的是 pnpm/yarn 特有的语法。这个仓库已经修成 `"*"`，重新 `git pull` 或检查 `apps/api/package.json`。

**Q: `argon2` 编译失败（Mac ARM 常见）**
- 报错关键词：`node-gyp`、`prebuild-install`
- 通常 npm 会自动下载 pre-built binary，如果没有：`npm rebuild argon2`
- 实在不行告诉维护者换 `bcryptjs`

### 数据库阶段

**Q: `Can't reach database server`**
- Supabase 项目还在启动（等 1-2 分钟）
- 或连接串里的密码有特殊字符没 encode
- 或密码错了

**Q: `prepared statement already exists`**
- DATABASE_URL 里缺 `?pgbouncer=true` 参数

**Q: `npm run db:migrate` 一直卡住**
- 检查 DIRECT_URL 是不是也配了（migration 用直连端口 5432）

### 前后端联调阶段

**Q: 登录后 Feed 空白，什么都不显示**
- 打开 DevTools Console，看有没有 `[API Schema Mismatch]` 错误
- 或 Network 面板看 `/api/papers` 请求 status 和 response
- 或 Console 看是不是有 CORS / 401 错误

**Q: 登录时 404**
- 前端 `.env.local` 里 `VITE_API_BASE_URL` 没配或配错
- 应该是 `http://localhost:4000/api`

**Q: 登录后立刻退出**
- Cookie 没写入（跨端口问题）
- 检查后端 CORS 配置和 cookie 的 sameSite

**Q: AI 卡片显示"暂无内容"**
- 后端 `reply.raw` SSE 响应可能没带 CORS 头
- 后端日志看是否收到请求
- Network 面板看 `.../ai-cards/motivation/stream` 状态码

**Q: 刷新论文报 "Body cannot be empty"**
- 前端 client 在没 body 时不该发 Content-Type 头
- 已在最新版修复

---

## 7. 项目结构快速导航

```
inspire_ideas_v0/
├── src/                      # 前端应用
│   ├── pages/                # 页面（Feed / Reader / Inspire / Login）
│   ├── components/
│   │   ├── ui/               # 基础组件
│   │   ├── common/           # 业务通用（PaperCard 等）
│   │   ├── feed/             # Feed 相关
│   │   ├── reader/           # 阅读器（三栏 + AI 卡片）
│   │   ├── inspire/          # Inspire 工作台
│   │   ├── modals/           # 弹窗
│   │   └── layout/           # TopNav
│   ├── api/                  # API 客户端 + endpoints
│   ├── hooks/                # React Query hooks
│   ├── stores/               # Zustand（多 tab / 选中 / 弹窗）
│   ├── mocks/                # MSW handlers + Mock 数据
│   └── lib/                  # 工具函数
├── apps/api/                 # 后端 Fastify 服务
│   ├── src/
│   │   ├── index.ts          # 入口
│   │   ├── routes/           # REST endpoints
│   │   ├── lib/
│   │   │   ├── arxiv.ts      # arXiv API 抓取
│   │   │   ├── llm.ts        # LLM 抽象层（当前 Mock）
│   │   │   └── sse.ts        # SSE 流式响应
│   │   └── middleware/       # 认证等
│   ├── prisma/
│   │   ├── schema.prisma     # 数据模型
│   │   └── seed.ts           # 种子数据
│   └── .env                  # 后端环境变量
└── packages/shared/          # 前后端共享类型 + Zod schema
```

**修 UI**：`src/components/`
**加新页面**：`src/pages/` + `src/App.tsx` 路由
**改 API 逻辑**：`apps/api/src/routes/`
**改数据模型**：`apps/api/prisma/schema.prisma` + `npm run db:migrate`
**接真 LLM**：只改 `apps/api/src/lib/llm.ts`
**共享类型**：`packages/shared/src/schemas/`

---

## 8. 联系与反馈

跑不通了？在 [常见问题排查](#6-常见问题排查) 里找不到答案？

- 记下**具体报错**、**卡在哪一步**、**跑了什么命令**
- 提供**浏览器 Console 截图** + **后端终端日志**
- 找项目维护者

祝上手顺利！
