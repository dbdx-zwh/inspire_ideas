import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, FileText, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/Popover';
import { Button } from '@/components/ui/Button';
import { useQuery } from '@tanstack/react-query';
import { fetchFeed } from '@/api/endpoints/papers';
import { useReaderTabsStore } from '@/stores/useReaderTabsStore';

interface ArxivCitationLinkProps {
  arxivId: string;
  url: string;
}

/**
 * 匹配到的 arxiv 引用链接。
 * hover 弹出 popover 显示论文信息；命中库内可点击打开阅读器，未命中显示"添加"入口。
 */
export function ArxivCitationLink({ arxivId, url }: ArxivCitationLinkProps) {
  const navigate = useNavigate();
  const openTab = useReaderTabsStore((s) => s.openTab);
  const [open, setOpen] = useState(false);

  // 检查库内是否已有这篇论文（简单实现：拉一次 feed 全量并本地过滤）
  const { data: allPapers } = useQuery({
    queryKey: ['all-papers-cache'],
    queryFn: async () => {
      const res = await fetchFeed({}, null);
      return res.papers;
    },
    staleTime: 60_000,
    enabled: open, // 只有用户 hover 时才拉
  });

  const matched = allPapers?.find((p) => p.arxivId === arxivId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary cursor-pointer"
          onMouseEnter={() => setOpen(true)}
          onClick={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
        >
          arXiv:{arxivId}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="w-[320px] p-3"
        onMouseLeave={() => setOpen(false)}
      >
        {matched ? (
          <div>
            <div className="text-xxs uppercase tracking-wider text-primary font-semibold mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3" /> 已在库内
            </div>
            <div className="text-sm font-medium text-text-primary mb-1 line-clamp-2">
              {matched.title}
            </div>
            <div className="text-xxs text-text-secondary line-clamp-2 mb-3">
              {matched.aiSummary}
            </div>
            <div className="flex gap-1">
              <Button
                size="xs"
                onClick={() => {
                  openTab({ paperId: matched.id, title: matched.title });
                  navigate(`/reader/${matched.id}`);
                  setOpen(false);
                }}
              >
                打开阅读器
              </Button>
              <Button
                size="xs"
                variant="secondary"
                onClick={() =>
                  window.open(url, '_blank', 'noopener,noreferrer')
                }
              >
                <ExternalLink className="h-3 w-3" /> 原文
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-xxs uppercase tracking-wider text-text-tertiary font-semibold mb-1">
              arXiv 引用
            </div>
            <div className="text-sm text-text-primary mb-2 font-mono">
              {arxivId}
            </div>
            <div className="text-xxs text-text-secondary mb-3">
              这篇论文还未加入你的库。
            </div>
            <div className="flex gap-1">
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  toast.info('添加到库功能即将上线');
                  setOpen(false);
                }}
              >
                <Plus className="h-3 w-3" /> 添加到库
              </Button>
              <Button
                size="xs"
                variant="secondary"
                onClick={() =>
                  window.open(url, '_blank', 'noopener,noreferrer')
                }
              >
                <ExternalLink className="h-3 w-3" /> 直接查看
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
