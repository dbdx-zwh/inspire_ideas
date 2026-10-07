/**
 * arXiv API 抓取器
 * ----------------------------------------
 * - 直连 https://export.arxiv.org/api/query（Atom XML 格式）
 * - 无需 LLM，使用降级方案生成 aiSummary / tags / difficulty / readingMinutes
 * - 未来接入 LLM 时，只需替换 buildPaperFallback 里的字段生成逻辑
 */

import { XMLParser } from 'fast-xml-parser';

const ARXIV_ENDPOINT =
  process.env.ARXIV_ENDPOINT || 'https://export.arxiv.org/api/query';
const ARXIV_USER_AGENT =
  process.env.ARXIV_USER_AGENT || 'InspireIdeas/0.2 (arXiv reader)';
const configuredTimeout = Number(process.env.ARXIV_API_TIMEOUT_MS || 20_000);
const ARXIV_TIMEOUT_MS =
  Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 20_000;

export interface ArxivPaper {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  publishedAt: string;
  externalUrl: string;
  categories: string[];
  primaryCategory: string;
}

interface AtomEntry {
  id: string;
  title: string;
  summary: string;
  published: string;
  updated: string;
  author: { name: string } | { name: string }[];
  category:
    | { '@_term': string }
    | { '@_term': string }[];
  'arxiv:primary_category'?: { '@_term': string };
  link?:
    | { '@_href': string; '@_rel'?: string; '@_type'?: string }
    | { '@_href': string; '@_rel'?: string; '@_type'?: string }[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

/** 解析 Atom XML 为标准 Paper 对象 */
function parseAtom(xml: string): ArxivPaper[] {
  const obj = parser.parse(xml);
  const feed = obj?.feed;
  if (!feed) return [];
  const entries: AtomEntry[] = Array.isArray(feed.entry)
    ? feed.entry
    : feed.entry
    ? [feed.entry]
    : [];

  return entries.map((e) => {
    // id 形如 http://arxiv.org/abs/2408.12345v1 → 抽 arxivId
    const idMatch = e.id.match(/arxiv\.org\/abs\/([\d.]+(?:v\d+)?)/);
    const arxivId = (idMatch?.[1] || '').replace(/v\d+$/, ''); // 去掉版本号

    const authors = Array.isArray(e.author)
      ? e.author.map((a) => a.name)
      : e.author
      ? [e.author.name]
      : [];

    const categories = Array.isArray(e.category)
      ? e.category.map((c) => c['@_term'])
      : e.category
      ? [e.category['@_term']]
      : [];

    const primaryCategory =
      e['arxiv:primary_category']?.['@_term'] || categories[0] || 'cs.AI';

    // 找 HTML 页面链接（不是 PDF）
    const links = Array.isArray(e.link) ? e.link : e.link ? [e.link] : [];
    const htmlLink =
      links.find((l) => l['@_type'] === 'text/html')?.['@_href'] ||
      `https://arxiv.org/abs/${arxivId}`;

    return {
      arxivId,
      title: (e.title || '').trim().replace(/\s+/g, ' '),
      authors,
      abstract: (e.summary || '').trim().replace(/\s+/g, ' '),
      publishedAt: e.published || new Date().toISOString(),
      externalUrl: htmlLink,
      categories,
      primaryCategory,
    };
  });
}

/** 从 arXiv 抓取论文 */
async function fetchArxiv(
  searchQuery: string,
  maxResults = 30,
  sortBy: 'submittedDate' | 'relevance' = 'submittedDate'
): Promise<ArxivPaper[]> {
  const url = new URL(ARXIV_ENDPOINT);
  url.searchParams.set('search_query', searchQuery);
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', String(maxResults));
  url.searchParams.set('sortBy', sortBy);
  url.searchParams.set('sortOrder', 'descending');

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': ARXIV_USER_AGENT,
    },
    signal: AbortSignal.timeout(ARXIV_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`arXiv API error: HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseAtom(xml);
}

/**
 * 用户在发现页主动搜索 arXiv。
 * 支持关键词、论文标题、arXiv ID 以及 arxiv.org/abs/... 链接。
 */
export async function searchArxivPapers(
  rawQuery: string,
  maxResults = 12
): Promise<ArxivPaper[]> {
  const query = rawQuery.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!query) return [];

  // ID / 链接搜索走 id_list，结果比全文检索更准确。
  const idMatch = query.match(
    /(?:arxiv:\s*|arxiv\.org\/(?:abs|html)\/)?(\d{4}\.\d{4,5})(?:v\d+)?/i
  );
  if (idMatch) {
    return fetchPapersByArxivIds([idMatch[1]]);
  }

  // 不把用户输入直接拼进 arXiv 查询语法，避免冒号、括号等字符改变查询含义。
  // 每个词都在全部元数据中搜索，多个词按 AND 组合并按相关性排序。
  const terms = query
    .normalize('NFKC')
    .match(/[\p{L}\p{N}][\p{L}\p{N}._-]*/gu)
    ?.slice(0, 12);
  if (!terms?.length) return [];

  const searchQuery = terms
    .map((term) => `all:"${term.replace(/["\\]/g, '')}"`)
    .join(' AND ');
  const papers = await fetchArxiv(
    searchQuery,
    Math.min(Math.max(maxResults, 1), 20),
    'relevance'
  );
  return papers.filter((paper) => paper.arxivId);
}

