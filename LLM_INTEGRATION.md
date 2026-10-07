# LLM 集成指南

面向负责接入真实 LLM 的开发者。阅读器的「AI 结构化」和「Chat 问答」已经接入真实大模型；Idea 生成、归档总结等其余能力仍保留模板实现。

> 当前实现不依赖特定 SDK，统一通过 OpenAI-compatible Chat Completions 接口调用 Gemini、OpenAI、DeepSeek、Ollama 或其他兼容服务。具体配置以 `apps/api/.env.example` 为准。本文后半部分的旧 Mock 改造说明仅作架构参考。

### 当前推荐：Gemini 免费层

```env
LLM_PROVIDER="gemini"
GEMINI_API_KEY="从 Google AI Studio 获取的 Key"
GEMINI_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai"
GEMINI_MODEL_MAIN="gemini-3.5-flash-lite"
GEMINI_MODEL_FAST="gemini-3.5-flash-lite"
LLM_TIMEOUT_MS=120000
LLM_BATCH_TIMEOUT_MS=240000
LLM_IDEA_TIMEOUT_MS=240000
LLM_IDEA_CONTEXT_MAX_CHARS=75000
```

`LLM_TIMEOUT_MS` 用于普通问答；`LLM_BATCH_TIMEOUT_MS` 只用于一次性生成五张
AI 结构化卡片。批量生成前会自动移除参考文献、图片链接等无关长文本，降低超时概率。
`LLM_IDEA_TIMEOUT_MS` 和 `LLM_IDEA_CONTEXT_MAX_CHARS` 分别控制多论文 Idea
生成的超时与总上下文大小。

Key 只放在 `apps/api/.env`，不要写进前端的 `VITE_*` 变量或提交到 Git。

## 快速导航

