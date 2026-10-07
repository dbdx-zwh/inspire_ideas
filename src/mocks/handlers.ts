/**
 * MSW handlers
 * ----------------------------------------
 * 拦截前端 fetch 请求，返回 Mock 数据。
 * 未来接真实后端时：只需在 main.tsx 中不启动 worker 即可全部禁用。
 */

import { http, HttpResponse, delay } from 'msw';
import { db, makeId, sleep } from './db';
import type {
  AICard,
  AICardType,
  ChatMessage,
  Idea,
  Paper,
  PaperStatus,
  Topic,
} from '@/types';
import { streamJson, streamText } from './streamHelpers';
import { generateChatReply, getMockCardContent } from './data/aiCardContent';

/** 简单模拟网络延迟 */
async function withDelay(min = 120, max = 320) {
  const ms = min + Math.random() * (max - min);
  await delay(ms);
}

export const handlers = [
  // ============ Feed / Papers ============
  http.get('/api/papers', async ({ request }) => {
    await withDelay();
    const url = new URL(request.url);
    const domain = url.searchParams.get('domain') || undefined;
    const source = url.searchParams.get('source') || 'all';
    const keyword = url.searchParams.get('keyword') || undefined;
    const cursor = url.searchParams.get('cursor');
    const PAGE = 9;

    let list = [...db.papers].sort(
      (a, b) => +new Date(b.addedAt) - +new Date(a.addedAt)
    );
    if (domain && domain !== 'all') {
      list = list.filter((p) => p.domain === domain);
    }
    if (source !== 'all') {
      if (source === 'blogger') {
        // 博主推荐 = 有任何博主推荐过的论文（bloggerIds 非空），不看论文本身来源
        list = list.filter((p) => (p.bloggerIds?.length ?? 0) > 0);
      } else {
        list = list.filter((p) => p.source === source);
      }
    }
    if (keyword) {
      const kw = keyword.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(kw) ||
          p.aiSummary.toLowerCase().includes(kw) ||
          p.tags.some((t) => t.toLowerCase().includes(kw))
      );
    }

    const startIdx = cursor ? list.findIndex((p) => p.id === cursor) + 1 : 0;
    const chunk = list.slice(startIdx, startIdx + PAGE);
    const nextCursor =
      startIdx + PAGE < list.length ? chunk[chunk.length - 1].id : null;

    return HttpResponse.json({
      papers: chunk,
      nextCursor,
      total: list.length,
    });
  }),

  // Mock 模式不访问外网：用本地样例模拟 arXiv 搜索结果，保持交互一致。
  http.get('/api/papers/arxiv-search', async ({ request }) => {
    await withDelay(500, 900);
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    const keyword = query.toLowerCase();
    const papers = db.papers
      .filter((paper) =>
        [paper.title, paper.abstract, paper.aiSummary, ...paper.tags]
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      )
      .slice(0, 12);
    return HttpResponse.json({
      papers,
      found: papers.length,
      inserted: 0,
      existing: papers.length,
    });
  }),

  http.get('/api/papers/:id', async ({ params }) => {
    await withDelay();
    const paper = db.papers.find((p) => p.id === params.id);
    if (!paper) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(paper);
  }),

  http.post('/api/papers/:id/fetch-content', async ({ params }) => {
    await withDelay(700, 1200);
    const paper = db.papers.find((p) => p.id === params.id);
    if (!paper) return new HttpResponse(null, { status: 404 });
    if (!paper.arxivId) {
      return HttpResponse.json(
        { message: '这篇论文没有 arXiv ID，无法自动获取正文' },
        { status: 400 }
      );
    }
    if (!paper.content) {
      paper.content = `<!-- inspire-arxiv-content:v2 -->\n\n## Abstract\n\n${paper.abstract}\n\n## Full text demo\n\nMock 模式不会访问 arXiv。切换到真实后端后，系统会在首次精读时从 arXiv 自动获取并缓存 HTML 正文。\n\n[在 arXiv 查看原文](${paper.externalUrl})`;
      paper.chapters = [
        { id: 'mock-abstract', title: 'Abstract', level: 1, anchor: 'abstract' },
        { id: 'mock-full-text', title: 'Full text demo', level: 1, anchor: 'full-text-demo' },
      ];
    } else if (!paper.content.startsWith('<!-- inspire-arxiv-content:v2 -->')) {
      paper.content = `<!-- inspire-arxiv-content:v2 -->\n\n${paper.content}`;
    }
    return HttpResponse.json(paper);
  }),

  http.patch('/api/papers/:id', async ({ params, request }) => {
    await withDelay();
    const body = (await request.json()) as { status?: PaperStatus };
    const paper = db.papers.find((p) => p.id === params.id);
    if (!paper) return new HttpResponse(null, { status: 404 });
    if (body.status) paper.status = body.status;
    return HttpResponse.json(paper);
  }),

  // ============ Bloggers ============
  http.get('/api/bloggers', async () => {
    await withDelay();
    return HttpResponse.json(db.bloggers);
  }),

  http.post('/api/bloggers', async ({ request }) => {
    await withDelay();
    const { query, platform } = (await request.json()) as {
      query: string;
      platform: 'xiaohongshu' | 'zhihu';
    };
    const blogger = {
      id: makeId('b'),
      name: query.trim() || '新博主',
      platform: platform || 'xiaohongshu',
      platformUserId: query.trim() || 'mock-' + Date.now(),
      recommendCount: 0,
      deepReadRatio: null,
      followedAt: new Date().toISOString(),
      crawlStatus: 'crawling' as const,
      crawlProgress: 0,
      crawlProgressLabel: '排队中...',
    };
    db.bloggers.push(blogger);

    // 后台异步"抓取"，逐步更新进度
    (async () => {
      for (let i = 10; i <= 100; i += 10) {
        await sleep(400);
        const b = db.bloggers.find((x) => x.id === blogger.id);
        if (!b) return;
        b.crawlProgress = i;
        if (i === 100) {
          b.crawlStatus = 'done';
          b.recommendCount = 2 + Math.floor(Math.random() * 5);
        }
      }
    })();

    return HttpResponse.json(blogger);
  }),

  http.delete('/api/bloggers/:id', async ({ params }) => {
    await withDelay();
    const idx = db.bloggers.findIndex((b) => b.id === params.id);
    if (idx >= 0) db.bloggers.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/bloggers/:id/crawl-progress', async ({ params }) => {
    await withDelay(60, 120);
    const b = db.bloggers.find((x) => x.id === params.id);
    if (!b) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({
      status: b.crawlStatus,
      progress: b.crawlProgress ?? 0,
      label: b.crawlProgressLabel,
    });
  }),

  // ============ Topics / Archive ============
  http.get('/api/topics', async () => {
    await withDelay();
    return HttpResponse.json(db.topics);
  }),

  http.post('/api/topics', async ({ request }) => {
    await withDelay();
    const { name, parentId } = (await request.json()) as {
      name: string;
      parentId: string | null;
    };
    const topic: Topic = {
      id: makeId('t'),
      name,
      parentId: parentId || null,
      paperCount: 0,
      createdAt: new Date().toISOString(),
    };
    db.topics.push(topic);
    return HttpResponse.json(topic);
  }),

  http.post('/api/archive', async ({ request }) => {
    await withDelay(200, 400);
    const { paperId, topicIds, summary } = (await request.json()) as {
      paperId: string;
      topicIds: string[];
      summary: string;
    };
    const entries = topicIds.map((topicId) => {
      const existing = db.archiveEntries.find(
        (entry) => entry.paperId === paperId && entry.topicId === topicId
      );
      if (existing) {
        existing.summary = summary;
        return existing;
      }
      const entry = {
        id: makeId('ae'),
        paperId,
        topicId,
        summary,
        createdAt: new Date().toISOString(),
      };
      db.archiveEntries.push(entry);
      // 更新目录 paperCount
      const t = db.topics.find((x) => x.id === topicId);
      if (t) t.paperCount += 1;
      return entry;
    });
    return HttpResponse.json(entries);
  }),

  http.get('/api/topics/:id/papers', async ({ params }) => {
    await withDelay();
    const topicId = params.id;
    const paperIds = db.archiveEntries
      .filter((e) => e.topicId === topicId)
      .map((e) => e.paperId);
    const uniquePaperIds = [...new Set(paperIds)];
    const rows = uniquePaperIds
      .map((pid) => {
        const p = db.papers.find((x) => x.id === pid);
        if (!p) return null;
        return {
          paperId: p.id,
          title: p.title,
          addedAt: p.addedAt,
          status: p.status,
        };
      })
      .filter(Boolean);
    return HttpResponse.json(rows);
  }),

  // ============ Ideas ============
  http.post('/api/ideas/generate', async ({ request }) => {
    await withDelay(600, 1200);
    const { paperIds, scenario, codeRef } = (await request.json()) as {
      paperIds: string[];
      scenario: string;
      codeRef?: string;
      anchorContents?: string[];
    };

    const papers = db.papers.filter((p) => paperIds.includes(p.id));
    const titles = papers.map((p) => p.title).join('、');

    const idea: Idea = {
      id: makeId('idea'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourcePaperIds: paperIds,
      scenario,
      codeRef,
      hypothesis: `结合 ${titles.slice(0, 40)}${titles.length > 40 ? '…' : ''} 中提出的思路，在你描述的"${scenario.slice(0, 30)}${scenario.length > 30 ? '…' : ''}"场景中，通过双路序列融合有望提升关键指标 2-4%。`,
      changes: `在 ${codeRef || '现有模型'} 的 encoder 上增加一条短期实时序列分支，与原长期分支通过门控网络融合。训练时先分别预训练两个分支，再联合微调。`,
      sourceCitation: papers[0]
        ? `${papers[0].title} §3.1 门控机制`
        : '综合已选论文',
      feasibility: 3,
      risk: '短期分支在冷启动场景下样本稀疏，需要合适的正则化避免过拟合；线上部署需评估门控网络的延迟开销。',
      status: 'draft',
      anchorIds: [],
    };
    db.ideas.push(idea);

    // 更新论文状态：作为灵感来源
    papers.forEach((p) => {
      if (p.status === 'archived' || p.status === 'done') {
        p.status = 'inspired';
      }
    });

    return HttpResponse.json(idea);
  }),

  http.patch('/api/ideas/:id', async ({ params, request }) => {
    await withDelay();
    const { status } = (await request.json()) as { status: Idea['status'] };
    const idea = db.ideas.find((x) => x.id === params.id);
    if (!idea) return new HttpResponse(null, { status: 404 });
    idea.status = status;
    idea.updatedAt = new Date().toISOString();
    if (status === 'confirmed') {
      idea.sourcePaperIds.forEach((pid) => {
        const p = db.papers.find((x) => x.id === pid);
        if (p) p.status = 'idea';
      });
    }
    return HttpResponse.json(idea);
  }),

  http.post('/api/ideas/:id/messages', async ({ params, request }) => {
    await withDelay(300, 700);
    const ideaId = params.id as string;
    const { content } = (await request.json()) as { content: string };
    const idea = db.ideas.find((x) => x.id === ideaId);
    if (!idea) return new HttpResponse(null, { status: 404 });

    const userMsg: ChatMessage = {
      id: makeId('msg'),
      ideaId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    db.chatMessages.push(userMsg);

    // 简单规则：如果消息中提到"<Nms"、"必须"、"不能"、"限制"、"约束"等词，提取为锚点
    const hasConstraint =
      /<\s*\d+\s*(ms|MS|毫秒|秒)|必须|不能|限制|约束|不超过|要\s*<|要小于/.test(
        content
      );
    let newAnchorId: string | null = null;
    if (hasConstraint) {
      const anchor = {
        id: makeId('anc'),
        ideaId,
        content: content.trim(),
        createdAt: new Date().toISOString(),
      };
      db.anchors.push(anchor);
      idea.anchorIds.push(anchor.id);
      newAnchorId = anchor.id;
    }

    const aiMsg: ChatMessage = {
      id: makeId('msg'),
      ideaId,
      role: 'ai',
      content: hasConstraint
        ? '已记录为锚点，后续 Idea 迭代会遵守该约束。你还有其他补充吗？'
        : '收到你的反馈。要不要我基于你的输入生成一个更聚焦的 Idea 版本？',
      createdAt: new Date().toISOString(),
      createdAnchorIds: newAnchorId ? [newAnchorId] : undefined,
    };
    db.chatMessages.push(aiMsg);

    return HttpResponse.json({
      message: aiMsg,
      anchor: newAnchorId
        ? db.anchors.find((a) => a.id === newAnchorId)
        : null,
    });
  }),

  http.get('/api/ideas/:id/messages', async ({ params }) => {
    await withDelay();
    const msgs = db.chatMessages.filter((m) => m.ideaId === params.id);
    return HttpResponse.json(msgs);
  }),

  // ============ Reader AI Cards ============
  http.get('/api/papers/:id/ai-cards', async ({ params }) => {
    await withDelay();
    const cards = db.aiCards.filter((c) => c.paperId === params.id);
    return HttpResponse.json(cards);
  }),

  http.post('/api/papers/:id/ai-cards/generate', async ({ params }) => {
    await withDelay(800, 1400);
    const paperId = params.id as string;
    const types: AICardType[] = [
      'motivation',
      'method',
      'experiments',
      'limitations',
      'transferable',
    ];
    const cards = types.map((type, order) => {
      const generated = getMockCardContent(type);
      const existing = db.aiCards.find(
        (card) => card.paperId === paperId && card.type === type
      );
      const card: AICard = {
        id: existing?.id || makeId('card'),
        paperId,
        type,
        title: generated.title,
        content: generated.content,
        order,
        updatedAt: new Date().toISOString(),
      };
      if (existing) Object.assign(existing, card);
      else db.aiCards.push(card);
      return card;
    });
    return HttpResponse.json(cards);
  }),

  http.post('/api/papers/:id/ai-cards/:type/stream', async ({ params }) => {
    const paperId = params.id as string;
    const type = params.type as AICardType;
    const content = getMockCardContent(type);
    // 保存到 db（结束后台）
    setTimeout(() => {
      const existing = db.aiCards.findIndex(
        (c) => c.paperId === paperId && c.type === type
      );
      const card: AICard = {
        id: existing >= 0 ? db.aiCards[existing].id : makeId('card'),
        paperId,
        type,
        title: content.title,
        content: content.content,
        order:
          existing >= 0
            ? db.aiCards[existing].order
            : db.aiCards.filter((c) => c.paperId === paperId).length,
        updatedAt: new Date().toISOString(),
      };
      if (existing >= 0) db.aiCards[existing] = card;
      else db.aiCards.push(card);
    }, 100);
    return streamText(content.content, 6, 30);
  }),

  http.patch('/api/papers/:id/ai-cards/order', async ({ request }) => {
    await withDelay();
    const { orderedIds } = (await request.json()) as { orderedIds: string[] };
    orderedIds.forEach((id, i) => {
      const c = db.aiCards.find((x) => x.id === id);
      if (c) c.order = i;
    });
    return new HttpResponse(null, { status: 204 });
  }),

  // ============ Reader Chat ============
  http.get('/api/papers/:id/chat', async ({ params }) => {
    await withDelay();
    const msgs = db.readerChat.filter((m) => m.paperId === params.id);
    return HttpResponse.json(msgs);
  }),

  http.post('/api/papers/:id/chat/stream', async ({ params, request }) => {
    const paperId = params.id as string;
    const { content, citedAnchor } = (await request.json()) as {
      content: string;
      citedAnchor?: string;
    };
    const reply = generateChatReply(content);
    // 保存用户消息 + AI 消息
    setTimeout(() => {
      db.readerChat.push({
        id: makeId('rmsg'),
        paperId,
        role: 'user',
        content,
        citedAnchor,
        createdAt: new Date().toISOString(),
      });
      db.readerChat.push({
        id: makeId('rmsg'),
        paperId,
        role: 'ai',
        content: reply,
        createdAt: new Date().toISOString(),
      });
    }, 100);
    return streamText(reply, 8, 35);
  }),

  // ============ 归档 AI 辅助 ============
  http.get(
    '/api/papers/:id/archive-recommendations',
    async ({ params }) => {
      await withDelay(200, 500);
      const paperId = params.id as string;
      const paper = db.papers.find((p) => p.id === paperId);
      if (!paper) return HttpResponse.json([]);
      // Mock 策略：按 tag/domain 匹配目录，取前 3 个
      const candidates = db.topics
        .filter((t) => {
          const hasChildren = db.topics.some((c) => c.parentId === t.id);
          if (hasChildren) return false; // 只推荐叶子
          return (
            paper.tags.some((tag) => t.name.includes(tag)) ||
            t.name.includes(paper.domain)
          );
        })
        .slice(0, 3)
        .map((t, i) => ({
          topicId: t.id,
          score: 0.9 - i * 0.15,
          reason: `与论文的 "${paper.tags[0] || paper.domain}" 主题高度相关`,
        }));
      return HttpResponse.json(candidates);
    }
  ),

  http.post('/api/archive/summary/stream', async ({ request }) => {
    const { paperId, topicId } = (await request.json()) as {
      paperId: string;
      topicId: string;
    };
    const paper = db.papers.find((p) => p.id === paperId);
    const topic = db.topics.find((t) => t.id === topicId);
    const summary =
      `这篇论文《${paper?.title || '未知'}》的核心思路——${paper?.aiSummary || ''}` +
      `——与「${topic?.name || '当前目录'}」下已有的工作在方法层面存在直接关联。` +
      `建议关注该论文的三个可迁移点：1) 双路编码器的独立预训练策略；` +
      `2) 门控网络的稀疏化设计；3) 冷启动场景的置信度阈值机制。可作为该方向的重要参考。`;
    return streamText(summary, 6, 30);
  }),

  http.delete('/api/anchors/:id', async ({ params }) => {
    await withDelay();
    const idx = db.anchors.findIndex((a) => a.id === params.id);
    if (idx >= 0) {
      const anchor = db.anchors[idx];
      const idea = db.ideas.find((x) => x.id === anchor.ideaId);
      if (idea) {
        idea.anchorIds = idea.anchorIds.filter((aid) => aid !== anchor.id);
      }
      db.anchors.splice(idx, 1);
    }
    return new HttpResponse(null, { status: 204 });
  }),
];
