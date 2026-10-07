import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ImageOff,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { ArxivCitationLink } from './ArxivCitationLink';

interface PaperContentProps {
  content: string;
  /** 中栏内每个段落末尾出现的“就这段问 AI”按钮 */
  onAskAboutParagraph?: (anchor: string, text: string) => void;
}

interface MarkdownSection {
  id: string;
  title: string;
  body: string;
  defaultCollapsed: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w一-龥\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanHeadingText(value: string): string {
  return value
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+#+\s*$/, '')
    .trim();
}

function isReferenceSection(title: string): boolean {
  const normalized = title
    .replace(/^\s*(?:\d+(?:\.\d+)*[.)]?\s*)/, '')
    .trim();
  return /^(?:references?|bibliography|参考文献)(?:\s|$|[.:：])/i.test(normalized);
}

/** 按一级/二级 Markdown 标题切成可独立折叠的论文章节。 */
function splitIntoSections(content: string): {
  preamble: string;
  sections: MarkdownSection[];
} {
  const visibleContent = content.replace(
    /^<!--\s*inspire-arxiv-content:v\d+\s*-->\s*/,
    ''
  );
  const headingPattern = /^(#{1,2})[ \t]+(.+?)[ \t]*#*[ \t]*$/gm;
  const matches = Array.from(visibleContent.matchAll(headingPattern));
  if (matches.length === 0) return { preamble: visibleContent, sections: [] };

  const firstIndex = matches[0].index ?? 0;
  const preamble = visibleContent.slice(0, firstIndex).trim();
  const seenIds = new Map<string, number>();
  const sections = matches.map((match, index) => {
    const title = cleanHeadingText(match[2]);
    const baseId = slugify(title) || `section-${index + 1}`;
    const duplicateIndex = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, duplicateIndex + 1);
    const id = duplicateIndex === 0 ? baseId : `${baseId}-${duplicateIndex + 1}`;
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? visibleContent.length;

    return {
      id,
      title,
      body: visibleContent.slice(bodyStart, bodyEnd).trim(),
      defaultCollapsed: isReferenceSection(title),
    };
  });

  return { preamble, sections };
}

/** 匹配 arxiv URL：http(s)://arxiv.org/abs/XXXX 或 pdf/XXXX */
const ARXIV_URL_RE = /https?:\/\/arxiv\.org\/(abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/g;

/** 检测节点内文本里的 arxiv URL，替换为 <ArxivCitationLink> */
function renderTextWithArxiv(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  ARXIV_URL_RE.lastIndex = 0;
  while ((match = ARXIV_URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <ArxivCitationLink key={match.index} arxivId={match[2]} url={match[0]} />
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 1 ? parts : text;
}

/** 递归处理 children 里的字符串子节点 */
function processChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string') return renderTextWithArxiv(children);
  if (Array.isArray(children)) {
    return children.map((child, index) =>
      typeof child === 'string' ? (
        <span key={index}>{renderTextWithArxiv(child)}</span>
      ) : (
        child
      )
    );
  }
  return children;
}

export function PaperContent({ content, onAskAboutParagraph }: PaperContentProps) {
  const { preamble, sections } = useMemo(() => splitIntoSections(content), [content]);
  const defaultCollapsed = useMemo(
    () => Object.fromEntries(sections.map((section) => [section.id, section.defaultCollapsed])),
    [sections]
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(defaultCollapsed);

  useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [content, defaultCollapsed]);

  const handleAskParagraph = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const button = event.currentTarget;
      const paragraph = button.closest('[data-paragraph]') as HTMLElement | null;
      if (!paragraph) return;
      const anchor = paragraph.dataset.anchor || '';
      const text = paragraph.innerText.replace(/就这段问 AI\s*$/, '').trim();
      onAskAboutParagraph?.(anchor, text);
    },
    [onAskAboutParagraph]
  );

  return (
    <article className="paper-prose">
      {preamble && (
        <MarkdownBody
          content={preamble}
          anchorPrefix="preamble"
          onAskAboutParagraph={onAskAboutParagraph}
          onAskClick={handleAskParagraph}
        />
      )}

      {sections.map((section) => {
        const isCollapsed = collapsed[section.id] ?? section.defaultCollapsed;
        return (
          <section key={section.id} className="paper-section">
            <h2 id={section.id} className="scroll-mt-4">
              <button
                type="button"
                className="group flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-primary-light/40"
                aria-expanded={!isCollapsed}
                aria-controls={`${section.id}-content`}
                onClick={() =>
                  setCollapsed((previous) => ({
                    ...previous,
                    [section.id]: !isCollapsed,
                  }))
                }
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-tertiary transition-colors group-hover:text-primary" />
                ) : (
                  <ChevronDown className="h-4 w-4 flex-shrink-0 text-text-tertiary transition-colors group-hover:text-primary" />
                )}
                <span className="min-w-0 flex-1">{section.title}</span>
                {isCollapsed && (
                  <span className="flex-shrink-0 font-sans text-[11px] font-normal text-text-tertiary">
                    点击展开
                  </span>
                )}
              </button>
            </h2>
            {!isCollapsed && (
              <div id={`${section.id}-content`}>
                <MarkdownBody
                  content={section.body}
                  anchorPrefix={section.id}
                  onAskAboutParagraph={onAskAboutParagraph}
                  onAskClick={handleAskParagraph}
                />
              </div>
            )}
          </section>
        );
      })}
    </article>
  );
}

