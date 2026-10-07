export interface PaperDocument {
  title: string;
  abstract: string;
  content?: string | null;
}

interface Section {
  title: string;
  body: string;
  level: number;
}

const CARD_SECTION_HINTS: Record<string, string[]> = {
  motivation: [
    'abstract', 'introduction', 'background', 'motivation', 'problem statement',
    'problem formulation', 'related work', 'overview', '摘要', '引言', '背景',
    '动机', '问题定义', '相关工作',
  ],
  method: [
    'method', 'methodology', 'approach', 'proposed model', 'model architecture',
    'architecture', 'algorithm', 'framework', 'training', 'implementation',
    '方法', '模型', '架构', '算法', '框架', '训练', '实现',
  ],
  experiments: [
    'experiment', 'experimental setup', 'evaluation', 'result', 'dataset',
    'benchmark', 'ablation', 'analysis', '实验', '评估', '结果', '数据集',
    '基准', '消融', '分析',
  ],
  limitations: [
    'limitation', 'discussion', 'conclusion', 'future work', 'threat to validity',
    '局限', '限制', '讨论', '结论', '未来工作', '展望',
  ],
  transferable: [
    'method', 'methodology', 'approach', 'architecture', 'framework', 'discussion',
    'conclusion', 'application', 'implication', '方法', '架构', '框架', '讨论',
    '结论', '应用', '启示',
  ],
};

const CARD_LABELS: Record<string, string> = {
  motivation: 'Motivation / Introduction',
  method: 'Method / Approach',
  experiments: 'Experiments / Evaluation',
  limitations: 'Limitations / Discussion',
  transferable: 'Method / Discussion / Conclusion',
};

