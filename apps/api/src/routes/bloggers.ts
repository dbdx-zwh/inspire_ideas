/**
 * 博主管理路由
 * ----------------------------------------
 * 相比初版的主要改动：
 * 1. 支持平台（xiaohongshu / zhihu）+ 平台用户编码
 * 2. 抓取从 Mock 换成真实爬虫（当前只做小红书静态页）
 * 3. recommendCount / deepReadRatio 从 DB 存储改为查询时聚合
 * 4. 从帖子内容里抽取 arxivId → 拉论文详情 → 关联到博主
 * 5. 支持"同一篇论文被多个博主推荐"（bloggerIds 数组去重追加）
 */

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma.js';
import { AddBloggerRequestSchema } from '@shared/schemas/blogger';
import { getCrawler } from '../lib/crawlers/index.js';
import { decryptString } from '../lib/crypto.js';
import type { StorageState } from '../lib/crawlers/browser.js';
import {
  extractPaperCandidates,
  titleSimilarity,
} from '../lib/crawlers/extractPaper.js';
import {
  buildPaperFallback,
  fetchPapersByArxivIds,
  searchArxivByTitle,
} from '../lib/arxiv.js';

const TITLE_MATCH_THRESHOLD = 0.7; // 标题相似度阈值

export const bloggersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  // ---------- GET /bloggers ----------
  // 返回所有博主，同时聚合计算 recommendCount 和 deepReadRatio
  app.get('/bloggers', async (request) => {
    const userId = request.userId!;
    const bloggers = await prisma.blogger.findMany({
      where: { userId },
      orderBy: { followedAt: 'desc' },
    });
    if (bloggers.length === 0) return [];

    // 一次性拉出该用户所有论文，避免 N+1 查询
    // 只拿必要字段
    const allPapers = await prisma.paper.findMany({
      where: {
        userId,
        bloggerIds: { hasSome: bloggers.map((b) => b.id) },
      },
      select: { id: true, bloggerIds: true, status: true },
    });

    return bloggers.map((b) => {
      const recPapers = allPapers.filter((p) => p.bloggerIds.includes(b.id));
      const recommendCount = recPapers.length;
      // 精读比例：状态 ≥ done 视为"已精读"
      const doneStatuses = new Set(['done', 'archived', 'inspired', 'idea']);
      const deepReadCount = recPapers.filter((p) =>
        doneStatuses.has(p.status)
      ).length;
      const deepReadRatio =
        recommendCount >= 5 ? deepReadCount / recommendCount : null;

      return {
        id: b.id,
        name: b.name,
        avatarUrl: b.avatarUrl || undefined,
        externalUrl: b.externalUrl || undefined,
        platform: b.platform,
        platformUserId: b.platformUserId,
        followedAt: b.followedAt.toISOString(),
        crawlStatus: b.crawlStatus,
        crawlProgress: b.crawlProgress,
        crawlProgressLabel: b.crawlProgressLabel || undefined,
        lastCrawledAt: b.lastCrawledAt?.toISOString() || undefined,
        errorMessage: b.errorMessage || undefined,
        recommendCount,
        deepReadRatio,
      };
    });
  });

  // ---------- POST /bloggers ----------
  // 添加博主：立即返回记录，后台异步抓取
  app.post('/bloggers', async (request, reply) => {
    const body = AddBloggerRequestSchema.parse(request.body);
    const userId = request.userId!;

    const crawler = getCrawler(body.platform);
    if (!crawler) {
      return reply.badRequest(`平台 ${body.platform} 暂不支持`);
    }
    const parsed = crawler.parseInput(body.query);
    if (!parsed) {
      return reply.badRequest('无法识别用户编码或链接格式');
    }

    // 幂等：如果已经存在同一 (platform, platformUserId)，直接返回现有记录
    const existing = await prisma.blogger.findFirst({
      where: {
        userId,
        platform: body.platform,
        platformUserId: parsed.platformUserId,
      },
    });
    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        platform: existing.platform,
        platformUserId: existing.platformUserId,
        externalUrl: existing.externalUrl,
        followedAt: existing.followedAt.toISOString(),
        crawlStatus: existing.crawlStatus,
        crawlProgress: existing.crawlProgress,
        recommendCount: 0,
        deepReadRatio: null,
      };
    }

    const blogger = await prisma.blogger.create({
      data: {
        userId,
        name: body.query, // 先用用户输入占位，抓到主页后可以更新
        platform: body.platform,
        platformUserId: parsed.platformUserId,
        externalUrl: parsed.externalUrl,
        crawlStatus: 'crawling',
        crawlProgress: 0,
        crawlProgressLabel: '排队中...',
      },
    });

    // 后台异步抓取
    runCrawl(blogger.id, userId).catch((e) =>
      app.log.error({ err: e, bloggerId: blogger.id }, '抓取任务崩溃')
    );

    return {
      id: blogger.id,
      name: blogger.name,
      platform: blogger.platform,
      platformUserId: blogger.platformUserId,
      externalUrl: blogger.externalUrl,
      followedAt: blogger.followedAt.toISOString(),
      crawlStatus: blogger.crawlStatus,
      crawlProgress: 0,
      recommendCount: 0,
      deepReadRatio: null,
    };
  });

  // ---------- DELETE /bloggers/:id ----------
  app.delete<{ Params: { id: string } }>(
    '/bloggers/:id',
    async (request, reply) => {
      await prisma.blogger.deleteMany({
        where: { id: request.params.id, userId: request.userId },
      });
      return reply.status(204).send();
    }
  );

  // ---------- GET /bloggers/:id/crawl-progress ----------
  app.get<{ Params: { id: string } }>(
    '/bloggers/:id/crawl-progress',
    async (request, reply) => {
      const b = await prisma.blogger.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!b) return reply.notFound();
      return {
        status: b.crawlStatus,
        progress: b.crawlProgress,
        label: b.crawlProgressLabel || undefined,
      };
    }
  );
};

