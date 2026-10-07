# @inspire/api

Fastify + TypeScript + Prisma 后端服务。

## 快速开始

```bash
# 1) 起 Postgres
docker compose up -d

# 2) 配置环境变量
cp .env.example .env

# 3) 生成 Prisma Client 并建库
npm install
npm run prisma:migrate

# 4) 塞入 demo 数据（可选）
npm run db:seed

# 5) 启动
npm run dev
```

服务默认监听 `http://localhost:4000`。

## API 概览

所有 API 前缀 `/api`。

### 认证

- `POST /auth/register` — 注册
- `POST /auth/login` — 登录（返回 httpOnly cookie `inspire_auth`）
- `POST /auth/logout` — 登出
- `GET /auth/me` — 获取当前用户

### 论文

- `GET /papers` — Feed 流（分页 + 筛选）
- `GET /papers/:id` — 详情
- `PATCH /papers/:id` — 更新状态

### 博主

- `GET /bloggers` — 已关注列表
- `POST /bloggers` — 添加（异步启动抓取）
- `DELETE /bloggers/:id` — 移除
- `GET /bloggers/:id/crawl-progress` — 抓取进度轮询

### 归档

- `GET /topics` — 目录树
- `POST /topics` — 新建目录
- `POST /archive` — 归档
- `GET /topics/:id/papers` — 目录下的论文
- `GET /papers/:id/archive-recommendations` — AI 推荐目录
- `POST /archive/summary/stream` — AI 归档总结 (SSE)

### Idea

- `POST /ideas/generate` — 生成 Idea
- `PATCH /ideas/:id` — 更新状态
- `POST /ideas/:id/messages` — 发消息（含锚点检测）
- `GET /ideas/:id/messages` — 消息列表
- `DELETE /anchors/:id` — 删除锚点

### AI 卡片

- `GET /papers/:id/ai-cards` — 卡片列表
- `POST /papers/:id/ai-cards/:type/stream` — 生成/重新生成 (SSE)
- `PATCH /papers/:id/ai-cards/order` — 更新排序
- `GET /papers/:id/chat` — 阅读器 chat 记录
- `POST /papers/:id/chat/stream` — 发消息 (SSE)

## 认证机制

- 登录成功后设置 `inspire_auth` httpOnly cookie，前端 fetch 使用 `credentials: 'include'` 自动带上
- 所有业务路由通过 `requireAuth` 中间件解析 JWT，从 `request.userId` 获取用户
- Cookie 属性：httpOnly、secure (生产)、sameSite=lax (开发) / none (生产)
- 生命周期 30 天

## 数据隔离

所有实体表都带 `userId` 字段，所有查询都强制加 `where: { userId: request.userId }`。

## 目录结构

```
src/
├── index.ts            # 入口
├── prisma.ts           # Prisma 单例
├── middleware/
│   └── auth.ts         # JWT + requireAuth 中间件
├── routes/
│   ├── auth.ts         # 注册/登录/登出
│   ├── papers.ts       # 论文 CRUD
│   ├── bloggers.ts     # 博主 CRUD
│   ├── topics.ts       # 归档目录 + 归档
│   ├── ideas.ts        # Idea 生成 + Chat
│   └── ai.ts           # AI 卡片 + 归档总结
├── lib/
│   ├── sse.ts          # SSE 流式响应工具
│   └── llm.ts          # LLM 抽象层（本期 Mock）
prisma/
├── schema.prisma       # 数据模型
└── seed.ts             # 种子数据
```