export function selectContextForCard(
  paper: PaperDocument,
  type: string,
  maxChars = 32_000
): string {
  const sections = parseSections(paper.content || '');
  const hints = CARD_SECTION_HINTS[type] || [];
  const headingMatches = sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => matchesHeading(section.title, hints));

  // 标题命中优先，并把该标题下面的子章节一并纳入。这样 “3 Method”
  // 能携带 “3.1 Encoder / 3.2 Training”，又不会越界到 “4 Experiments”。
  const selectedIndexes = new Set<number>();
  for (const match of headingMatches) {
    selectedIndexes.add(match.index);
    for (let index = match.index + 1; index < sections.length; index += 1) {
      if (sections[index].level <= match.section.level) break;
      selectedIndexes.add(index);
    }
  }

  // 只有完全找不到相符标题时才按正文关键词回退；绝不再用无关章节凑数量。
  if (selectedIndexes.size === 0) {
    sections
      .map((section, index) => ({
        index,
        score: scoreText(section.body.slice(0, 1600), hints),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 4)
      .forEach((item) => selectedIndexes.add(item.index));
  }

  const includeAbstract = type === 'motivation';
  const chosen = sections.filter((section, index) => {
    if (!selectedIndexes.has(index)) return false;
    // Motivation 已经使用数据库中的原始摘要，避免正文里的 Abstract 重复占用上下文。
    return !(includeAbstract && matchesHeading(section.title, ['abstract', '摘要']));
  });
  const missingMessage = chosen.length === 0
    ? `未检索到与「${CARD_LABELS[type] || type}」明确匹配的章节。不得用其他章节替代。`
    : undefined;

  return joinWithinLimit(paper, chosen, maxChars, includeAbstract, missingMessage);
}

export function selectContextForQuestion(
  paper: PaperDocument,
  question: string,
  citedText?: string,
  maxChars = 45_000
): string {
  const sections = parseSections(paper.content || '');
  const queryTerms = expandQuestionTerms(question);
  const ranked = sections
    .map((section, index) => ({
      section,
      index,
      score: scoreText(`${section.title}\n${section.body}`, queryTerms),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const relevant = ranked.filter((item) => item.score > 0);
  // “总结全文”这类泛问题通常匹配不到英文正文关键词，此时按原始顺序提供
  // 尽可能完整的正文；具体技术问题则只取最相关章节，减少噪声。
  const chosen = (relevant.length > 0 ? relevant.slice(0, 8) : ranked)
    .sort((a, b) => a.index - b.index);

  const cited = citedText?.trim()
    ? `\n\n## 用户引用的原文段落\n${citedText.trim().slice(0, 10_000)}`
    : '';
  return `${joinWithinLimit(
    paper,
    chosen.map((item) => item.section),
    maxChars - cited.length,
    true
  )}${cited}`;
}

/**
 * 为一次性五卡总结准备长上下文：覆盖论文主文并保留实验表格，去掉参考文献、
 * 致谢、图片 URL 和缓存标记等对总结无帮助但会显著拖慢生成的内容。
 */
export function selectContextForAllCards(
  paper: PaperDocument,
  maxChars = 60_000
): string {
  const cleanedContent = (paper.content || '')
    .replace(/^<!--\s*inspire-arxiv-content:v\d+\s*-->\s*/i, '')
    .replace(/!\[[^\]]*]\([^\n)]+\)/g, '')
    .replace(/\n{4,}/g, '\n\n\n');
  const sections = parseSections(cleanedContent).filter((section) => {
    const title = section.title
      .toLowerCase()
      .replace(/^\s*(?:section\s+)?\d+(?:\.\d+)*[.):\-\s]+/i, '')
      .trim();
    if (/^(?:(?:references?|bibliography)(?![a-z])|参考文献)/i.test(title)) {
      return false;
    }
    if (/^(?:(?:acknowledgements?)(?![a-z])|致谢)/i.test(title)) {
      return false;
    }
    // 数据库 abstract 会作为稳定的元数据单独加入，避免重复占用上下文。
    return !/^(?:(?:abstract)(?![a-z])|摘要)/i.test(title);
  });

  return joinWithinLimit(paper, sections, maxChars, true);
}

/**
 * 为跨论文 Idea 生成挑选上下文。每篇论文都覆盖核心方法、实验依据、限制/结论，
 * 再补充与业务场景关键词最相关的章节，避免简单截取论文开头而漏掉可迁移证据。
 */
export function selectContextForIdea(
  paper: PaperDocument,
  scenario: string,
  maxChars = 30_000
): string {
  const cleanedContent = (paper.content || '')
    .replace(/^<!--\s*inspire-arxiv-content:v\d+\s*-->\s*/i, '')
    .replace(/!\[[^\]]*]\([^\n)]+\)/g, '')
    .replace(/\n{4,}/g, '\n\n\n');
  const sections = parseSections(cleanedContent).filter((section) => {
    const title = normalizeHeading(section.title);
    return !/^(?:(?:references?|bibliography)(?![a-z])|参考文献)/i.test(title) &&
      !/^(?:(?:acknowledgements?)(?![a-z])|致谢)/i.test(title) &&
      !/^(?:(?:abstract)(?![a-z])|摘要)/i.test(title);
  });

  const selectedIndexes: number[] = [];
  const selectedSet = new Set<number>();
  const addIndex = (index: number) => {
    if (index < 0 || index >= sections.length || selectedSet.has(index)) return;
    selectedSet.add(index);
    selectedIndexes.push(index);
  };
  const addByHeading = (hints: string[], limit: number) => {
    let added = 0;
    sections.forEach((section, index) => {
      if (added >= limit || !matchesHeading(section.title, hints)) return;
      addIndex(index);
      added += 1;
    });
  };

  // 先保证“方法 → 实验证据 → 限制/结论 → 问题背景”的最小覆盖。
  addByHeading(CARD_SECTION_HINTS.method, 3);
  addByHeading(CARD_SECTION_HINTS.experiments, 3);
  addByHeading(CARD_SECTION_HINTS.limitations, 2);
  addByHeading(CARD_SECTION_HINTS.motivation, 1);

  const scenarioTerms = expandQuestionTerms(scenario);
  sections
    .map((section, index) => ({
      index,
      score: scoreText(`${section.title}\n${section.body}`, scenarioTerms),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 5)
    .forEach((item) => addIndex(item.index));

  // 标题不规范时仍提供正文，而不是只发送摘要。
  if (selectedIndexes.length === 0) {
    sections.slice(0, 8).forEach((_section, index) => addIndex(index));
  }

  const reservedChars = paper.title.length + paper.abstract.length +
    selectedIndexes.length * 90 + 120;
  const bodyCharsPerSection = Math.max(
    240,
    Math.min(
      3_000,
      Math.floor((maxChars - reservedChars) / Math.max(selectedIndexes.length, 1))
    )
  );

  return joinWithinLimit(
    paper,
    selectedIndexes.map((index) => ({
      ...sections[index],
      // 多论文组合时为每类证据都保留空间，避免一个超长 Method 小节
      // 挤掉 Experiments / Limitations。
      body: sections[index].body.slice(0, bodyCharsPerSection),
    })),
    maxChars,
    true
  );
}

function expandQuestionTerms(question: string): string[] {
  const terms = tokenize(question);
  const conceptMappings: Array<{ pattern: RegExp; terms: string[] }> = [
    {
      pattern: /方法|模型|架构|算法|训练|推理|流程|创新|method|approach|architecture|algorithm/i,
      terms: [
        'method', 'approach', 'model', 'architecture', 'algorithm', 'framework',
        'system design', 'training', 'inference', 'pipeline', 'contribution',
      ],
    },
    {
      pattern: /实验|结果|效果|指标|数据集|基线|消融|experiment|result|evaluation|dataset|metric/i,
      terms: [
        'experiment', 'evaluation', 'result', 'dataset', 'metric', 'baseline',
        'ablation', 'offline', 'online',
      ],
    },
    {
      pattern: /动机|背景|问题|目标|为什么|motivation|background|problem|challenge/i,
      terms: [
        'abstract', 'introduction', 'background', 'motivation', 'problem',
        'challenge', 'objective',
      ],
    },
    {
      pattern: /局限|限制|不足|缺点|未来|limitation|weakness|future/i,
      terms: ['limitation', 'discussion', 'conclusion', 'future work', 'failure'],
    },
    {
      pattern: /总结|概括|主要内容|核心内容|贡献|summary|summarize|overview/i,
      terms: [
        'abstract', 'introduction', 'contribution', 'method', 'system design',
        'experiment', 'result', 'conclusion',
      ],
    },
  ];
  for (const mapping of conceptMappings) {
    if (mapping.pattern.test(question)) terms.push(...mapping.terms);
  }
  return [...new Set(terms)].slice(0, 120);
}

function parseSections(markdown: string): Section[] {
  if (!markdown.trim()) return [];
  const matches = [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)];
  if (matches.length === 0) {
    return splitLongSection({ title: '正文', body: markdown, level: 1 });
  }

  const sections: Section[] = [];
  const preface = markdown.slice(0, matches[0].index).trim();
  if (preface) {
    sections.push(...splitLongSection({ title: '前言', body: preface, level: 1 }));
  }
  matches.forEach((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    const body = markdown.slice(start, end).trim();
    sections.push(...splitLongSection({
      title: match[1].replace(/\s+/g, ' ').trim(),
      body,
      level: match[0].match(/^#+/)?.[0].length || 1,
    }));
  });
  return sections;
}

function splitLongSection(section: Section, chunkSize = 6500): Section[] {
  if (section.body.length <= chunkSize) return [section];
  const chunks: Section[] = [];
  for (let offset = 0; offset < section.body.length; offset += chunkSize) {
    chunks.push({
      title: `${section.title}（${Math.floor(offset / chunkSize) + 1}）`,
      body: section.body.slice(offset, offset + chunkSize),
      level: section.level,
    });
  }
  return chunks;
}

function joinWithinLimit(
  paper: PaperDocument,
  sections: Section[],
  maxChars: number,
  includeAbstract: boolean,
  missingMessage?: string
): string {
  let result = `# ${paper.title}`;
  if (includeAbstract && paper.abstract.trim()) {
    result += `\n\n## Abstract\n${paper.abstract}`;
  }
  if (missingMessage) {
    result += `\n\n## 章节检索结果\n${missingMessage}`;
  }
  for (const section of sections) {
    const block = `\n\n## ${section.title}\n${section.body}`;
    if (result.length + block.length > maxChars) {
      const remaining = maxChars - result.length;
      if (remaining > 500) result += block.slice(0, remaining);
      break;
    }
    result += block;
  }
  return result;
}

function matchesHeading(title: string, hints: string[]): boolean {
  const normalized = normalizeHeading(title)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return hints.some((hint) => normalized.includes(hint));
}

function normalizeHeading(title: string): string {
  return title
    .toLowerCase()
    .replace(/^\s*(?:section\s+)?\d+(?:\.\d+)*[.):\-\s]+/i, '')
    .trim();
}

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const latin = normalized.match(/[a-z0-9][a-z0-9_-]{2,}/g) || [];
  const chineseRuns = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const chinese = chineseRuns.flatMap((run) => {
    const grams: string[] = [];
    for (let i = 0; i < run.length - 1; i += 1) grams.push(run.slice(i, i + 2));
    return grams;
  });
  return [...new Set([...latin, ...chinese])].slice(0, 80);
}

function scoreText(text: string, terms: string[]): number {
  const normalized = text.toLowerCase();
  return terms.reduce((score, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = normalized.match(new RegExp(escaped, 'g'));
    return score + Math.min(matches?.length || 0, 8);
  }, 0);
}
