# 贡献指南

欢迎参与 Inspire Ideas 项目。这份文档说明代码规范、工作流程、以及如何加入新功能。

## 目录

1. [初次上手](#1-初次上手)
2. [项目结构与分工](#2-项目结构与分工)
3. [开发工作流](#3-开发工作流)
4. [代码规范](#4-代码规范)
5. [如何加新功能](#5-如何加新功能)
6. [Git 提交规范](#6-git-提交规范)
7. [Debug 常见套路](#7-debug-常见套路)

---

## 1. 初次上手

跟着 [`DEMO.md`](./DEMO.md) 走一遍完整启动流程。**必须先能本地跑通再动代码**，否则改完不知道对不对。

对于 LLM 相关工作，还需要看 [`LLM_INTEGRATION.md`](./LLM_INTEGRATION.md)。

---

## 2. 项目结构与分工

```
inspire_ideas_v0/               # Monorepo 根目录
├── src/                        # 【前端】React 应用
├── apps/api/                   # 【后端】Fastify 服务
├── packages/shared/            # 【共享】TS 类型 + Zod schema
├── DEMO.md                     # 上手指南
├── LLM_INTEGRATION.md          # LLM 集成指南
├── CONTRIBUTING.md             # 本文件
└── README.md                   # 项目总览
```

### 按角色划分建议

| 角色 | 主要工作目录 |
|---|---|
| 前端开发 | `src/`（页面 / 组件 / hooks / stores） |
| 后端开发 | `apps/api/src/`（routes / lib / middleware） |
| LLM 开发 | `apps/api/src/lib/llm.ts` + `arxiv.ts` |
| 数据建模 | `apps/api/prisma/schema.prisma` + `packages/shared/src/schemas/` |
| 全栈 | 三个都要看 |

---

## 3. 开发工作流

### 日常开发（本地）

一次开三个终端：

```bash
# 终端 1：前端
npm run dev

# 终端 2：后端
npm run api:dev

# 终端 3：命令行操作（migrate/seed/查库）
# 保留备用
```

### 前后端交互的原则

1. **共享类型走 `packages/shared/`**
   - 定义一个新实体？先在 `packages/shared/src/schemas/xxx.ts` 加 Zod schema
   - 前后端都从这个包 import，保证类型一致

2. **前端不直接操作数据库**
   - 前端只能通过 HTTP 调后端 API
   - Prisma 只在后端用

3. **前端可以先用 MSW Mock 独立开发**
   - 加新接口时可以先在 `src/mocks/handlers.ts` mock 一份
   - 后端 API 实现完再切真实（把 MSW handler 删掉或走 `VITE_USE_MOCK=false`）

4. **数据变更走 Prisma migration**
   - 改了 `schema.prisma` 必须运行 `npm run db:migrate`
   - 不要手动去 SQL 编辑器改表结构

---

## 4. 代码规范

### TypeScript

- **严格模式**已开启，所有代码必须过 `tsc`
- **不用 `any`**，实在需要用 `unknown` 加类型收窄
- **优先用 `interface`** 定义对象类型，`type` 用于联合/工具类型
- 组件 props 都要显式定义 interface

### React

- 一律用**函数组件 + hooks**
- **不要用默认导出**（除了 `pages/`），命名导出更利于 refactor
- Props 命名：动作是 `on*`（`onSubmit`、`onClick`），布尔量是 `is*`/`has*`/`can*`
- 长列表用 `react-virtuoso`（Feed 已经用了），不要暴力 `map`

### 样式

- **一律用 Tailwind CSS class**
- 复用 class 组合用 `cn()` 工具函数（`src/lib/cn.ts`）
- **禁止行内 `style`** 除非动态计算的样式（如 `style={{ paddingLeft: depth * 16 }}`）
- 颜色只用 `tailwind.config.ts` 里的 token（`text-primary`、`bg-ai-bg` 等），**不要用 `#4F46E5` 之类的硬编码**

### 状态管理

按性质分层：

| 状态类型 | 位置 |
|---|---|
| 服务端数据（API 拉的） | **React Query** (`src/hooks/*`) |
| 跨页 UI 状态（多 tab、选中、弹窗） | **Zustand store** (`src/stores/*`) |
| 单组件局部状态 | **`useState`** |
| URL 状态（筛选、tab） | **URL query 参数** |

**别把服务端数据放进 Zustand**，会导致缓存不一致。

### 后端（Fastify）

- **所有路由必须走 `preHandler: app.requireAuth`**（登录路由除外）
- **所有查询必须加 `userId` 过滤**，防止跨用户数据泄漏
- **请求体校验用 Zod**，`schema.parse(request.body)` 一行搞定
- **响应尽量返回明确类型**，避免直接把 Prisma 返回值 spread（可能带敏感字段）

---

## 5. 如何加新功能

### 示例：加一个"论文收藏"功能

假设你要新增一个"收藏"能力（用户可以标记论文为收藏，在个人页看收藏列表）。

**Step 1 · 数据模型（`apps/api/prisma/schema.prisma`）**

```prisma
model Paper {
  // 已有字段...
  isFavorite Boolean @default(false)
}
```

跑 migrate：

```bash
npm run db:migrate
# 输入 add-favorite 作为 migration 名字
```

**Step 2 · 共享类型（`packages/shared/src/schemas/paper.ts`）**

给 `PaperSchema` 加字段：

```typescript
export const PaperSchema = z.object({
  // ...
  isFavorite: z.boolean(),
});
```

**Step 3 · 后端 API（`apps/api/src/routes/papers.ts`）**

加个 endpoint：

```typescript
app.patch<{ Params: { id: string } }>('/papers/:id/favorite',
  async (request) => {
    const paper = await prisma.paper.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!paper) throw new Error('Not found');
    return prisma.paper.update({
      where: { id: paper.id },
      data: { isFavorite: !paper.isFavorite },
    });
  }
);
```

**Step 4 · 前端 API 封装（`src/api/endpoints/papers.ts`）**

```typescript
export function toggleFavorite(id: string) {
  return api.patch<Paper>(`/papers/${id}/favorite`);
}
```

**Step 5 · React Query hook（`src/hooks/usePapers.ts`）**

```typescript
export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleFavorite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed'] }),
  });
}
```

**Step 6 · UI（在 `PaperCard.tsx` 加个按钮）**

```typescript
const toggle = useToggleFavorite();
// ...
<button onClick={() => toggle.mutate(paper.id)}>
  {paper.isFavorite ? '⭐' : '☆'}
</button>
```

**Step 7 · MSW mock 同步（`src/mocks/handlers.ts`）**

如果前端要在 Mock 模式下也能测：

```typescript
http.patch('/api/papers/:id/favorite', async ({ params }) => {
  const p = db.papers.find((x) => x.id === params.id);
  if (p) p.isFavorite = !p.isFavorite;
  return HttpResponse.json(p);
}),
```

**Step 8 · 测试**

跑一遍：
- 后端：`curl` 调新 endpoint
- 前端：点收藏按钮看图标变化

新加的功能应尽量遵循这 8 步。

---

## 6. Git 提交规范

（如果你在用 git 管理）

### Commit Message 格式

推荐用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**type 常用**：
- `feat`: 新功能
- `fix`: 修 bug
- `refactor`: 重构（不改功能）
- `docs`: 只改文档
- `chore`: 依赖、配置、构建工具
- `style`: 格式化（不改代码逻辑）
- `test`: 测试相关
- `perf`: 性能优化

**scope 常用**：
- `feed` / `reader` / `inspire` / `archive` / `auth`
- `api` / `db` / `llm` / `arxiv`
- `shared` / `ui`

**例子**：

```
feat(feed): add refresh button to fetch new papers from arXiv

- Add POST /api/papers/refresh endpoint
- Frontend calls it from FilterBar refresh button
- Deduplicate by arxivId

Closes #42
```

```
fix(auth): cookie not persisting on cross-port requests

sameSite was 'lax' which Chrome rejects for POST from :5173 to :4000.
Changed to 'none' + secure in production, 'lax' in dev is fine.
```

### 分支策略

小项目建议：

- `main`：可发布分支
- `dev`：日常开发主线
- `feat/xxx`：功能分支，做完 merge 到 dev
- `fix/xxx`：紧急修复

大项目再考虑 gitflow。

---

## 7. Debug 常见套路

（`DEMO.md` 里也有一些常见问题，这里补充调试的一般套路）

### 前端问题

1. **打开 DevTools** (Cmd+Opt+I) 是第一步
2. **Console**：看红色错误 + 我加的 `[API Schema Mismatch]` 诊断日志
3. **Network**：看请求 status、response body、cookie 是否带上
4. **React DevTools**：看组件树、props、state
5. **Zustand DevTools**：如果配了，能看 store 变化

### 后端问题

1. **后端终端日志**（pino 会打印每个请求 + Prisma 查询）
2. **改临时日志**：加 `console.log` 就行，`tsx watch` 会自动 reload
3. **直连 curl 测**：绕过前端排除前端问题
4. **Prisma Studio**：`npx prisma studio` 打开图形化数据库浏览器
5. **Supabase SQL Editor**：直接跑 SQL 查数据

### 网络问题

1. **前后端端口**：前端 5173，后端 4000
2. **CORS**：`Access-Control-Allow-Origin` 缺失 → 后端 CORS 配置
3. **Cookie**：跨端口 = 跨站，`sameSite` 要注意
4. **代理**：如果你在国内，某些外网 API（arxiv、openai）可能被墙

### 数据库问题

1. **连接失败**：连接串错、密码错、Supabase 项目还在启动
2. **Schema 不匹配**：改了 `schema.prisma` 忘了 `db:migrate`
3. **数据消失**：seed 脚本会先删该用户数据，别在生产环境跑

---

## 8. 有问题找谁

- **DEMO/环境相关**：`DEMO.md` → 项目维护者
- **LLM 相关**：`LLM_INTEGRATION.md`
- **架构/技术选型**：`README.md` 顶部有技术栈说明
- **代码风格**：本文件

祝写码顺利！
