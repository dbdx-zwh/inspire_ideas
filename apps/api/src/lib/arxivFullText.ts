import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import type { AnyNode } from 'domhandler';

const ARXIV_ORIGIN = 'https://arxiv.org';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_HTML_BYTES = 15 * 1024 * 1024;
export const ARXIV_CONTENT_FORMAT_MARKER = '<!-- inspire-arxiv-content:v2 -->';
const USER_AGENT =
  process.env.ARXIV_USER_AGENT || 'InspireIdeas/0.2 (arXiv reader)';

export interface ArxivChapter {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  anchor: string;
}

export interface ArxivFullText {
  content: string;
  chapters: ArxivChapter[];
  sourceUrl: string;
}

export class ArxivContentError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'ARXIV_HTML_UNAVAILABLE'
      | 'ARXIV_RATE_LIMITED'
      | 'ARXIV_FETCH_FAILED'
      | 'ARXIV_PARSE_FAILED'
  ) {
    super(message);
    this.name = 'ArxivContentError';
  }
}

const inFlight = new Map<string, Promise<ArxivFullText>>();

/**
 * 从 arXiv 官方 HTML 阅读版抓取正文，并转换为阅读器使用的 Markdown。
 * 同一个 arxivId 的并发请求会合并，避免用户重复点击造成重复抓取。
 */
export function fetchArxivFullText(arxivId: string): Promise<ArxivFullText> {
  const normalizedId = normalizeArxivId(arxivId);
  const existing = inFlight.get(normalizedId);
  if (existing) return existing;

  const task = fetchAndParse(normalizedId).finally(() => {
    inFlight.delete(normalizedId);
  });
  inFlight.set(normalizedId, task);
  return task;
}

async function fetchAndParse(arxivId: string): Promise<ArxivFullText> {
  const sourceUrl = `${ARXIV_ORIGIN}/html/${encodeURIComponent(arxivId)}`;
  const timeoutMs = Number(process.env.ARXIV_FETCH_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': USER_AGENT,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ArxivContentError(
      `连接 arXiv 失败：${message}`,
      'ARXIV_FETCH_FAILED'
    );
  }

  if (response.status === 404) {
    throw new ArxivContentError(
      'arXiv 暂未提供这篇论文的 HTML 正文，请通过原文链接阅读 PDF。',
      'ARXIV_HTML_UNAVAILABLE'
    );
  }
  if (response.status === 429) {
    throw new ArxivContentError(
      'arXiv 请求过于频繁，请稍后重试。',
      'ARXIV_RATE_LIMITED'
    );
  }
  if (!response.ok) {
    throw new ArxivContentError(
      `arXiv 正文请求失败（HTTP ${response.status}）。`,
      'ARXIV_FETCH_FAILED'
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new ArxivContentError(
      'arXiv 返回的不是 HTML 正文。',
      'ARXIV_HTML_UNAVAILABLE'
    );
  }

  const declaredSize = Number(response.headers.get('content-length'));
  if (declaredSize && declaredSize > MAX_HTML_BYTES) {
    throw new ArxivContentError(
      '论文正文过大，暂时无法自动导入。',
      'ARXIV_PARSE_FAILED'
    );
  }

  const html = await response.text();
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    throw new ArxivContentError(
      '论文正文过大，暂时无法自动导入。',
      'ARXIV_PARSE_FAILED'
    );
  }

  return transformArxivHtml(html, sourceUrl);
}