/**
 * 后台抓取任务
 * ----------------------------------------
 * 1. 用对应平台的 Crawler 抓帖子
 * 2. 从帖子文本抽 arxivId
 * 3. 用 arXiv API 拉论文详情
 * 4. upsert 论文 + 关联到该博主
 * 5. 保存 BloggerPost 记录做溯源
 * 6. 全程更新 crawlProgress
 */
async function runCrawl(bloggerId: string, userId: string) {
  const blogger = await prisma.blogger.findUnique({
    where: { id: bloggerId },
  });
  if (!blogger) return;

  const crawler = getCrawler(blogger.platform);
  if (!crawler) return;

  const updateProgress = (progress: number, label: string) =>
    prisma.blogger
      .update({
        where: { id: bloggerId },
        data: { crawlProgress: progress, crawlProgressLabel: label },
      })
      .catch(() => null);

  // 加载该用户自己的登录态（per-user 隔离）；解密失败按无登录态降级
  const credentialRow = await prisma.crawlerCredential.findUnique({
    where: {
      userId_platform: { userId, platform: blogger.platform },
    },
  });
  let credential: { storageState: StorageState } | undefined;
  if (credentialRow && credentialRow.status === 'valid') {
    try {
      credential = {
        storageState: JSON.parse(
          decryptString(credentialRow.storageStateEnc)
        ) as StorageState,
      };
    } catch (e) {
      console.warn(
        '[Crawler] 登录态解密失败，按无登录态抓取:',
        (e as Error).message
      );
    }
  }

  try {
    // 抓主页 + 帖子
    const { profile, posts } = await crawler.crawl(
      blogger.platformUserId,
      (p) => {
        updateProgress(p.processed, p.label);
      },
      credential
    );

    // 如果解析到了博主真实昵称/头像，回填到 DB
    // 只有当当前 name 还是"用户输入的原始值"（即等于 platformUserId 或其变体）时才覆盖，
    // 避免覆盖用户之后可能手动改的备注名。这里简化处理：只要抓到真实昵称就用。
    const patch: Record<string, unknown> = {};
    if (profile.name && profile.name !== blogger.name) {
      patch.name = profile.name;
    }
    if (profile.avatarUrl && profile.avatarUrl !== blogger.avatarUrl) {
      patch.avatarUrl = profile.avatarUrl;
    }
    if (Object.keys(patch).length > 0) {
      await prisma.blogger
        .update({ where: { id: bloggerId }, data: patch })
        .catch(() => null);
    }

    if (posts.length === 0) {
      await prisma.blogger.update({
        where: { id: bloggerId },
        data: {
          crawlStatus: 'done',
          crawlProgress: 100,
          crawlProgressLabel: profile.name
            ? `已识别博主"${profile.name}"，但未能抓到具体笔记（静态页限制）`
            : '未能抓到帖子（静态页限制），可稍后重试',
          lastCrawledAt: new Date(),
        },
      });
      return;
    }

    // 收集所有帖子中提到的 arxivId + 候选标题
    const allArxivIds = new Set<string>();
    const allTitleCandidates = new Set<string>();
    const postArxivMap: Record<string, string[]> = {};
    console.log(`[Crawler] 开始处理 ${posts.length} 条笔记`);
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const combinedText = `${post.title}\n${post.content}\n${post.url}`;
      const { arxivIds, titles } = extractPaperCandidates(combinedText);
      postArxivMap[post.platformPostId] = arxivIds;
      arxivIds.forEach((id) => allArxivIds.add(id));
      titles.forEach((t) => allTitleCandidates.add(t));
      console.log(
        `[Crawler]   笔记 "${post.title.slice(0, 40)}" 内容长度=${post.content.length}, 直接引用=${arxivIds.length}, 候选标题=${titles.length}`
      );
      if (titles.length > 0) {
        console.log(`[Crawler]     候选标题: ${titles.slice(0, 5).join(' | ')}`);
      }
      // 抽取到 0 时，打印首篇正文片段方便诊断
      if (i === 0 && arxivIds.length === 0 && titles.length === 0) {
        const snippet = post.content.slice(0, 300);
        console.log(`[Crawler]     ⚠️ 首篇 0 匹配，正文预览: ${snippet}`);
      }
    }
    console.log(
      `[Crawler] 汇总: ${allArxivIds.size} 个 arxivId + ${allTitleCandidates.size} 个候选标题`
    );

    await updateProgress(
      60,
      `发现 ${allArxivIds.size} 个直接引用 + ${allTitleCandidates.size} 个候选标题`
    );

    // 1) 先用 arxivId 批量拉论文详情
    let arxivPapers: Awaited<ReturnType<typeof fetchPapersByArxivIds>> = [];
    if (allArxivIds.size > 0) {
      try {
        arxivPapers = await fetchPapersByArxivIds(Array.from(allArxivIds));
      } catch (e) {
        console.error('[Crawler] arXiv fetch by ID failed:', e);
      }
    }

    // 2) 再用候选标题去 arXiv 搜索，反查 arxivId
    if (allTitleCandidates.size > 0) {
      await updateProgress(75, '通过标题反查 arXiv...');
      for (const title of allTitleCandidates) {
        try {
          const candidates = await searchArxivByTitle(title, 3);
          // 找相似度最高的一个
          let best: {
            paper: (typeof candidates)[number];
            sim: number;
          } | null = null;
          for (const c of candidates) {
            const sim = titleSimilarity(title, c.title);
            if (sim >= TITLE_MATCH_THRESHOLD && (!best || sim > best.sim)) {
              best = { paper: c, sim };
            }
          }
          if (best && !allArxivIds.has(best.paper.arxivId)) {
            arxivPapers.push(best.paper);
            allArxivIds.add(best.paper.arxivId);
            // 把这条 arxivId 也追加到对应的 post
            for (const post of posts) {
              if (
                (`${post.title}\n${post.content}`.includes(title) ||
                  post.title.includes(title)) &&
                !postArxivMap[post.platformPostId].includes(best.paper.arxivId)
              ) {
                postArxivMap[post.platformPostId].push(best.paper.arxivId);
              }
            }
          }
          // arXiv API 限流：每次请求间隔 300ms
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.warn('[Crawler] title search failed:', title, e);
        }
      }
    }

    // 论文入库（小事务，只保证 paper 相关的原子性）
    await prisma.$transaction(
      async (tx) => {
        const existingPapers = await tx.paper.findMany({
          where: {
            userId,
            arxivId: { in: Array.from(allArxivIds) },
          },
          select: { id: true, arxivId: true, bloggerIds: true },
        });
        const existingByArxiv = new Map(
          existingPapers.map((p) => [p.arxivId!, p])
        );

        for (const arxivPaper of arxivPapers) {
          const existing = existingByArxiv.get(arxivPaper.arxivId);
          if (existing) {
            if (!existing.bloggerIds.includes(bloggerId)) {
              await tx.paper.update({
                where: { id: existing.id },
                data: { bloggerIds: { push: bloggerId } },
              });
            }
          } else {
            const paperData = buildPaperFallback(arxivPaper, userId);
            paperData.bloggerIds = [bloggerId];
            await tx.paper.create({ data: paperData });
          }
        }
      },
      { timeout: 30_000, maxWait: 10_000 } // 放宽事务超时
    );

    // BloggerPost 逐条 upsert（不放事务里，避免慢查询阻塞）
    for (const post of posts) {
      await prisma.bloggerPost
        .upsert({
          where: {
            bloggerId_platformPostId: {
              bloggerId,
              platformPostId: post.platformPostId,
            },
          },
          create: {
            bloggerId,
            platformPostId: post.platformPostId,
            title: post.title,
            content: post.content,
            url: post.url,
            publishedAt: post.publishedAt,
            extractedArxivIds: postArxivMap[post.platformPostId] || [],
          },
          update: {
            title: post.title,
            content: post.content,
            extractedArxivIds: postArxivMap[post.platformPostId] || [],
          },
        })
        .catch((e) => console.warn('[Crawler] BloggerPost upsert 失败:', e.message));
    }

    await prisma.blogger.update({
      where: { id: bloggerId },
      data: {
        crawlStatus: 'done',
        crawlProgress: 100,
        crawlProgressLabel: `完成 · 处理 ${posts.length} 篇帖子，发现 ${allArxivIds.size} 篇论文`,
        lastCrawledAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (err) {
    const rawMsg = (err as Error).message || '未知错误';
    console.error('[Crawler] failed:', rawMsg);

    // 判断是否是登录态过期
    const isCookieExpired =
      rawMsg === 'COOKIE_EXPIRED' ||
      /COOKIE_EXPIRED/.test(rawMsg) ||
      /安全验证/.test(rawMsg) ||
      /未登录|请先登录|登录已过期|登录态/.test(rawMsg);

    // 命中过期：把该用户的凭证标记为 expired，前端弹窗会引导重新扫码
    if (isCookieExpired && credentialRow) {
      await prisma.crawlerCredential
        .updateMany({
          where: { id: credentialRow.id },
          data: { status: 'expired' },
        })
        .catch(() => null);
    }

    const friendlyMsg = isCookieExpired
      ? '小红书登录态已失效。请打开「管理关注博主」弹窗，点击「重新扫码绑定」后重试。'
      : rawMsg;

    await prisma.blogger
      .update({
        where: { id: bloggerId },
        data: {
          crawlStatus: 'failed',
          crawlProgress: 100,
          errorMessage: friendlyMsg,
          crawlProgressLabel: isCookieExpired
            ? '登录态失效，请重新登录'
            : '抓取失败',
        },
      })
      .catch(() => null);
  }
}
