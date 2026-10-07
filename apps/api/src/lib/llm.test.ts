/**
 * LLM 函数单元测试脚本
 * ============================================================
 * 【面向 LLM 开发同事】
 *
 * 用途：
 * - 在不启动数据库、不启动后端服务的情况下，直接调用 LLM 抽象层的 4 个函数
 * - 快速验证你的 LLM 接入是否正确
 * - 作为开发时的主要反馈循环（改 prompt → 跑测试 → 看输出）
 *
 * 运行方式：
 *   cd apps/api
 *   npx tsx src/lib/llm.test.ts
 *
 * 前提：
 * - 已经装完 npm 依赖
 * - apps/api/.env 里配了你实际用的 LLM API Key
 * - 数据库连接串 DATABASE_URL/DIRECT_URL 可以随便填占位（不会用到）
 *
 * 你的开发流程建议：
 * 1) 逐个替换 llm.ts 里的 Mock 函数为真实 LLM 调用
 * 2) 每替换一个就跑这个脚本看效果
 * 3) 4 个函数都替换完后，再找维护者要 DB 密钥做端到端联调
 * ============================================================
 */

import 'dotenv/config';
import {
  generateIdeaViaLLM,
  generateChatReplyViaLLM,
  generateAICardContent,
  generateArchiveSummary,
} from './llm.js';

// ---------- 一些颜色辅助（可选，让输出更好看） ----------
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function section(title: string) {
  console.log(
    `\n${c.bright}${c.cyan}━━━ ${title} ${'━'.repeat(Math.max(0, 60 - title.length))}${c.reset}`
  );
}

function ok(msg: string) {
  console.log(`${c.green}✓${c.reset} ${msg}`);
}

function fail(msg: string, err?: unknown) {
  console.error(`${c.red}✗${c.reset} ${msg}`);
  if (err) console.error(c.dim, err, c.reset);
}

function dump(label: string, value: unknown) {
  console.log(`${c.dim}${label}:${c.reset}`, value);
}

// ============================================================
// 测试 1 · AI 结构化卡片（5 种类型逐个跑）
// ============================================================

async function testAICardContent() {
  section('Test 1 · AI 结构化卡片');

  const paperTitle =
    'Seq Fusion for Rec Systems: Dual-Path Long-Short Term Modeling';

  const types = [
    'motivation',
    'method',
    'experiments',
    'limitations',
    'transferable',
  ] as const;

  for (const type of types) {
    try {
      const result = await generateAICardContent(paperTitle, type);
      ok(`[${type}] 生成成功`);
      dump(' title', result.title);
      dump(' content', result.content);

      // 简单质量校验
      if (!result.title) fail(`  ⚠️ title 为空`);
      if (!result.content || result.content.length < 20) {
        fail(`  ⚠️ content 太短（<20 字符）`);
      }
    } catch (err) {
      fail(`[${type}] 生成失败`, err);
    }
  }
}

// ============================================================
// 测试 2 · 归档总结初稿
// ============================================================

async function testArchiveSummary() {
  section('Test 2 · 归档总结初稿');

  try {
    const summary = await generateArchiveSummary(
      'Seq Fusion for Rec Systems',
      '长短期融合'
    );
    ok('生成成功');
    dump('summary', summary);
    if (!summary || summary.length < 30) {
      fail(`⚠️ 总结太短`);
    }
  } catch (err) {
    fail('生成失败', err);
  }
}

// ============================================================
// 测试 3 · 阅读器 Chat 回复（多种问题类型）
// ============================================================

async function testChatReply() {
  section('Test 3 · 阅读器 Chat 回复');

  const paperTitle = 'Seq Fusion for Rec Systems';

  const questions = [
    '这个方法和 SIM 的区别是什么？',
    '论文里的延迟是多少？工业界能用吗？',
    '冷启动场景表现如何？',
    '这个思路能不能迁移到广告排序？',
  ];

  for (const q of questions) {
    try {
      const reply = await generateChatReplyViaLLM(paperTitle, q);
      ok(`Q: ${q}`);
      dump(' A', reply);
      if (!reply || reply.length < 20) {
        fail(`  ⚠️ 回复太短`);
      }
    } catch (err) {
      fail(`Q: ${q} → 失败`, err);
    }
  }
}

// ============================================================
// 测试 4 · Idea 生成（最复杂的场景 · 结构化输出）
// ============================================================

async function testIdeaGeneration() {
  section('Test 4 · Idea 生成（结构化输出）');

  try {
    const idea = await generateIdeaViaLLM({
      papers: [
        { title: 'Seq Fusion for Rec Systems' },
        { title: 'SIM: Search-based Interest Modeling' },
        { title: 'TWIN: Two-stage Interest Network' },
      ],
      scenario:
        '精排多目标学习中，冷启动样本量少，希望通过序列建模引入更多监督信号，同时不增加过多延迟。',
      codeRef: 'graviton_model.py',
      anchorContents: ['线上延迟必须 <50ms', '不能引入额外的存储依赖'],
    });

    ok('Idea 生成成功');
    dump(' hypothesis', idea.hypothesis);
    dump(' changes', idea.changes);
    dump(' sourceCitation', idea.sourceCitation);
    dump(' feasibility', idea.feasibility);
    dump(' risk', idea.risk);

    // 结构化校验
    if (typeof idea.hypothesis !== 'string' || !idea.hypothesis)
      fail('⚠️ hypothesis 缺失');
    if (typeof idea.changes !== 'string' || !idea.changes)
      fail('⚠️ changes 缺失');
    if (typeof idea.feasibility !== 'number')
      fail(`⚠️ feasibility 类型错误：${typeof idea.feasibility}`);
    if (idea.feasibility < 0 || idea.feasibility > 5)
      fail(`⚠️ feasibility 越界：${idea.feasibility}`);
    if (typeof idea.risk !== 'string' || !idea.risk)
      fail('⚠️ risk 缺失');

    // 语义校验（可选）
    if (!/延迟|latency|<\s*\d+\s*ms/i.test(idea.changes + idea.risk)) {
      console.log(
        `${c.yellow}  ⚠️  提示: 输出里没提到延迟约束，可能没遵守 anchorContents${c.reset}`
      );
    }
  } catch (err) {
    fail('Idea 生成失败', err);
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(
    `${c.bright}=====================================================${c.reset}`
  );
  console.log(
    `${c.bright}  Inspire Ideas · LLM 抽象层单元测试${c.reset}`
  );
  console.log(
    `${c.bright}=====================================================${c.reset}`
  );

  const start = Date.now();

  await testAICardContent();
  await testArchiveSummary();
  await testChatReply();
  await testIdeaGeneration();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n${c.dim}总耗时: ${elapsed}s${c.reset}`);
  console.log(
    `\n${c.green}${c.bright}✓ 所有测试跑完${c.reset}\n\n` +
      `${c.dim}下一步：\n` +
      `  - 如果所有输出都看着合理，就把 LLM 替换工作做完；\n` +
      `  - 如果有输出质量问题，调整 lib/llm.ts 里的 prompt 再跑一次；\n` +
      `  - 都 OK 后，找维护者要 DB 密钥做端到端联调（详见 DEMO.md）${c.reset}\n`
  );
}

main().catch((e) => {
  console.error(`\n${c.red}${c.bright}测试崩溃：${c.reset}`, e);
  process.exit(1);
});
