/**
 * 数据库种子脚本
 * ----------------------------------------
 * 运行：npx tsx prisma/seed.ts
 * 创建一个 demo 用户 + 若干论文/博主/目录，便于开发调试。
 */

import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'demo@inspire.local';
  const passwordHash = await argon2.hash('demo1234');

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Demo 用户',
      passwordHash,
    },
  });

  console.log(`✅ Demo user: ${email} / demo1234 (id=${user.id})`);

  // 清空该用户已有数据（幂等）
  await prisma.paper.deleteMany({ where: { userId: user.id } });
  await prisma.blogger.deleteMany({ where: { userId: user.id } });
  await prisma.topic.deleteMany({ where: { userId: user.id } });

  // 博主（预置一些示例，platform + platformUserId 使用假的占位值）
  const bloggers = await Promise.all([
    prisma.blogger.create({
      data: {
        userId: user.id,
        name: '推荐系统前沿',
        platform: 'xiaohongshu',
        platformUserId: 'demo-seed-recsys',
        crawlStatus: 'done',
        crawlProgress: 100,
        crawlProgressLabel: '演示数据',
      },
    }),
    prisma.blogger.create({
      data: {
        userId: user.id,
        name: 'AI 论文速递',
        platform: 'xiaohongshu',
        platformUserId: 'demo-seed-aipaper',
        crawlStatus: 'done',
        crawlProgress: 100,
        crawlProgressLabel: '演示数据',
      },
    }),
    prisma.blogger.create({
      data: {
        userId: user.id,
        name: 'LLM 工程实践',
        platform: 'xiaohongshu',
        platformUserId: 'demo-seed-llm',
        crawlStatus: 'done',
        crawlProgress: 100,
        crawlProgressLabel: '演示数据',
      },
    }),
  ]);
  console.log(`✅ Bloggers: ${bloggers.length}`);

  // 目录树
  const recSys = await prisma.topic.create({
    data: { userId: user.id, name: '推荐系统' },
  });
  const seq = await prisma.topic.create({
    data: { userId: user.id, name: '序列建模', parentId: recSys.id },
  });
  await prisma.topic.createMany({
    data: [
      { userId: user.id, name: '长短期融合', parentId: seq.id },
      { userId: user.id, name: '注意力机制', parentId: seq.id },
      { userId: user.id, name: '多目标学习', parentId: recSys.id },
      { userId: user.id, name: '冷启动', parentId: recSys.id },
    ],
  });
  const llm = await prisma.topic.create({
    data: { userId: user.id, name: '大模型' },
  });
  await prisma.topic.createMany({
    data: [
      { userId: user.id, name: '长文本', parentId: llm.id },
      { userId: user.id, name: 'MoE', parentId: llm.id },
    ],
  });
  await prisma.topic.create({
    data: { userId: user.id, name: '强化学习' },
  });
  console.log('✅ Topics created');

  // 论文
  await prisma.paper.create({
    data: {
      userId: user.id,
      title: 'Seq Fusion for Rec Systems',
      authors: ['Wei Chen', 'Ming Zhao'],
      arxivId: '2408.12345',
      externalUrl: 'https://arxiv.org/abs/2408.12345',
      source: 'arxiv',
      bloggerIds: [],
      abstract: 'Dual-path sequence fusion...',
      aiSummary: '提出双路序列融合方法，兼顾长期兴趣与实时会话意图。',
      tags: ['推荐系统', '序列建模'],
      domain: '推荐系统',
      publishedAt: new Date('2026-08-14'),
      readingMinutes: 12,
      difficulty: 'medium',
      status: 'unread',
      content: `# Seq Fusion for Rec Systems\n\n## Abstract\n\nWe propose a dual-path sequence fusion module...`,
      chapters: [
        { id: 'c1', title: 'Abstract', level: 1, anchor: 'abstract' },
      ],
    },
  });
  // 这篇论文由 2 位博主同时推荐（演示多博主关联场景）
  await prisma.paper.create({
    data: {
      userId: user.id,
      title: 'Long-Context Attention with Sliding Window Sparsity',
      authors: ['Alice Wang'],
      arxivId: '2407.99887',
      externalUrl: 'https://arxiv.org/abs/2407.99887',
      source: 'arxiv',
      bloggerIds: [bloggers[0].id, bloggers[1].id], // 两位博主同时推荐
      abstract: 'Sliding window sparse attention...',
      aiSummary: '提出一种基于滑动窗口的稀疏注意力，把长文本注意力开销降到近线性。',
      tags: ['LLM', '长文本'],
      domain: '大模型',
      publishedAt: new Date('2026-08-30'),
      readingMinutes: 25,
      difficulty: 'hard',
      status: 'unread',
    },
  });
  console.log('✅ Papers seeded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
