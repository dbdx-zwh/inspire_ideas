# Inspire Ideas · 论文精读与灵感生成

面向研究者/工程师的 AI 论文阅读与灵感生成工具。产品闭环：

```
发现好论文 → 精读理解 → 归档到知识体系 → 组合出可实验的 Idea
   Feed        Reader        Archive              Inspire
```

## 📚 面向不同角色的文档

- **首次上手** → 从 [`DEMO.md`](./DEMO.md) 开始（30 分钟内跑起来 + 功能测试清单）
- **负责 LLM 接入** → [`LLM_INTEGRATION.md`](./LLM_INTEGRATION.md)（8 项待接入功能 + 详细规格）
- **常规开发/代码贡献** → [`CONTRIBUTING.md`](./CONTRIBUTING.md)（代码规范 + 加新功能的流程）
- **后端接口详情** → [`apps/api/README.md`](./apps/api/README.md)

## 目录结构（Monorepo）

```
inspire_ideas_v0/
├── src/                    # 前端应用（Vite + React + TS）
├── apps/
│   └── api/                # 后端服务（Fastify + TS + Prisma）
├── packages/
│   └── shared/             # 前后端共享的类型 + Zod schema
├── public/
├── package.json            # 前端 + workspaces
└── ...
```

## 快速开始

### 方式 1 · 纯前端 Mock（最快）

```bash
npm install
npx msw init public/ --save   # 首次
npm run dev                    # http://localhost:5173
```

`.env.local` 里 `VITE_USE_MOCK=true`（默认），全部数据由 MSW Service Worker 拦截返回，无需后端。

### 方式 2 · 前后端联调

```bash
# 1) 启动 Postgres
npm run db:up

# 2) 生成 Prisma Client + 建库
npm install
cp apps/api/.env.example apps/api/.env
npm run db:migrate

# 3) 塞入 demo 数据
npm run db:seed
# 生成 demo 用户: demo@inspire.local / demo1234

# 4) 启动后端（新终端）
npm run api:dev
# → http://localhost:4000

# 5) 前端切换到真实后端模式
cp .env.example .env.local
# 修改 .env.local:
#   VITE_USE_MOCK=false
#   VITE_API_BASE_URL=http://localhost:4000/api
npm run dev
```

## 功能范围

### v0.1（已完成）

- **Feed 流**：领域/时间/来源筛选、无限滚动、卡片操作、管理博主入口
- **博主管理弹窗**：搜索添加、异步抓取进度、精读比例、样本不足提示
- **顶部导航**：固定入口 + 动态阅读器 tab（LRU、sessionStorage 持久化、溢出下拉）
- **阅读器**：章节导航滚动同步、Markdown + KaTeX 公式渲染、状态切换、精读完成 → 归档
- **归档弹窗**：目录树 + 搜索、拖拽归档、新建目录、多目录同时归入、手动归档总结
- **Inspire 主页**：跨目录累积勾选、灵感来源 Chip、业务场景 + 关联代码、Idea 五字段卡片、对话式锚点迭代

### v0.2（本次新增）

**前端 (Phase 1)**
- 阅读器右栏 · AI 结构化卡片：Motivation / Method / Experiments / Limitations / 可迁移点，流式生成，可折叠、可重新生成
- 阅读器右栏 · Chat 问答面板：流式回复、"就这段问 AI"从中栏段落触发
- 引用论文关联：正文中 arXiv URL 自动识别为可点击链接，hover 显示论文元信息，命中库内可直接打开新 tab
- 归档 AI 推荐：⭐ 标记 top 3 相关目录 + hover 显示推荐理由
- 归档 AI 总结初稿：选定目录后流式生成，用户可编辑
- Zod 契约层：所有 API 响应可选运行时校验，防止后端字段漂移
- SSE 流式基础设施：`useStreamingResource` hook，支持文本 + 结构化 JSON 两种模式，MSW 也用真正的 ReadableStream 语义

**后端 (Phase 3)**
- Fastify + TS + Prisma + Postgres
- JWT httpOnly Cookie 认证：注册/登录/登出/会话
- 全套 API：papers / bloggers / topics / archive / ideas / anchors / chat
- SSE 流式接口：AI 卡片生成、Chat 回复、归档总结
- 用户级数据隔离
- Docker Compose 一键起 Postgres
- Prisma seed 脚本：一键塞入 demo 数据

## 技术栈

**前端**
- Vite + React 18 + TypeScript
- Tailwind CSS + Radix UI（shadcn 风格自定义组件）
- React Router v6
- Zustand（多 tab / 选中 / 弹窗）
- TanStack Query（服务端状态）
- MSW（Mock Service Worker）
- Zod（运行时校验）

**后端**
- Fastify（HTTP + SSE）
- Prisma（Postgres ORM）
- argon2（密码哈希）
- @fastify/jwt + cookie（认证）

**共享**
- `@inspire/shared`：TS 类型 + Zod schema，前后端共用

## 开发脚本

```bash
# 前端
npm run dev              # 启动前端 dev server
npm run build            # 前端构建

# 后端
npm run api:dev          # 启动后端 dev server（tsx watch）
npm run api:build        # 构建后端

# 数据库
npm run db:up            # 启动 Postgres 容器
npm run db:down          # 停止 Postgres 容器
npm run db:migrate       # Prisma migrate
npm run db:seed          # 塞入 demo 数据
```

## 环境变量

前端 `.env.local`：

```bash
VITE_USE_MOCK=true                    # true=用 MSW Mock; false=走真实后端
VITE_API_BASE_URL=http://localhost:4000/api
```

后端 `apps/api/.env`：

```bash
DATABASE_URL=postgresql://inspire:inspire@localhost:5432/inspire?schema=public
JWT_SECRET=<64-char-random-string>
PORT=4000
FRONTEND_ORIGIN=http://localhost:5173
NODE_ENV=development
```

## 生产部署

**数据库**：推荐 Supabase 或 Neon（免费额度足够 MVP）

- 建 Postgres 数据库，拿到连接串
- 修改 `apps/api/.env.production` 里的 `DATABASE_URL`
- 运行 `npm run db:migrate` 迁移生产库

**后端**：任何 Node 主机（Railway、Fly.io、AWS ECS 等）

**前端**：静态托管（Vercel、Netlify、Cloudflare Pages）
- `VITE_USE_MOCK=false`
- `VITE_API_BASE_URL=https://api.your-domain.com/api`

## LLM 接入

本期后端 LLM 全部为 Mock 实现，位于 `apps/api/src/lib/llm.ts`。切换到真实 LLM：

- 替换 `generateIdeaViaLLM` / `generateChatReplyViaLLM` / `generateAICardContent` / `generateArchiveSummary` 四个函数
- 保持函数签名，其他代码不用改
- SSE 部分只需把 `streamTextResponse` 中的 setTimeout 分块改成消费 LLM 的流式响应

## 论文状态机

贯穿 Feed / 阅读器 / 归档 / Inspire 各页面的一致状态：

```
未读 → 阅读中 → 精读完成 → 已归档 → 已作为灵感来源 → 已生成 Idea
```

在卡片、目录条目、tab 上视觉一致（StatusDot 组件）。

## 下一步（未来迭代）

- Inspire 图谱视图 / 时间线视图
- 实验中心
- 划词高亮 + 我的高亮列表
- 中英对照
- 团队协作（Topic 分享 / 评论 / 权限）
- Idea 导出为实验设计文档
