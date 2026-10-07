import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { PaperStatusSchema } from '@shared/schemas/paper';
import { z } from 'zod';
import {
  buildPaperFallback,
  fetchLatestPapers,
  searchArxivPapers,
} from '../lib/arxiv.js';
import {
  ARXIV_CONTENT_FORMAT_MARKER,
  ArxivContentError,
  fetchArxivFullText,
} from '../lib/arxivFullText.js';

const PAGE_SIZE = 9;

const FeedQuerySchema = z.object({
  domain: z.string().optional(),
  timeRange: z.enum(['today', 'week', 'month', 'all']).optional(),
  source: z.enum(['all', 'arxiv', 'blogger']).optional(),
  keyword: z.string().optional(),
  cursor: z.string().nullable().optional(),
});

const ArxivSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(12),
});

export const papersRoutes: FastifyPluginAsync = async (app) => {
  // 所有路由都需要登录
  app.addHook('preHandler', app.requireAuth);

  // GET /papers — Feed 流
  app.get('/papers', async (request) => {
    const q = FeedQuerySchema.parse(request.query);
    const where: Record<string, unknown> = { userId: request.userId };
    if (q.domain && q.domain !== 'all') where.domain = q.domain;
    if (q.source && q.source !== 'all') {
      if (q.source === 'blogger') {
        // 博主推荐 = 任何有博主推荐过的论文（bloggerIds 非空），
        // 不看论文本身来源
        where.bloggerIds = { isEmpty: false };
      } else {
        where.source = q.source;
      }
    }
    if (q.keyword) {
      where.OR = [
        { title: { contains: q.keyword, mode: 'insensitive' } },
        { aiSummary: { contains: q.keyword, mode: 'insensitive' } },
      ];
    }
    if (q.timeRange && q.timeRange !== 'all') {
      const now = new Date();
      const days = { today: 1, week: 7, month: 30 }[q.timeRange];
      where.addedAt = {
        gte: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
      };
    }

    const total = await prisma.paper.count({ where });
    const papers = await prisma.paper.findMany({
      where,
      orderBy: { addedAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(q.cursor && {
        skip: 1,
        cursor: { id: q.cursor },
      }),
    });

    const hasNext = papers.length > PAGE_SIZE;
    const items = hasNext ? papers.slice(0, PAGE_SIZE) : papers;
    return {
      papers: items.map(serializePaper),
      nextCursor: hasNext ? items[items.length - 1].id : null,
      total,
    };
  });

  // GET /papers/arxiv-search — 搜索 arXiv，并把结果去重加入当前用户 Feed
  app.get('/papers/arxiv-search', async (request, reply) => {
    const q = ArxivSearchQuerySchema.parse(request.query);
    const userId = request.userId!;

    try {
      const arxivPapers = await searchArxivPapers(q.q, q.limit);
      if (arxivPapers.length === 0) {
        return { papers: [], found: 0, inserted: 0, existing: 0 };
      }

      const arxivIds = arxivPapers.map((paper) => paper.arxivId);
      const existingRows = await prisma.paper.findMany({
        where: { userId, arxivId: { in: arxivIds } },
        select: { arxivId: true },
      });
      const existingIds = new Set(existingRows.map((paper) => paper.arxivId));
      const toInsert = arxivPapers.filter(
        (paper) => !existingIds.has(paper.arxivId)
      );

      const created = toInsert.length
        ? await prisma.paper.createMany({
            data: toInsert.map((paper) => buildPaperFallback(paper, userId)),
            skipDuplicates: true,
          })
        : { count: 0 };

      // 所有结果都从数据库重新读取，确保前端拿到的是可精读、可归档的真实 Paper id。
      const persisted = await prisma.paper.findMany({
        where: { userId, arxivId: { in: arxivIds } },
      });
      const byArxivId = new Map(
        persisted.map((paper) => [paper.arxivId, paper] as const)
      );
      const ordered = arxivPapers
        .map((paper) => byArxivId.get(paper.arxivId))
        .filter((paper): paper is NonNullable<typeof paper> => Boolean(paper));

      return {
        papers: ordered.map(serializePaper),
        found: arxivPapers.length,
        inserted: created.count,
        existing: arxivPapers.length - created.count,
      };
    } catch (error) {
      request.log.error({ error, query: q.q }, 'arXiv search failed');
      const isRateLimited =
        error instanceof Error && error.message.includes('HTTP 429');
      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      return reply.status(502).send({
        code: 'ARXIV_SEARCH_FAILED',
        message: isRateLimited
          ? 'arXiv 请求过于频繁，请稍后再试'
          : isTimeout
          ? 'arXiv 搜索超时，请稍后重试'
          : 'arXiv 搜索暂时不可用，请稍后重试',
      });
    }
  });

  // GET /papers/:id — 详情
  app.get<{ Params: { id: string } }>('/papers/:id', async (request, reply) => {
    const paper = await prisma.paper.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!paper) return reply.notFound('论文不存在');
    return serializePaper(paper);
  });

  // POST /papers/:id/fetch-content — 首次精读时按需抓取并缓存 arXiv 正文
  app.post<{ Params: { id: string } }>(
    '/papers/:id/fetch-content',
    async (request, reply) => {
      const paper = await prisma.paper.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!paper) return reply.notFound('论文不存在');

      // v2 正文已经包含表格和 object/SVG 图片支持，直接复用缓存。
      // 旧缓存没有格式标记，首次重新进入阅读器时会自动升级一次。
      if (paper.content?.startsWith(ARXIV_CONTENT_FORMAT_MARKER)) {
        return serializePaper(paper);
      }
      if (!paper.arxivId) {
        if (paper.content) return serializePaper(paper);
        return reply.badRequest('这篇论文没有 arXiv ID，无法自动获取正文');
      }

      try {
        const fullText = await fetchArxivFullText(paper.arxivId);
        const updated = await prisma.paper.update({
          where: { id: paper.id },
          data: {
            content: fullText.content,
            chapters: fullText.chapters as unknown as Prisma.InputJsonValue,
          },
        });
        return serializePaper(updated);
      } catch (error) {
        if (error instanceof ArxivContentError) {
          const statusCode =
            error.code === 'ARXIV_HTML_UNAVAILABLE' ? 404 :
            error.code === 'ARXIV_RATE_LIMITED' ? 429 : 502;
          return reply.status(statusCode).send({
            code: error.code,
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // POST /papers/refresh — 从 arXiv 抓取新论文（用户点刷新时触发）
  app.post('/papers/refresh', async (request) => {
    const userId = request.userId!;
    // 1. 从 arXiv 拉最新论文
    const papers = await fetchLatestPapers();
    if (papers.length === 0) {
      return { fetched: 0, inserted: 0, skipped: 0 };
    }

    // 2. 查库里已有的 arxivId，去重
    const arxivIds = papers.map((p) => p.arxivId).filter(Boolean);
    const existing = await prisma.paper.findMany({
      where: { userId, arxivId: { in: arxivIds } },
      select: { arxivId: true },
    });
    const existingIds = new Set(existing.map((e) => e.arxivId));

    const toInsert = papers.filter((p) => !existingIds.has(p.arxivId));

    // 3. 批量插入（降级字段生成在 buildPaperFallback 里）
    if (toInsert.length > 0) {
      await prisma.paper.createMany({
        data: toInsert.map((p) => buildPaperFallback(p, userId)),
        skipDuplicates: true,
      });
    }

    return {
      fetched: papers.length,
      inserted: toInsert.length,
      skipped: papers.length - toInsert.length,
    };
  });

  // PATCH /papers/:id — 更新（例：状态）
  app.patch<{ Params: { id: string } }>(
    '/papers/:id',
    async (request, reply) => {
      const body = z.object({ status: PaperStatusSchema.optional() }).parse(request.body);
      const paper = await prisma.paper.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!paper) return reply.notFound('论文不存在');
      const updated = await prisma.paper.update({
        where: { id: paper.id },
        data: body,
      });
      return serializePaper(updated);
    }
  );
};

function serializePaper(p: {
  id: string;
  userId: string;
  title: string;
  authors: string[];
  arxivId: string | null;
  externalUrl: string;
  source: string;
  bloggerIds: string[];
  abstract: string;
  aiSummary: string;
  tags: string[];
  domain: string;
  publishedAt: Date;
  addedAt: Date;
  readingMinutes: number;
  difficulty: string;
  status: string;
  content: string | null;
  chapters: unknown;
}) {
  return {
    id: p.id,
    title: p.title,
    authors: p.authors,
    arxivId: p.arxivId || undefined,
    externalUrl: p.externalUrl,
    source: p.source,
    bloggerIds: p.bloggerIds.length ? p.bloggerIds : undefined,
    abstract: p.abstract,
    aiSummary: p.aiSummary,
    tags: p.tags,
    domain: p.domain,
    publishedAt: p.publishedAt.toISOString(),
    addedAt: p.addedAt.toISOString(),
    readingMinutes: p.readingMinutes,
    difficulty: p.difficulty,
    status: p.status,
    content: p.content || undefined,
    chapters: p.chapters as unknown[] | undefined,
  };
}
