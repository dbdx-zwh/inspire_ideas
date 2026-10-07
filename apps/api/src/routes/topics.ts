import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma.js';
import {
  ArchiveRequestSchema,
  CreateTopicRequestSchema,
} from '@shared/schemas/topic';

export const topicsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/topics', async (request) => {
    const topics = await prisma.topic.findMany({
      where: { userId: request.userId },
      orderBy: { createdAt: 'asc' },
    });
    return topics.map((t) => ({
      id: t.id,
      name: t.name,
      parentId: t.parentId,
      paperCount: t.paperCount,
      createdAt: t.createdAt.toISOString(),
    }));
  });

  app.post('/topics', async (request) => {
    const body = CreateTopicRequestSchema.parse(request.body);
    const topic = await prisma.topic.create({
      data: {
        userId: request.userId!,
        name: body.name,
        parentId: body.parentId,
      },
    });
    return {
      id: topic.id,
      name: topic.name,
      parentId: topic.parentId,
      paperCount: 0,
      createdAt: topic.createdAt.toISOString(),
    };
  });

  app.post('/archive', async (request) => {
    const body = ArchiveRequestSchema.parse(request.body);
    const entries = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const topicId of body.topicIds) {
        // 避免重复归档同一 paper 到同一 topic
        const existing = await tx.archiveEntry.findFirst({
          where: { paperId: body.paperId, topicId },
        });
        if (existing) {
          if (body.summary && body.summary !== existing.summary) {
            await tx.archiveEntry.update({
              where: { id: existing.id },
              data: { summary: body.summary },
            });
          }
          created.push(existing);
          continue;
        }
        const entry = await tx.archiveEntry.create({
          data: {
            userId: request.userId!,
            paperId: body.paperId,
            topicId,
            summary: body.summary,
          },
        });
        // 更新 topic paperCount
        await tx.topic.update({
          where: { id: topicId },
          data: { paperCount: { increment: 1 } },
        });
        created.push(entry);
      }
      return created;
    });
    return entries.map((e) => ({
      id: e.id,
      paperId: e.paperId,
      topicId: e.topicId,
      summary: e.summary,
      createdAt: e.createdAt.toISOString(),
    }));
  });

  app.get<{ Params: { id: string } }>(
    '/topics/:id/papers',
    async (request) => {
      const entries = await prisma.archiveEntry.findMany({
        where: { topicId: request.params.id, userId: request.userId },
        // 目录列表不应读取 Paper 的全文 content 和 chapters。
        select: {
          paper: {
            select: {
              id: true,
              title: true,
              addedAt: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // (paperId, topicId) 有唯一索引，无需在内存中再次去重。
      return entries.map((e) => ({
        paperId: e.paper.id,
        title: e.paper.title,
        addedAt: e.paper.addedAt.toISOString(),
        status: e.paper.status,
      }));
    }
  );
};