- [🚀 快速上手（无需数据库）](#🚀-快速上手无需数据库)
- [🎯 你的工作范围](#🎯-你的工作范围)
- [📁 只需要改这一个文件](#📁-只需要改这一个文件apps-api-src-lib-llmts)
- [📋 待接入功能清单（8 项）](#📋-待接入功能清单8-项)
- [🔧 每个函数的签名与要求](#🔧-每个函数的签名与要求)
- [🌊 流式响应约定（SSE）](#🌊-流式响应约定sse)
- [🧪 如何本地测试](#🧪-如何本地测试你的实现)
- [💰 成本与性能考虑](#💰-成本与性能考虑)
- [🤔 常见问题](#🤔-常见问题)

---

## 🚀 快速上手（无需数据库）

**好消息**：你的核心工作是替换 `apps/api/src/lib/llm.ts` 里的 4 个函数——它们纯粹是「输入 → LLM API → 输出」，**不涉及数据库、不涉及 HTTP 层、不涉及认证**。

也就是说，你**不需要**：
- ❌ 注册 Supabase / 装 Docker / 装本地 Postgres
- ❌ 让维护者传数据库密钥给你
- ❌ 跑 `npm run db:migrate` / `npm run db:seed`
- ❌ 起前端服务

你**只需要**：
- ✅ 装 Node.js ≥ 18
- ✅ 装依赖：`npm install`
- ✅ 一个 LLM API Key（OpenAI / Anthropic / DeepSeek / 通义千问 / 本地 Ollama 均可）

### Step 1 · 装依赖

```bash
git clone <repo>
cd inspire_ideas_v0
npm install
```

### Step 2 · 拿 LLM API Key

选一家 provider 注册并获取 API Key。推荐：

- **国内友好**：DeepSeek（https://platform.deepseek.com/），可以支付宝付款，价格极低
- **海外任意**：OpenAI（`gpt-4o-mini`）或 Anthropic（`claude-3-5-haiku`）

### Step 3 · 配 API Key

```bash
cp apps/api/.env.example apps/api/.env
```

编辑 `apps/api/.env`，只填 LLM 相关的一两行（其他都不用填），例如：

```bash
# 数据库连接可以随便留（你不会用到）
DATABASE_URL="postgresql://placeholder"
DIRECT_URL="postgresql://placeholder"

# 你实际用的 LLM Provider
DEEPSEEK_API_KEY="sk-xxx"
# 或
OPENAI_API_KEY="sk-xxx"
```

### Step 4 · 写单元测试直接调 LLM 函数

项目里有一个示例测试文件 [`apps/api/src/lib/llm.test.ts`](./apps/api/src/lib/llm.test.ts)。你在自己电脑上跑：

```bash
cd apps/api
npx tsx src/lib/llm.test.ts
```

看它是怎么调用四个函数、怎么打印结果的。**这就是你开发时的主要循环**：

1. 改 `llm.ts` 里的某个函数（接入真实 LLM）
2. 跑 `llm.test.ts` 看输出
3. 满意就下一个函数，不满意就调 prompt

**整个开发过程都不需要数据库、不需要前端、不需要登录**。等你把 4 个函数都替换完，再考虑做端到端联调（那时才需要 DB，见下方"端到端联调"章节）。

### Step 5 · 端到端联调（可选，做完 LLM 替换后再进行）

当你想在真实产品界面上看 AI 效果时（阅读器右栏 AI 卡片、Chat 回复、归档总结等），才需要完整环境。

这时候找项目维护者：
- 要一份共享的 Supabase 数据库连接串（他会安全地传给你）
- 或者按 [`DEMO.md`](./DEMO.md) 自建一个 Supabase 项目

然后就可以：
- 起后端：`npm run api:dev`
- 起前端：`npm run dev`
- 浏览器打开 http://localhost:5173，用 demo 账号登录，走完整流程

---

## 🎯 你的工作范围

前端和后端所有的 AI 交互流程都已经跑通，你**不需要**改 UI、路由、数据模型、认证任何东西。你只需要：

1. **替换 Mock 实现**：把 `apps/api/src/lib/llm.ts` 里的 4 个函数改成真实 LLM 调用
2. **保持函数签名不变**：其他代码依赖这些签名，改签名会引起连锁修改
3. **保留 SSE 流式约定**：前端已经支持流式渲染，你的 LLM 调用最好也用流式

这样做的好处：前端和后端逻辑都不用碰，改完后所有页面上的 AI 内容自动升级。

## 📁 只需要改这一个文件：`apps/api/src/lib/llm.ts`

这是 LLM 抽象层。里面有 4 个函数：

```typescript
export async function generateIdeaViaLLM(...)          // Idea 生成
export async function generateChatReplyViaLLM(...)     // 阅读器 Chat 回复
export async function generateAICardContent(...)       // AI 结构化卡片（5 种）
export async function generateArchiveSummary(...)      // 归档总结初稿
```

以及一份类型定义 `GeneratedIdea`。所有调用它们的地方都通过这几个签名进出，不需要你去改。

---

## 📋 待接入功能清单（8 项）

按优先级 + 复杂度排序，建议从上往下做：

### 🟢 简单：单字段文本流式生成（4 项）

这四个都是"输入结构化数据 → 输出一段文本"的模式，接入相对简单：

| # | 功能 | 触发时机 | 输入 | 输出 | 前端展示 |
|---|---|---|---|---|---|
| 1 | **AI 结构化卡片** | 用户打开阅读器 | 论文标题 + 卡片类型 | 一段解释性文字 | 右栏 5 张卡片，流式生成 |
| 2 | **归档总结初稿** | 用户在归档弹窗选定目录 | 论文标题 + 目录名 | 归档笔记建议 | 弹窗底部 textarea 流式填充 |
| 3 | **阅读器 Chat 回复** | 用户在阅读器 Chat 提问 | 论文标题 + 问题 + 可选段落引用 | 回答 | 右栏 Chat 面板，流式回复 |
| 4 | **Feed 卡片一句话摘要** ⚠️ | 论文入库时（arXiv 抓取） | 论文 abstract | 中文一句话概述 | Feed 卡片摘要区 |

⚠️ **第 4 项目前不在 `llm.ts` 里**，而是在 `apps/api/src/lib/arxiv.ts` 的 `buildPaperFallback` 里通过截断 abstract 生成。建议改成调 LLM 生成中文摘要。

### 🟡 中等：结构化输出（1 项）

| # | 功能 | 复杂度 |
|---|---|---|
| 5 | **Idea 生成** | 需要 LLM 输出 5 个固定字段 JSON |

这个需要用 LLM 的 **JSON mode**（OpenAI）或**结构化输出**（Claude tool_use）保证解析稳定。

### 🟠 复杂：需要额外基础设施（3 项）

| # | 功能 | 依赖 |
|---|---|---|
| 6 | **归档目录推荐（AI 版）** | 需要 embedding 模型 + 向量相似度 |
| 7 | **锚点识别（AI 版）** | 当前用正则识别约束句，可换成 LLM 分类 |
| 8 | **论文正文抓取 + tag 抽取** | 需要 PDF 解析 + LLM 抽取关键概念 |

前面 1-5 全部做完之后再考虑这三个。

### 🔴 已经实现但可优化（2 项，不紧急）

| # | 当前实现 | 可优化方向 |
|---|---|---|
| 9 | **难度评估** = 固定 `medium` | 根据 abstract 复杂度让 LLM 打分 |
| 10 | **阅读时长估算** = 简单字数除法 | 让 LLM 根据论文长度 + 难度综合评估 |

---

## 🔧 每个函数的签名与要求

以下是每个 Mock 函数的详细规格。**保持签名不变**，只替换函数体。

### 1️⃣ `generateAICardContent`

```typescript
export async function generateAICardContent(
  paperTitle: string,
  type: 'motivation' | 'method' | 'experiments' | 'limitations' | 'transferable'
): Promise<{ title: string; content: string }>
```

**语义**：为一篇论文生成某种类型的结构化卡片。

**5 种类型对应的 prompt 建议**：

| type | 建议 System Prompt |
|---|---|
| `motivation` | "你是学术论文分析助手。请用 2-3 句中文说明这篇论文要解决什么核心矛盾或痛点。开头带 '🎯 Motivation'。" |
| `method` | "简明描述这篇论文的核心方法，包括关键组件、数学表达（如有）、训练策略。3-5 句中文。开头 '🛠 Method'。" |
| `experiments` | "总结实验数据集、评估指标、关键结果（相比 baseline 提升多少）。3-4 句。开头 '🧪 Experiments'。" |
| `limitations` | "指出论文的局限性和不适用场景。3 句以内。开头 '⚠️ Limitations'。" |
| `transferable` | "从工程实践角度看，这篇论文的思路可以迁移到哪些相关场景？给出 2-3 个具体方向。开头 '💡 可迁移点'。" |

**返回格式**：
- `title`: 卡片顶部显示的标题，包含 emoji
- `content`: 正文

**流式**：由 `apps/api/src/routes/ai.ts` 的 SSE 端点处理。你在 `generateAICardContent` 里返回完整结果即可，或者返回一个异步迭代器（见下方"SSE 约定"）。

### 2️⃣ `generateArchiveSummary`

```typescript
export async function generateArchiveSummary(
  paperTitle: string,
  topicName: string
): Promise<string>
```

**语义**：用户把论文归档到某个 Topic 时，生成一段"这篇论文在这个目录下有什么价值"的笔记初稿。

**Prompt 建议**：
> "用户正在把《{paperTitle}》归档到「{topicName}」目录。请用 2-3 句中文说明：这篇论文与该目录主题的关联、它的关键贡献、值得日后回顾的可迁移点。语气要中性、专业。"

### 3️⃣ `generateChatReplyViaLLM`

```typescript
export async function generateChatReplyViaLLM(
  paperTitle: string,
  question: string,
  citedAnchor?: string
): Promise<string>
```

**语义**：阅读器 Chat 面板收到用户问题，返回 AI 回答。

**Prompt 建议**：
> "你是这篇论文《{paperTitle}》的阅读助手。严格基于论文内容回答用户问题，不要编造。如果论文没提到，明确说'论文中没有讨论这一点'。"

**`citedAnchor` 参数**：如果用户是"就这段问 AI"，会传入段落 anchor（如 `p3`）。理想情况下应该：
1. 从数据库找到该段落文本
2. 把段落塞进 prompt 作为 context

当前 mock 实现忽略了这个参数，你接入时可以增强。

### 4️⃣ `generateIdeaViaLLM`

```typescript
export interface GeneratedIdea {
  hypothesis: string;      // 核心假设
  changes: string;         // 具体改动建议
  sourceCitation: string;  // 灵感来源引用（"XX 论文 §3.1"）
  feasibility: number;     // 可行性 0-5 五点评级
  risk: string;            // AI 自我审视的风险点
}

export async function generateIdeaViaLLM(input: {
  papers: { title: string }[];
  scenario: string;
  codeRef?: string;
  anchorContents?: string[];
}): Promise<GeneratedIdea>
```

**语义**：核心的 Idea 生成能力。用户勾选了若干论文 + 描述业务场景（+ 可选关联代码）+ 携带若干约束锚点，你要生成一个可实验的 Idea。

**关键要求**：
- 返回**严格结构化 JSON**，5 个字段必须都有值
- `feasibility` 是 0-5 整数
- `hypothesis` / `changes` / `risk` 是短段落（30-100 字）
- `sourceCitation` 要引用具体论文 + 章节位置（尽量精确）
- **必须遵守 `anchorContents`**（用户已经明示的约束，如"延迟<50ms"）

**推荐用 LLM 的结构化输出模式**：
- OpenAI：`response_format: { type: 'json_object' }` 或 `tools` + `tool_choice`
- Anthropic：`tools` 定义 + `tool_choice`
- 本地模型：加 JSON schema 到 prompt 里 + 后端用 Zod 校验

**Prompt 骨架**：
```
你是研究员的 Idea 生成助手。基于以下信息，生成一个可实验的 Idea：

论文列表（灵感来源）：
{papers.map(p => `- ${p.title}`).join('\n')}

业务场景：
{scenario}

关联代码/系统：
{codeRef || '（无）'}

约束（必须遵守）：
{anchorContents?.length ? anchorContents.map((c, i) => `${i+1}. ${c}`).join('\n') : '（无）'}

请以 JSON 输出，包含以下字段：
{
  "hypothesis": "一句话核心假设",
  "changes": "在代码/模型层面的具体改动，1-2 段",
  "sourceCitation": "来源论文 + 具体章节",
  "feasibility": 0-5 整数,
  "risk": "AI 自我审视的实施风险"
}
```

---

## 🌊 流式响应约定（SSE）

前端所有流式场景已经用 SSE 支持。**如果你选择流式**，需要按以下格式：

### 前后端约定的事件格式

```
data: {"type":"start"}\n\n
data: {"type":"delta","data":"这是"}\n\n
data: {"type":"delta","data":"一段"}\n\n
data: {"type":"delta","data":"逐字返回的文本"}\n\n
data: {"type":"end"}\n\n
```

### 后端封装

`apps/api/src/lib/sse.ts` 里的 `streamTextResponse` 是当前用的辅助函数。它把一整个字符串按 chunkSize 切开逐段发送，模拟 LLM 流式。

**接真 LLM 时**，你可以在 `apps/api/src/routes/ai.ts` 里改成：

```typescript
// 之前是：
const generated = await generateAICardContent(paper.title, type);
await streamTextResponse(reply, generated.content);

// 改成：
beginSSE(reply);
sendEvent(reply, 'start');
const stream = await callLLMStream(prompt); // 你的 LLM stream API
for await (const chunk of stream) {
  sendEvent(reply, 'delta', chunk);
}
// 同时保存到 DB
await prisma.aICard.upsert({ ... });
endSSE(reply);
```

### 前端如何消费

前端已经用 `useStreamingResource` hook 消费 SSE，你**不需要动前端代码**。

---

## 🧪 如何本地测试你的实现

### Step 1 · 起服务

```bash
npm run api:dev
```

### Step 2 · 直接测 LLM 函数（写单元测试）

在 `apps/api/src/lib/llm.ts` 同目录建 `llm.test.ts`：

```typescript
import { generateAICardContent } from './llm';

const r = await generateAICardContent('Transformer', 'method');
console.log(r);
```

```bash
cd apps/api && npx tsx src/lib/llm.test.ts
```

### Step 3 · 通过 HTTP 端点测

先登录拿 cookie：

```bash
curl -c /tmp/cookie.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@inspire.local","password":"demo1234"}'
```

测归档总结（SSE，看流式输出）：

```bash
curl -b /tmp/cookie.txt -N -X POST \
  http://localhost:4000/api/archive/summary/stream \
  -H "Content-Type: application/json" \
  -d '{"paperId":"YOUR_PAPER_ID","topicId":"YOUR_TOPIC_ID"}'
```

参数 `-N` 关掉缓冲，你能看到 `data: ...` 逐条打印。

### Step 4 · 前端端到端

浏览器打开 http://localhost:5173，走一遍：
- 阅读器 → AI 卡片流式
- 阅读器 → Chat 提问
- 归档弹窗 → 选目录 → 看 AI 初稿
- Inspire → 生成 Idea

前端的表现 = 你的 LLM 实现效果。

---

## 💰 成本与性能考虑

### 上下文长度

论文全文很长（10k-30k tokens）。策略：

- **短任务**（如卡片、Chat 单轮问答）→ 只塞论文摘要 + 标题
- **深度问答**（用户就某段问 AI）→ RAG：把论文段落存 embedding，Chat 时向量检索相关段落
- **Idea 生成**（跨多论文）→ 每篇塞标题 + AI 摘要 + 关键段落，不塞全文

### 分模型策略（省钱关键）

不同任务用不同档次模型：

| 任务 | 建议模型 | 单次成本估算 |
|---|---|---|
| Feed 一句话摘要（批量） | GPT-4o-mini / DeepSeek Chat | < $0.001 |
| AI 卡片 | GPT-4o-mini / Claude Haiku | ~$0.005 |
| 阅读器 Chat | GPT-4o / Claude Sonnet | ~$0.01 |
| Idea 生成 | GPT-4o / Claude Sonnet / DeepSeek | ~$0.02 |
| 归档推荐 embedding | text-embedding-3-small | < $0.0001 |

### Rate Limit 和排队

- OpenAI / Claude 都有 tier 制，前期限流严
- 建议在后端加请求队列（例如 `p-queue`）+ 指数退避重试
- Chat / Idea 生成场景要给用户明确 loading 状态

### 缓存

- 一篇论文的 AI 卡片生成过就存 DB，用户下次打开直接读 DB（已实现）
- Idea 生成建议不缓存（每次业务场景都不同）
- 归档推荐可以按论文 tags 做粗粒度缓存

---

## 🤔 常见问题

### Q1: 我在国内，OpenAI 用不了怎么办？

推荐用 **DeepSeek**（国产、原生可访问、性价比极高）：

```typescript
// apps/api/src/lib/llm.ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

// 用法与 OpenAI SDK 完全一样
```

### Q2: 密钥放哪？

放 `apps/api/.env`，**永远不要放前端**。前端所有 LLM 调用都通过后端 API 中转。

```bash
# apps/api/.env
DEEPSEEK_API_KEY=sk-xxx
# 或
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-xxx
```

### Q3: 想加个新的 LLM 场景怎么办？

比如你想加"论文标题翻译成中文"这样的新功能：

1. 在 `apps/api/src/lib/llm.ts` 加一个新导出函数
2. 在 `apps/api/src/routes/` 加对应的 HTTP endpoint
3. 在 `src/api/endpoints/` 加前端调用
4. 在需要的组件里 hook 起来

保持"LLM 抽象层只暴露业务语义函数、不暴露 SDK 细节"的原则。

### Q4: 需要改前端吗？

**基本不用**。前端已经支持：
- SSE 流式渲染
- Chat 消息累积
- Idea 卡片渲染
- 错误 toast

除非你想加新的 UI 场景，否则前端零改动。

### Q5: 如何评估 LLM 输出质量？

我们目前没做自动化评估。建议：
- 手动准备一份"Golden Set"：10-20 个典型论文 + 期望输出
- 每次改 prompt 或换模型跑一遍看质量变化
- 记录人工打分（相关性 / 准确性 / 有用性）

### Q6: 出错了要不要给用户看错误详情？

**不要**。给用户看的是 "生成失败，点击重试"，具体错误只记录在后端日志。防止暴露密钥、内部结构。

---

## 📌 交付清单

完成 LLM 接入后，请确保：

- [ ] `apps/api/src/lib/llm.ts` 里 4 个函数全部换成真实 LLM 调用
- [ ] Feed 卡片 `aiSummary` 生成也接入（在 `arxiv.ts` 里）
- [ ] `apps/api/.env.example` 补充你用到的 API_KEY 环境变量
- [ ] `apps/api/README.md` 或本文档更新"当前使用的 LLM 是什么"
- [ ] 手动跑过一遍完整流程（登录 → 阅读器 AI 卡片 → 归档 → Inspire）
- [ ] Rate limit / 重试 / 错误处理都做了
- [ ] 密钥没提交到代码库（`.env` 在 `.gitignore` 里）

祝你顺利！有卡住的地方，先看 `apps/api/src/lib/llm.ts` 里现有 Mock 是怎么写的，然后按同样模式替换即可。
