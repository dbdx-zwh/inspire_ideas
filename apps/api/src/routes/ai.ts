import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma.js';
import { streamTextResponse } from '../lib/sse.js';
import {
  generateAllAICards,
  generateAICardContent,
  generateArchiveSummary,
} from '../lib/llm.js';
import { AICardTypeSchema } from '@shared/schemas/paper';

const AI_CARD_GENERATOR_VERSION = 'full-paper-batch-v3';

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  // GET /papers/:id/ai-cards
  app.get<{ Params: { id: string } }>(
    '/papers/:id/ai-cards',
    async (request) => {
      const cards = await prisma.aICard.findMany({
        where: {
          paperId: request.params.id,
          userId: request.userId,
          generatorVersion: AI_CARD_GENERATOR_VERSION,
        },
        orderBy: { order: 'asc' },
      });
      return cards.map((c) => ({
        id: c.id,
        paperId: c.paperId,
        type: c.type,
        title: c.title,
        content: c.content,
        order: c.order,
        updatedAt: c.updatedAt.toISOString(),
      }));
    }
  );

  // 用户点击生成：一次请求阅读全文，返回五类结构化总结并缓存。
  app.post<{ Params: { id: string } }>(
    '/papers/:id/ai-cards/generate',
    async (request, reply) => {
      const paper = await prisma.paper.findFirst({
        where: { id: request.params.id, userId: request.userId },
        select: { id: true, title: true, abstract: true, content: true },
      });
      if (!paper) return reply.notFound('论文不存在');
      if (!paper.content) {
        return reply.status(409).send({
          code: 'PAPER_CONTENT_REQUIRED',
          message: '论文正文尚未准备完成，请稍后重试。',
        });
      }

      const generated = await generateAllAICards(paper, request.userId);
      await prisma.$transaction(
        generated.map((card, index) =>
          prisma.aICard.upsert({
            where: { paperId_type: { paperId: paper.id, type: card.type } },
            create: {
              userId: request.userId!,
              paperId: paper.id,
              type: card.type,
              title: card.title,
              content: card.content,
              order: index,
              generatorVersion: AI_CARD_GENERATOR_VERSION,
            },
            update: {
              title: card.title,
              content: card.content,
              order: index,
              generatorVersion: AI_CARD_GENERATOR_VERSION,
            },
          })
        )
      );
      const cards = await prisma.aICard.findMany({
        where: {
          paperId: paper.id,
          userId: request.userId,
          generatorVersion: AI_CARD_GENERATOR_VERSION,
        },
        orderBy: { order: 'asc' },
      });
      return cards.map(serializeAICard);
    }
  );

  // SSE：AI 卡片流式生成（并保存到 DB）
  app.post<{ Params: { id: string; type: string } }>(
    '/papers/:id/ai-cards/:type/stream',
    async (request, reply) => {
      const { id: paperId, type } = request.params;
      const parsedType = AICardTypeSchema.safeParse(type);
      if (!parsedType.success) return reply.badRequest('不支持的 AI 卡片类型');
      const paper = await prisma.paper.findFirst({
        where: { id: paperId, userId: request.userId },
        select: { title: true, abstract: true, content: true },
      });
      if (!paper) return reply.notFound();
      if (!paper.content) {
        return reply.status(409).send({
          code: 'PAPER_CONTENT_REQUIRED',
          message: '论文正文尚未准备完成，请稍后重试。',
        });
      }
      const generated = await generateAICardContent(
        paper.title,
        parsedType.data,
        paper,
        request.userId
      );
      // 保存到 DB
      await prisma.aICard.upsert({
        where: { paperId_type: { paperId, type } },
        create: {
          userId: request.userId!,
          paperId,
          type,
          title: generated.title,
          content: generated.content,
          order: getOrderByType(type),
          generatorVersion: AI_CARD_GENERATOR_VERSION,
        },
        update: {
          title: generated.title,
          content: generated.content,
          generatorVersion: AI_CARD_GENERATOR_VERSION,
        },
      });
      await streamTextResponse(reply, generated.content);
    }
  );

  // PATCH /papers/:id/ai-cards/order
  app.patch<{ Params: { id: string } }>(
    '/papers/:id/ai-cards/order',
    async (request, reply) => {
      const { orderedIds } = request.body as { orderedIds: string[] };
      await Promise.all(
        orderedIds.map((id, i) =>
          prisma.aICard.updateMany({
            where: { id, userId: request.userId, paperId: request.params.id },
            data: { order: i },
          })
        )
      );
      return reply.status(204).send();
    }
  );

  // 归档目录推荐
  app.get<{ Params: { id: string } }>(
    '/papers/:id/archive-recommendations',
    async (request) => {
      const paper = await prisma.paper.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!paper) return [];
      const topics = await prisma.topic.findMany({
        where: { userId: request.userId },
      });
      // 简单规则：叶子目录，且名称包含 paper 的 tag 或 domain
      const hasChildren = new Set(
        topics.filter((t) => t.parentId).map((t) => t.parentId!)
      );
      const leaves = topics.filter((t) => !hasChildren.has(t.id));
      const scored = leaves
        .map((t) => {
          let score = 0;
          if (t.name.includes(paper.domain)) score += 0.5;
          for (const tag of paper.tags) {
            if (t.name.includes(tag)) score += 0.3;
          }
          return { topic: t, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      return scored.map((s) => ({
        topicId: s.topic.id,
        score: Math.min(0.95, s.score),
        reason: `与论文的"${paper.tags[0] || paper.domain}"主题相关`,
      }));
    }
  );

  // 归档总结 SSE
  app.post('/archive/summary/stream', async (request, reply) => {
    const { paperId, topicId } = request.body as {
      paperId: string;
      topicId: string;
    };
    const [paper, topic] = await Promise.all([
      prisma.paper.findFirst({
        where: { id: paperId, userId: request.userId },
      }),
      prisma.topic.findFirst({
        where: { id: topicId, userId: request.userId },
      }),
    ]);
    if (!paper || !topic) return reply.notFound();
    const summary = await generateArchiveSummary(paper.title, topic.name);
    await streamTextResponse(reply, summary);
  });
};

function getOrderByType(type: string): number {
  const order = ['motivation', 'method', 'experiments', 'limitations', 'transferable'];
  return order.indexOf(type);
}

function serializeAICard(c: {
  id: string;
  paperId: string;
  type: string;
  title: string;
  content: string;
  order: number;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    paperId: c.paperId,
    type: c.type,
    title: c.title,
    content: c.content,
    order: c.order,
    updatedAt: c.updatedAt.toISOString(),
  };
}