/**
 * 按标题在 arXiv 搜索论文
 * 返回前 N 个候选，供上层做相似度匹配
 */
export async function searchArxivByTitle(
  title: string,
  maxResults = 3
): Promise<ArxivPaper[]> {
  // 清理查询字符串
  const cleaned = title
    .replace(/[^\w\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 5) return [];

  const url = new URL(ARXIV_ENDPOINT);
  // 用 ti: 前缀限定在标题字段搜索
  url.searchParams.set('search_query', `ti:"${cleaned}"`);
  url.searchParams.set('max_results', String(maxResults));

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': ARXIV_USER_AGENT,
      },
      signal: AbortSignal.timeout(ARXIV_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseAtom(xml);
  } catch {
    return [];
  }
}

/** 按 arxivId 批量拉取论文详情（用于从博主帖子里抽到 arxivId 后回填元数据） */
export async function fetchPapersByArxivIds(
  arxivIds: string[]
): Promise<ArxivPaper[]> {
  if (arxivIds.length === 0) return [];
  const idList = arxivIds.join(',');
  const url = new URL(ARXIV_ENDPOINT);
  url.searchParams.set('id_list', idList);
  url.searchParams.set('max_results', String(arxivIds.length));

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': ARXIV_USER_AGENT,
    },
    signal: AbortSignal.timeout(ARXIV_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`arXiv API error: HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseAtom(xml);
}

/** 主入口：分批抓取（优先推荐系统） */
export async function fetchLatestPapers(): Promise<ArxivPaper[]> {
  // 批次 1：推荐系统相关（cs.IR + keyword 兜底）
  const recsysQuery =
    'cat:cs.IR OR (abs:"recommender system" OR abs:"recommendation system" OR abs:"sequential recommendation")';
  // 批次 2：其他核心分类
  const generalQuery = 'cat:cs.LG OR cat:cs.CL OR cat:cs.CV OR cat:cs.AI';

  const [recsys, general] = await Promise.all([
    fetchArxiv(recsysQuery, 30).catch((e) => {
      console.error('[arXiv] recsys fetch failed:', e);
      return [] as ArxivPaper[];
    }),
    fetchArxiv(generalQuery, 25).catch((e) => {
      console.error('[arXiv] general fetch failed:', e);
      return [] as ArxivPaper[];
    }),
  ]);

  // 合并 + 去重
  const seen = new Set<string>();
  const merged: ArxivPaper[] = [];
  for (const p of [...recsys, ...general]) {
    if (!p.arxivId || seen.has(p.arxivId)) continue;
    seen.add(p.arxivId);
    merged.push(p);
  }
  return merged.slice(0, 50);
}

/** ============ 降级方案：无 LLM 生成派生字段 ============ */

interface DomainMeta {
  domain: string;
  tags: string[];
}

/** arXiv 分类 → 中文领域 + 标签映射 */
const CATEGORY_MAP: Record<string, DomainMeta> = {
  'cs.IR': { domain: '推荐系统', tags: ['推荐系统', '信息检索'] },
  'cs.LG': { domain: '大模型', tags: ['机器学习', '深度学习'] },
  'cs.CL': { domain: '大模型', tags: ['LLM', '自然语言处理'] },
  'cs.CV': { domain: '计算机视觉', tags: ['计算机视觉'] },
  'cs.AI': { domain: '人工智能', tags: ['人工智能'] },
  'cs.NE': { domain: '大模型', tags: ['神经网络'] },
  'cs.RO': { domain: '机器人', tags: ['机器人'] },
  'stat.ML': { domain: '大模型', tags: ['机器学习', '统计学习'] },
};

function deriveDomainAndTags(
  primaryCategory: string,
  allCategories: string[],
  title: string,
  abstract: string
): DomainMeta {
  const base = CATEGORY_MAP[primaryCategory] || {
    domain: '人工智能',
    tags: [primaryCategory],
  };

  const tagSet = new Set(base.tags);

  // 副分类的标签也加进去
  for (const cat of allCategories.slice(0, 3)) {
    const m = CATEGORY_MAP[cat];
    if (m) m.tags.forEach((t) => tagSet.add(t));
  }

  // 从 title/abstract 关键词补 tags
  const text = (title + ' ' + abstract).toLowerCase();
  const keywordMap: Record<string, string> = {
    recommend: '推荐系统',
    'sequential recommendation': '序列建模',
    'cold start': '冷启动',
    'multi-task': '多目标学习',
    'multi-objective': '多目标学习',
    llm: 'LLM',
    'large language model': 'LLM',
    'long context': '长文本',
    moe: 'MoE',
    'mixture of experts': 'MoE',
    'attention mechanism': '注意力机制',
    transformer: 'Transformer',
    rlhf: 'RLHF',
    finetune: '微调',
    lora: 'LoRA',
    diffusion: '扩散模型',
  };
  for (const [kw, tag] of Object.entries(keywordMap)) {
    if (text.includes(kw)) tagSet.add(tag);
  }

  // 最多保留 4 个 tag，避免爆
  return {
    domain: base.domain,
    tags: Array.from(tagSet).slice(0, 4),
  };
}

/** 阅读时长估算：abstract 长度 * 系数（假设正文是 abstract 的 10-15 倍） */
function estimateReadingMinutes(abstract: string): number {
  const words = abstract.split(/\s+/).length;
  const estimatedFullWords = words * 12;
  const minutes = Math.round(estimatedFullWords / 220); // 220 词/分钟
  return Math.max(8, Math.min(35, minutes));
}

/** 生成一句话摘要（截断 abstract） */
function truncateForSummary(abstract: string, maxChars = 120): string {
  const cleaned = abstract.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  // 在句号处截断
  const truncated = cleaned.slice(0, maxChars);
  const lastDot = truncated.lastIndexOf('.');
  if (lastDot > maxChars * 0.6) return truncated.slice(0, lastDot + 1);
  return truncated + '…';
}

/** 把 arXiv 论文对象转换为可入库的 Paper 数据（含降级字段） */
export function buildPaperFallback(a: ArxivPaper, userId: string) {
  const { domain, tags } = deriveDomainAndTags(
    a.primaryCategory,
    a.categories,
    a.title,
    a.abstract
  );

  return {
    userId,
    title: a.title,
    authors: a.authors,
    arxivId: a.arxivId,
    externalUrl: a.externalUrl,
    source: 'arxiv',
    bloggerIds: [],
    abstract: a.abstract,
    aiSummary: truncateForSummary(a.abstract),
    tags,
    domain,
    publishedAt: new Date(a.publishedAt),
    readingMinutes: estimateReadingMinutes(a.abstract),
    difficulty: 'medium',
    status: 'unread',
  };
}
