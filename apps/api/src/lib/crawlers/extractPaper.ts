/**
 * 从帖子文本抽取论文引用
 * ----------------------------------------
 * 三种来源（召回从高到低）：
 *   a) 直接的 arxiv URL / arxivId
 *   b) 括号/引号包裹的英文短语
 *   c) "mostly English" 的长句子（很多博主不带括号直接抄论文标题）
 *   d) "paper: XXX"、"论文：XXX" 等前缀
 *
 * 未来接入 LLM 后可以整体替换实现，用 LLM 直接输出结构化 { arxivIds, titles }。
 */

import { extractArxivIds } from './extractArxiv.js';

export interface PaperCandidates {
  arxivIds: string[];
  titles: string[];
}

// 括号内匹配
const BRACKET_PATTERNS: RegExp[] = [
  /《([^》]+)》/g,
  /【([^】]+)】/g,
  /\[([^\]]{10,150})\]/g,
  /"([^"]+)"/g,
  /'([^']+)'/g,
  /"([^"]{10,150})"/g,
];

// 前缀模式："paper: XXX"、"论文：XXX"
const PREFIX_PATTERNS: RegExp[] = [
  /(?:paper|Paper|PAPER|arxiv|arXiv|ArXiv)\s*[:：]\s*([A-Za-z][A-Za-z0-9\s\-:,.'']{10,150})/g,
  /(?:论文|文章|工作|研究|题目|标题)\s*[:：]\s*([A-Za-z][A-Za-z0-9\s\-:,.'']{10,150})/g,
  /(?:titled?|titled)\s+["']?([A-Za-z][A-Za-z0-9\s\-:,.'']{10,150})/gi,
];

/** 从任意文本抽取论文引用 */
export function extractPaperCandidates(text: string): PaperCandidates {
  if (!text) return { arxivIds: [], titles: [] };

  const arxivIds = extractArxivIds(text);
  const titleCandidates = new Set<string>();

  // 1) 括号内的候选
  for (const pattern of BRACKET_PATTERNS) {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(text)) !== null) {
      const raw = m[1].trim();
      if (isLikelyPaperTitle(raw)) titleCandidates.add(raw);
    }
  }

  // 2) 前缀模式的候选
  for (const pattern of PREFIX_PATTERNS) {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(text)) !== null) {
      const raw = m[1].trim();
      if (isLikelyPaperTitle(raw)) titleCandidates.add(raw);
    }
  }

  // 3) 无括号的"纯英文长短语"（关键！博主不带括号直接抄标题的场景）
  const bareEnglishPhrases = extractBareEnglishPhrases(text);
  for (const phrase of bareEnglishPhrases) {
    if (isLikelyPaperTitle(phrase)) titleCandidates.add(phrase);
  }

  return {
    arxivIds,
    titles: Array.from(titleCandidates),
  };
}

/**
 * 按中文标点/换行切分文本，找出"几乎全英文"的段落
 * 处理博主直接抄英文论文标题、没有括号包裹的情况
 */
function extractBareEnglishPhrases(text: string): string[] {
  // 中文标点 + 换行作为分隔符
  const segments = text.split(/[\n。，、；！？…\r（）()]/);
  const results: string[] = [];
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (trimmed.length < 20) continue;

    // 从每段里找连续的英文串（可包含数字/常见标题符号）
    const matches = trimmed.match(/[A-Z][A-Za-z0-9\-:,.\s'']{15,200}/g) || [];
    for (const m of matches) {
      const clean = m.trim();
      results.push(clean);
    }
  }
  return results;
}

/**
 * 启发式：是否像论文标题
 * - 长度 10-200
 * - 至少 3 个英文单词
 * - 中文字符数 <= 英文单词数
 * - 若已经在候选里的过短子串会被过滤（避免同一句被切成多份）
 */
function isLikelyPaperTitle(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length < 10 || trimmed.length > 200) return false;

  const englishWords = trimmed.match(/[A-Za-z][A-Za-z-]{2,}/g) || [];
  if (englishWords.length < 3) return false;

  const chineseChars = trimmed.match(/[一-鿿]/g) || [];
  if (chineseChars.length > englishWords.length) return false;

  return true;
}

/** Jaccard 相似度（0-1） */
export function titleSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2)
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  setA.forEach((t) => {
    if (setB.has(t)) intersection++;
  });
  return intersection / new Set([...setA, ...setB]).size;
}
