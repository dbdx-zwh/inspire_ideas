import { useEffect, useState } from 'react';
import { ChevronDown, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useStreamingResource } from '@/hooks/useStreamingResource';
import { aiCardStreamPath } from '@/api/endpoints/aiCards';
import { cn } from '@/lib/cn';
import type { AICardType } from '@/types';
import { MarkdownContent } from '@/components/common/MarkdownContent';

interface AICardBlockProps {
  paperId: string;
  type: AICardType;
  title: string;
  initialContent?: string;
}

export function AICardBlock({
  paperId,
  type,
  title,
  initialContent,
}: AICardBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [content, setContent] = useState(initialContent ?? '');
  const { data, isStreaming, error, start, cancel } =
    useStreamingResource<string>({
      endpoint: aiCardStreamPath(paperId, type),
      mode: 'text',
    });

  // 流式内容实时更新
  useEffect(() => {
    if (typeof data === 'string' && data.length > 0) {
      setContent(data);
    }
  }, [data]);

  // GET 缓存异步返回后同步到本地展示状态。
  useEffect(() => {
    setContent(initialContent ?? '');
  }, [initialContent, paperId, type]);

  // 切换论文或卸载时终止仍在进行的流式请求；挂载本身不触发生成。
  useEffect(() => {
    return () => cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, type]);

  const handleRegenerate = () => {
    setContent('');
    start({});
  };

  return (
    <div className="rounded-lg border border-border bg-white shadow-card overflow-hidden">
      <div className="h-0.5 ai-gradient-bar" />
      <div
        className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-ai-purple" />
          <span className="text-[13px] font-semibold text-text-primary">
            {title}
          </span>
          {isStreaming && (
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-ai-purple animate-blink" />
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRegenerate();
            }}
            className="p-1 rounded hover:bg-gray-100 text-text-tertiary hover:text-text-secondary"
            title="重新生成"
          >
            <RefreshCw
              className={cn(
                'h-3 w-3',
                isStreaming && 'animate-spin'
              )}
            />
          </button>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-text-tertiary transition-transform',
              collapsed && '-rotate-90'
            )}
          />
        </div>
      </div>
      {!collapsed && (
        <div className="px-4 pb-3 pt-1 text-[13px] leading-relaxed text-text-primary bg-ai-bg">
          {content ? (
            <>
              <MarkdownContent content={content} />
              {isStreaming && (
                <span className="inline-block w-1 h-3.5 bg-primary ml-0.5 animate-blink align-baseline" />
              )}
            </>
          ) : (
            <div className="text-xs text-text-tertiary italic py-2">
              {isStreaming
                ? '生成中...'
                : error
                  ? error.message
                  : '暂无内容，点击 ↻ 生成'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
