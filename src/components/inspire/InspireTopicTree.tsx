import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, FileText, Folder, ChevronRight, FolderOpen } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { StatusDot } from '@/components/common/StatusDot';
import {
  buildTopicTree,
  type TopicTreeNode,
} from '@/components/common/TopicTree';
import {
  TOPIC_PAPERS_STALE_TIME,
  topicPapersQueryKey,
  useTopicPapers,
} from '@/hooks/useTopics';
import {
  useSelectionStore,
  type SelectedPaperRef,
} from '@/stores/useSelectionStore';
import { fetchPapersByTopic } from '@/api/endpoints/topics';
import { cn } from '@/lib/cn';
import type { PaperStatus, Topic } from '@/types';

interface InspireTopicTreeProps {
  topics: Topic[];
  onOpenPaper: (paper: SelectedPaperRef) => void;
}

/**
 * Inspire 页专用的目录树：叶子目录可展开显示论文列表 + 复选框
 */
export function InspireTopicTree({
  topics,
  onOpenPaper,
}: InspireTopicTreeProps) {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const tree = useMemo(() => buildTopicTree(topics), [topics]);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // 默认展开根
    const s = new Set<string>();
    tree.forEach((t) => {
      if (t.children?.length) s.add(t.id);
    });
    return s;
  });

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // 搜索过滤：命中的节点及其祖先都保留
  const filteredIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const matched = new Set<string>();
    const topicById = new Map(topics.map((topic) => [topic.id, topic]));
    topics.forEach((t) => {
      if (t.name.toLowerCase().includes(q)) matched.add(t.id);
    });
    const addAncestors = (id: string) => {
      const t = topicById.get(id);
      if (t?.parentId) {
        matched.add(t.parentId);
        addAncestors(t.parentId);
      }
    };
    Array.from(matched).forEach(addAncestors);
    return matched;
  }, [search, topics]);

  const prefetchTopicPapers = useCallback(
    (topicId: string) => {
      void queryClient.prefetchQuery({
        queryKey: topicPapersQueryKey(topicId),
        queryFn: () => fetchPapersByTopic(topicId),
        staleTime: TOPIC_PAPERS_STALE_TIME,
      });
    },
    [queryClient]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <Input
          placeholder="搜索目录..."
          leftIcon={<Search className="h-4 w-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {tree
          .filter((t) => !filteredIds || filteredIds.has(t.id))
          .map((topic) => (
            <TopicNode
              key={topic.id}
              topic={topic}
              depth={0}
              expanded={expanded}
              toggle={toggle}
              filteredIds={filteredIds}
              onOpenPaper={onOpenPaper}
              prefetchTopicPapers={prefetchTopicPapers}
            />
          ))}
      </div>
    </div>
  );
}

interface TopicNodeProps {
  topic: TopicTreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  filteredIds: Set<string> | null;
  onOpenPaper: (paper: SelectedPaperRef) => void;
  prefetchTopicPapers: (topicId: string) => void;
}

function TopicNode({
  topic,
  depth,
  expanded,
  toggle,
  filteredIds,
  onOpenPaper,
  prefetchTopicPapers,
}: TopicNodeProps) {
  const hasChildren = topic.children.length > 0;
  const isExpanded = expanded.has(topic.id);
  const isLeaf = !hasChildren;

  return (
    <>
      <div
        onClick={() => toggle(topic.id)}
        onMouseEnter={() => {
          if (isLeaf) prefetchTopicPapers(topic.id);
        }}
        className={cn(
          'flex items-center gap-1.5 py-1.5 pr-2 rounded cursor-pointer text-sm',
          'hover:bg-gray-50 transition-colors'
        )}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {hasChildren || isLeaf ? (
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 flex-shrink-0 text-text-tertiary transition-transform',
              isExpanded && 'rotate-90'
            )}
          />
        ) : (
          <span className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        {isExpanded && hasChildren ? (
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-text-secondary" />
        ) : (
          <Folder className="h-4 w-4 flex-shrink-0 text-text-secondary" />
        )}
        <span className="flex-1 truncate text-text-primary">{topic.name}</span>
        <span className="text-xxs text-text-tertiary">{topic.paperCount}</span>
      </div>
      {isExpanded && (
        <>
          {hasChildren
            ? topic
                .children.filter((c) => !filteredIds || filteredIds.has(c.id))
                .map((child) => (
                  <TopicNode
                    key={child.id}
                    topic={child}
                    depth={depth + 1}
                    expanded={expanded}
                    toggle={toggle}
                    filteredIds={filteredIds}
                    onOpenPaper={onOpenPaper}
                    prefetchTopicPapers={prefetchTopicPapers}
                  />
                ))
            : (
              <LeafPapers
                topicId={topic.id}
                depth={depth + 1}
                onOpenPaper={onOpenPaper}
              />
            )}
        </>
      )}
    </>
  );
}

function LeafPapers({
  topicId,
  depth,
  onOpenPaper,
}: {
  topicId: string;
  depth: number;
  onOpenPaper: (paper: SelectedPaperRef) => void;
}) {
  const { data: rows, isLoading } = useTopicPapers(topicId);
  const isSelected = useSelectionStore((s) => s.isSelected);
  const toggle = useSelectionStore((s) => s.toggle);

  if (isLoading) {
    return (
      <div
        className="text-xs text-text-tertiary py-1"
        style={{ paddingLeft: 8 + depth * 16 + 20 }}
      >
        加载中...
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div
        className="text-xs text-text-tertiary py-1 italic"
        style={{ paddingLeft: 8 + depth * 16 + 20 }}
      >
        暂无论文
      </div>
    );
  }

  return (
    <>
      {rows.map((row) => {
        const paper = { id: row.paperId, title: row.title };
        const checked = isSelected(paper.id);
        return (
          <PaperRow
            key={paper.id}
            paper={paper}
            status={row.status}
            checked={checked}
            depth={depth}
            onToggle={() => toggle(paper)}
            onOpen={() => onOpenPaper(paper)}
          />
        );
      })}
    </>
  );
}

const DOUBLE_CLICK_DELAY_MS = 220;

function PaperRow({
  paper,
  status,
  checked,
  depth,
  onToggle,
  onOpen,
}: {
  paper: SelectedPaperRef;
  status: PaperStatus;
  checked: boolean;
  depth: number;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const clickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
    }
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      onToggle();
    }, DOUBLE_CLICK_DELAY_MS);
  };

  const handleDoubleClick = () => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onOpen();
  };

  return (
    <div
      className={cn(
        'flex select-none items-center gap-2 rounded py-1.5 pr-2 text-sm cursor-pointer relative',
        'hover:bg-gray-50 transition-colors',
        checked && 'bg-primary-light/50'
      )}
      style={{ paddingLeft: 8 + depth * 16 + 20 }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title="单击选择，双击打开阅读器"
    >
      {checked && (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-full" />
      )}
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        aria-label={`选择《${paper.title}》作为灵感来源`}
      />
      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary" />
      <span className="flex-1 truncate text-xs text-text-primary">
        {paper.title}
      </span>
      <StatusDot status={status} size="sm" />
    </div>
  );
}
