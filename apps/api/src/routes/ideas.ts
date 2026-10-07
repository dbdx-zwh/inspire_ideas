import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { fetchArxivFullText } from '../lib/arxivFullText.js';
import {
  GenerateIdeaRequestSchema,
  SendIdeaMessageRequestSchema,
} from '@shared/schemas/idea';
import {
  generateIdeaViaLLM,
  generateChatReplyViaLLM,
} from '../lib/llm.js';

/** 检测消息内容中的"约束"，提取为锚点 */
function detectConstraint(content: string): boolean {
  return /<\s*\d+\s*(ms|MS|毫秒|秒)|必须|不能|限制|约束|不超过|要\s*<|要小于/.test(
    content
  );
}

export const ideasRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.post('/ideas/generate', async (request, reply) => {
    const body = GenerateIdeaRequestSchema.parse(request.body);
    const foundPapers = await prisma.paper.findMany({
      where: { id: { in: body.paperIds }, userId: request.userId },
      select: {
        id: true,
        title: true,
        abstract: true,
        content: true,
        arxivId: true,
      },
    });
    const paperById = new Map(foundPapers.map((paper) => [paper.id, paper]));
    const papers = body.paperIds
      .map((id) => paperById.get(id))
      .filter((paper): paper is NonNullable<typeof paper> => !!paper);
    if (papers.length !== body.paperIds.length) {
      return reply.notFound('部分灵感来源论文不存在或无权访问');
    }

    // Feed 可以在精读前直接归档，因此 Idea 生成时若正文尚未缓存，自动尝试
    // 从 arXiv 导入。失败的论文不会悄悄退化成只看标题/摘要。
    await Promise.all(
      papers.map(async (paper) => {
        if (paper.content?.trim() || !paper.arxivId) return;
        try {
          const fullText = await fetchArxivFullText(paper.arxivId);
          await prisma.paper.update({
            where: { id: paper.id },
            data: {
              content: fullText.content,
              chapters: fullText.chapters as unknown as Prisma.InputJsonValue,
            },
          });
          paper.content = fullText.content;
        } catch (error) {
          request.log.warn(
            { error, paperId: paper.id, arxivId: paper.arxivId },
            'Idea 生成前自动导入论文正文失败'
          );
        }
      })
    );

    const missingContent = papers.filter((paper) => !paper.content?.trim());
    if (missingContent.length > 0) {
      return reply.status(409).send({
        code: 'PAPER_CONTENT_REQUIRED',
        message: `以下论文暂时无法获取正文，请先进入阅读器完成正文导入：${missingContent
          .map((paper) => `《${paper.title}》`)
          .join('、')}`,
      });
    }

    const generated = await generateIdeaViaLLM({
      papers,
      scenario: body.scenario,
      codeRef: body.codeRef,
      anchorContents: body.anchorContents,
      userId: request.userId,
    });
    const idea = await prisma.idea.create({
      data: {
        userId: request.userId!,
        sourcePaperIds: body.paperIds,
        scenario: body.scenario,
        codeRef: body.codeRef,
        hypothesis: generated.hypothesis,
        changes: generated.changes,
        sourceCitation: generated.sourceCitation,
        feasibility: generated.feasibility,
        risk: generated.risk,
        status: 'draft',
      },
    });
    // 更新来源论文状态
    await prisma.paper.updateMany({
      where: {
        id: { in: body.paperIds },
        userId: request.userId,
        status: { in: ['archived', 'done'] },
      },
      data: { status: 'inspired' },
    });
    return serializeIdea(idea);
  });

  app.patch<{ Params: { id: string } }>(
    '/ideas/:id',
    async (request, reply) => {
      const body = request.body as { status?: string };
      const idea = await prisma.idea.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!idea) return reply.notFound();
      const updated = await prisma.idea.update({
        where: { id: idea.id },
        data: { status: body.status ?? idea.status },
      });
      if (body.status === 'confirmed') {
        await prisma.paper.updateMany({
          where: {
            id: { in: idea.sourcePaperIds },
            userId: request.userId,
          },
          data: { status: 'idea' },
        });
      }
      return serializeIdea(updated);
    }
  );

  app.get<{ Params: { id: string } }>('/ideas/:id/messages', async (request) => {
    const msgs = await prisma.chatMessage.findMany({
      where: { ideaId: request.params.id, userId: request.userId },
      orderBy: { createdAt: 'asc' },
    });
    return msgs.map((m) => ({
      id: m.id,
      ideaId: m.ideaId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      createdAnchorIds: m.createdAnchorIds.length
        ? m.createdAnchorIds
        : undefined,
    }));
  });

  app.post<{ Params: { id: string } }>(
    '/ideas/:id/messages',
    async (request, reply) => {
      const body = SendIdeaMessageRequestSchema.parse(request.body);
      const idea = await prisma.idea.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!idea) return reply.notFound();

      const isConstraint = detectConstraint(body.content);
      let anchorId: string | null = null;

      await prisma.$transaction(async (tx) => {
        await tx.chatMessage.create({
          data: {
            userId: request.userId!,
            ideaId: idea.id,
            role: 'user',
            content: body.content,
          },
        });
        if (isConstraint) {
          const anchor = await tx.anchor.create({
            data: {
              userId: request.userId!,
              ideaId: idea.id,
              content: body.content,
            },
          });
          anchorId = anchor.id;
        }
      });

      const aiContent = isConstraint
        ? '已记录为锚点，后续 Idea 迭代会遵守该约束。你还有其他补充吗？'
        : '收到你的反馈。要不要我基于你的输入生成一个更聚焦的 Idea 版本？';

      const aiMsg = await prisma.chatMessage.create({
        data: {
          userId: request.userId!,
          ideaId: idea.id,
          role: 'ai',
          content: aiContent,
          createdAnchorIds: anchorId ? [anchorId] : [],
        },
      });

      const anchor = anchorId
        ? await prisma.anchor.findUnique({ where: { id: anchorId } })
        : null;

      return {
        message: {
          id: aiMsg.id,
          ideaId: aiMsg.ideaId,
          role: aiMsg.role,
          content: aiMsg.content,
          createdAt: aiMsg.createdAt.toISOString(),
          createdAnchorIds: aiMsg.createdAnchorIds,
        },
        anchor: anchor
          ? {
              id: anchor.id,
              ideaId: anchor.ideaId,
              content: anchor.content,
              createdAt: anchor.createdAt.toISOString(),
            }
          : null,
      };
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/anchors/:id',
    async (request, reply) => {
      await prisma.anchor.deleteMany({
        where: { id: request.params.id, userId: request.userId },
      });
      return reply.status(204).send();
    }
  );

  // 顺带 reader chat 也走这里
  app.get<{ Params: { id: string } }>(
    '/papers/:id/chat',
    async (request) => {
      const msgs = await prisma.readerChatMessage.findMany({
        where: { paperId: request.params.id, userId: request.userId },
        orderBy: { createdAt: 'asc' },
      });
      return msgs.map((m) => ({
        id: m.id,
        paperId: m.paperId,
        role: m.role,
        content: m.content,
        citedAnchor: m.citedAnchor || undefined,
        createdAt: m.createdAt.toISOString(),
      }));
    }
  );

  // SSE：Reader chat 流式
  app.post<{ Params: { id: string } }>(
    '/papers/:id/chat/stream',
    async (request, reply) => {
      const paperId = request.params.id;
      const { content, citedAnchor, citedText } = z.object({
        content: z.string().trim().min(1).max(4000),
        citedAnchor: z.string().max(120).optional(),
        citedText: z.string().max(12_000).optional(),
      }).parse(request.body);
      const paper = await prisma.paper.findFirst({
        where: { id: paperId, userId: request.userId },
        select: { title: true, abstract: true, content: true },
      });
      if (!paper) return reply.notFound();
      if (!paper.content) {
        return reply.status(409).send({
          code: 'PAPER_CONTENT_REQUIRED',
          message: '论文正文尚未准备完成，请稍后再提问。',
        });
      }

      const history = await prisma.readerChatMessage.findMany({
        where: { paperId, userId: request.userId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { role: true, content: true },
      });

      const aiContent = await generateChatReplyViaLLM(
        paper.title,
        content,
        citedAnchor,
        {
          paper,
          citedText,
          history: history.reverse().map((message) => ({
            role: message.role === 'user' ? 'user' : 'ai',
            content: message.content,
          })),
          userId: request.userId,
        }
      );

      // 保存两条消息
      await prisma.readerChatMessage.createMany({
        data: [
          {
            userId: request.userId!,
            paperId,
            role: 'user',
            content,
            citedAnchor,
          },
          {
            userId: request.userId!,
            paperId,
            role: 'ai',
            content: aiContent,
          },
        ],
      });

      // 流式返回
      const { streamTextResponse } = await import('../lib/sse.js');
      await streamTextResponse(reply, aiContent);
    }
  );
};

function serializeIdea(i: {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  sourcePaperIds: string[];
  scenario: string;
  codeRef: string | null;
  hypothesis: string;
  changes: string;
  sourceCitation: string;
  feasibility: number;
  risk: string;
  status: string;
}) {
  return {
    id: i.id,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    sourcePaperIds: i.sourcePaperIds,
    scenario: i.scenario,
    codeRef: i.codeRef || undefined,
    hypothesis: i.hypothesis,
    changes: i.changes,
    sourceCitation: i.sourceCitation,
    feasibility: i.feasibility,
    risk: i.risk,
    status: i.status,
    anchorIds: [],
  };
}