function MarkdownBody({
  content,
  anchorPrefix,
  onAskAboutParagraph,
  onAskClick,
}: {
  content: string;
  anchorPrefix: string;
  onAskAboutParagraph?: (anchor: string, text: string) => void;
  onAskClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  let paragraphCounter = 0;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        h1: ({ children }) => {
          const text = String(children);
          return <h1 id={slugify(text)}>{processChildren(children)}</h1>;
        },
        h2: ({ children }) => {
          const text = String(children);
          return <h2 id={slugify(text)}>{processChildren(children)}</h2>;
        },
        h3: ({ children }) => {
          const text = String(children);
          return <h3 id={slugify(text)}>{processChildren(children)}</h3>;
        },
        p: ({ children }) => {
          const anchor = `${anchorPrefix}-p${++paragraphCounter}`;
          return (
            <p
              data-paragraph="true"
              data-anchor={anchor}
              className={cn(
                'group/para relative',
                onAskAboutParagraph &&
                  'hover:bg-primary-light/20 -mx-2 px-2 rounded transition-colors'
              )}
            >
              {processChildren(children)}
              {onAskAboutParagraph && (
                <button
                  type="button"
                  onClick={onAskClick}
                  className="ml-1 inline-flex items-center gap-0.5 rounded bg-primary-light px-1.5 py-0.5 text-xxs text-primary opacity-0 transition-opacity hover:bg-primary hover:text-white group-hover/para:opacity-100"
                  title="就这段问 AI"
                >
                  <MessageSquare className="h-2.5 w-2.5" />
                  问 AI
                </button>
              )}
            </p>
          );
        },
        li: ({ children }) => <li>{processChildren(children)}</li>,
        a: ({ href, children }) => {
          const match = href?.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/);
          if (match) {
            return <ArxivCitationLink arxivId={match[1]} url={href!} />;
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        table: ({ children }) => (
          <div className="paper-table-scroll" role="region" aria-label="论文数据表" tabIndex={0}>
            <table>{children}</table>
          </div>
        ),
        img: ({ src, alt }) => <PaperImage src={src} alt={alt} />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function PaperImage({ src, alt }: { src?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src) return null;
  if (failed) {
    return (
      <span className="my-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-gray-50 px-4 py-8 font-sans text-xs text-text-tertiary">
        <ImageOff className="h-4 w-4" />
        图片加载失败
        <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
          打开原图
          <ExternalLink className="h-3 w-3" />
        </a>
      </span>
    );
  }

  return (
    <span className="paper-image-wrap group/image">
      <img
        src={src}
        alt={alt || '论文图'}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="paper-image-open opacity-0 group-hover/image:opacity-100"
        title="打开原图"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        原图
      </a>
    </span>
  );
}