/** 导出纯转换函数，便于用固定 HTML 做本地验证。 */
export function transformArxivHtml(html: string, sourceUrl: string): ArxivFullText {
  const $ = cheerio.load(html);
  const root = $('article.ltx_document, main.ltx_document, .ltx_document, main')
    .first();

  if (!root.length) {
    throw new ArxivContentError(
      '无法识别 arXiv HTML 正文结构。',
      'ARXIV_PARSE_FAILED'
    );
  }

  // 阅读器自己的头部已经显示标题和作者；移除页面导航、脚本及重复元信息。
  root
    .find(
      [
        'script',
        'style',
        'noscript',
        'svg',
        'nav',
        'footer',
        '.ltx_page_header',
        '.ltx_page_footer',
        '.ltx_TOC',
        '.ltx_title_document',
        '.ltx_authors',
        '.ltx_dates',
        '.ltx_role_affiliationtext',
      ].join(',')
    )
    .remove();

  normalizeHeadingLevels($, root);
  normalizeFigureImages($, root);
  absolutizeUrls($, root, sourceUrl);

  // 先将 MathML 替换成不含 Markdown 特殊字符的占位符，转换完成后恢复 LaTeX。
  const mathValues: string[] = [];
  root.find('math').each((_index, element) => {
    const math = $(element);
    const latex =
      math.attr('alttext') ||
      math.find('annotation[encoding="application/x-tex"]').first().text() ||
      math.text();
    if (!latex.trim()) {
      math.remove();
      return;
    }
    const token = `ARXIVMATHPLACEHOLDER${mathValues.length}END`;
    const isBlock =
      math.attr('display') === 'block' ||
      math.parents('.ltx_equation, .ltx_equationgroup, .ltx_display').length > 0;
    mathValues.push(isBlock ? `\n\n$$\n${latex.trim()}\n$$\n\n` : `$${latex.trim()}$`);
    math.replaceWith(token);
  });

  // Turndown 本身不会保留 HTML table。先把数据表转为 GFM Markdown 占位符，
  // 避免表格被压平成一长串文本；公式布局用的 table 不在此范围内。
  const tableValues: string[] = [];
  root.find('table.ltx_tabular').each((_index, element) => {
    const markdown = tableToMarkdown($, $(element));
    if (!markdown) {
      $(element).remove();
      return;
    }
    const token = `ARXIVTABLEPLACEHOLDER${tableValues.length}END`;
    tableValues.push(`\n\n${markdown}\n\n`);
    $(element).replaceWith(token);
  });

  const chapters = extractChapters($, root);
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  turndown.remove(['button']);
  turndown.addRule('subscript', {
    filter: 'sub',
    replacement: (content) => `<sub>${content}</sub>`,
  });
  turndown.addRule('superscript', {
    filter: 'sup',
    replacement: (content) => `<sup>${content}</sup>`,
  });
  turndown.addRule('figureCaption', {
    filter: 'figcaption',
    replacement: (content) => `\n\n*${content.trim()}*\n\n`,
  });

  let content = turndown.turndown(root.html() || '');
  tableValues.forEach((value, index) => {
    content = content.replaceAll(`ARXIVTABLEPLACEHOLDER${index}END`, value);
  });
  mathValues.forEach((value, index) => {
    content = content.replaceAll(`ARXIVMATHPLACEHOLDER${index}END`, value);
  });
  content = content
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  content = `${ARXIV_CONTENT_FORMAT_MARKER}\n\n${content}`;

  if (content.length < 500) {
    throw new ArxivContentError(
      'arXiv HTML 正文内容不完整，未写入数据库。',
      'ARXIV_PARSE_FAILED'
    );
  }

  return { content, chapters, sourceUrl };
}

/**
 * arXiv 会用 object[data] 嵌入 SVG 图，而 Turndown 不认识 object，导致只剩图注。
 * 统一转换为 img，并兼容 data-src / picture source 等延迟加载写法。
 */
