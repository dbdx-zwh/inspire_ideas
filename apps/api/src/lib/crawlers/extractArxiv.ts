/**
 * 从任意文本中抽取 arXiv 论文引用
 * ----------------------------------------
 * 降级方案（无 LLM）：正则匹配
 * - arxiv.org URL 形式
 * - 裸的 arxivId 形式（YYMM.NNNNN 或 YYMM.NNNN）
 */

/**
 * 匹配 arxivId 的规则：
 * - 4 位数字（YYMM）+ 点 + 4-5 位数字
 * - 可选版本号 vN
 *
 * 例如：
 *  - 2408.12345
 *  - 2408.12345v2
 *  - arxiv:2408.12345
 *  - https://arxiv.org/abs/2408.12345
 *  - arxiv.org/pdf/2408.12345v1.pdf
 */
const ARXIV_ID_RE = /\b(\d{4}\.\d{4,5})(v\d+)?\b/g;
const ARXIV_URL_RE = /https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?/gi;

/** 从文本抽取所有可能的 arxivId（去重、去版本号） */
export function extractArxivIds(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();

  // 先匹 URL
  let m: RegExpExecArray | null;
  ARXIV_URL_RE.lastIndex = 0;
  while ((m = ARXIV_URL_RE.exec(text)) !== null) {
    found.add(m[1]);
  }

  // 再匹裸 ID（可能有误报，比如日期 2024.0812 但概率较小）
  ARXIV_ID_RE.lastIndex = 0;
  while ((m = ARXIV_ID_RE.exec(text)) !== null) {
    const id = m[1];
    // 简单过滤：arxivId 的前 4 位应该是 YYMM 形式
    // YY 通常在 07-30 之间（2007 年至今），MM 在 01-12
    const yy = parseInt(id.slice(0, 2), 10);
    const mm = parseInt(id.slice(2, 4), 10);
    if (yy >= 7 && yy <= 30 && mm >= 1 && mm <= 12) {
      found.add(id);
    }
  }

  return Array.from(found);
}