function normalizeFigureImages(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>
) {
  root.find('object[data]').each((_index, element) => {
    const object = $(element);
    const data = object.attr('data');
    const type = object.attr('type') || '';
    if (!data || (!type.startsWith('image/') && !/\.(?:svg|png|jpe?g|gif|webp)(?:$|[?#])/i.test(data))) {
      return;
    }

    const caption = object.closest('figure').find('figcaption').first().text();
    const image = $('<img>');
    image.attr('src', data);
    image.attr('alt', caption.replace(/\s+/g, ' ').trim() || '论文图');
    const width = object.attr('width');
    const height = object.attr('height');
    if (width) image.attr('width', width);
    if (height) image.attr('height', height);
    object.replaceWith(image);
  });

  root.find('img').each((_index, element) => {
    const image = $(element);
    if (!image.attr('src')) {
      const lazySource = image.attr('data-src') || image.attr('data-original');
      if (lazySource) image.attr('src', lazySource);
    }
    if (!image.attr('src')) {
      const srcset = image.attr('srcset') || image.closest('picture').find('source[srcset]').first().attr('srcset');
      const firstSource = srcset?.split(',')[0]?.trim().split(/\s+/)[0];
      if (firstSource) image.attr('src', firstSource);
    }
  });
}

type TableSlot = { text: string; header: boolean } | null;

/** 将带 rowspan/colspan 的 arXiv 数据表摊平成可滚动的 GFM 表格。 */
function tableToMarkdown(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<AnyNode>
): string {
  const grid: TableSlot[][] = [];
  const rows = table.find('tr').toArray();
  if (rows.length === 0) return '';

  rows.forEach((rowElement, rowIndex) => {
    grid[rowIndex] ||= [];
    let columnIndex = 0;
    $(rowElement)
      .children('th, td')
      .each((_cellIndex, cellElement) => {
        while (grid[rowIndex][columnIndex] !== undefined) columnIndex += 1;

        const cell = $(cellElement);
        const text = normalizeTableCell(cell.text());
        const rowspan = Math.max(1, Number.parseInt(cell.attr('rowspan') || '1', 10) || 1);
        const colspan = Math.max(1, Number.parseInt(cell.attr('colspan') || '1', 10) || 1);
        const header = cellElement.type === 'tag' && cellElement.tagName.toLowerCase() === 'th';

        for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
          const targetRow = rowIndex + rowOffset;
          grid[targetRow] ||= [];
          for (let columnOffset = 0; columnOffset < colspan; columnOffset += 1) {
            grid[targetRow][columnIndex + columnOffset] = {
              text: rowOffset === 0 && columnOffset === 0 ? text : '',
              header,
            };
          }
        }
        columnIndex += colspan;
      });
  });

  const columnCount = Math.max(...grid.map((row) => row.length));
  if (!Number.isFinite(columnCount) || columnCount === 0) return '';
  const normalizedRows = grid.map((row) =>
    Array.from({ length: columnCount }, (_unused, index) => row[index] ?? null)
  );

  const theadRows = table.find('thead tr').length;
  const headerRowCount = Math.max(1, theadRows);
  const header = Array.from({ length: columnCount }, (_unused, columnIndex) => {
    const parts = normalizedRows
      .slice(0, headerRowCount)
      .map((row) => row[columnIndex]?.text || '')
      .filter((part, index, all) => part && all.indexOf(part) === index);
    return parts.join(' / ') || '—';
  });
  const body = normalizedRows.slice(headerRowCount);

  const renderRow = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [
    renderRow(header),
    renderRow(Array.from({ length: columnCount }, () => '---')),
    ...body.map((row) => renderRow(row.map((cell) => cell?.text || ''))),
  ].join('\n');
}

function normalizeTableCell(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|');
}

function normalizeArxivId(arxivId: string): string {
  const normalized = arxivId.trim().replace(/^arxiv:/i, '');
  // 同时兼容现代编号 2408.12345 和旧式编号 hep-th/9901001。
  if (!/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i.test(normalized)) {
    throw new ArxivContentError('无效的 arXiv ID。', 'ARXIV_PARSE_FAILED');
  }
  return normalized;
}

function normalizeHeadingLevels(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>
) {
  const selectors: Array<[string, 'h2' | 'h3']> = [
    ['.ltx_title_abstract', 'h2'],
    ['.ltx_title_section', 'h2'],
    ['.ltx_title_bibliography', 'h2'],
    ['.ltx_title_appendix', 'h2'],
    ['.ltx_title_subsection', 'h3'],
    ['.ltx_title_subsubsection', 'h3'],
  ];

  for (const [selector, tagName] of selectors) {
    root.find(selector).each((_index, element) => {
      const heading = $(element);
      if (heading.is(tagName)) return;
      const replacement = $(`<${tagName}></${tagName}>`);
      replacement.append(heading.contents());
      heading.replaceWith(replacement);
    });
  }

  const abstract = root.find('.ltx_abstract').first();
  if (abstract.length && !abstract.find('h1, h2, h3').length) {
    abstract.prepend('<h2>Abstract</h2>');
  }
}

function absolutizeUrls(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  sourceUrl: string
) {
  root.find('a[href]').each((_index, element) => {
    const link = $(element);
    const href = link.attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
    try {
      const url = new URL(href, sourceUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        link.removeAttr('href');
        return;
      }
      link.attr('href', url.toString());
    } catch {
      link.removeAttr('href');
    }
  });

  root.find('img[src]').each((_index, element) => {
    const image = $(element);
    const src = image.attr('src');
    if (!src) return;
    try {
      const url = new URL(src, sourceUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        image.remove();
        return;
      }
      image.attr('src', url.toString());
      image.removeAttr('srcset');
      image.removeAttr('loading');
    } catch {
      image.remove();
    }
  });
}

function extractChapters(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>
): ArxivChapter[] {
  const chapters: ArxivChapter[] = [];
  root.find('h1, h2, h3').each((_index, element) => {
    const heading = $(element);
    const title = heading.text().replace(/\s+/g, ' ').trim();
    if (!title) return;
    const tagName = element.type === 'tag' ? element.tagName.toLowerCase() : 'h2';
    const level: 1 | 2 | 3 = tagName === 'h3' ? 2 : tagName === 'h1' ? 1 : 1;
    chapters.push({
      id: `arxiv-chapter-${chapters.length + 1}`,
      title,
      level,
      anchor: slugify(title) || `section-${chapters.length + 1}`,
    });
  });
  return chapters;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w一-龥\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}
