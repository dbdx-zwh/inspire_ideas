import { useEffect, useMemo, useState } from 'react';
import { FolderPlus, Search, Sparkles, Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { SimpleTooltip } from '@/components/ui/Tooltip';
import { useModalStore } from '@/stores/useModalStore';
import { usePaper } from '@/hooks/usePapers';
import {
  useArchivePaper,
  useCreateTopic,
  useTopics,
  useArchiveRecommendations,
} from '@/hooks/useTopics';
import { useStreamingResource } from '@/hooks/useStreamingResource';
import { archiveSummaryStreamPath } from '@/api/endpoints/topics';
import {
  buildTopicTree,
  type TopicTreeNode,
} from '@/components/common/TopicTree';
import { SourceChip } from '@/components/common/SourceChip';
import { useBloggers } from '@/hooks/useBloggers';
import type { Topic, TopicRecommendation } from '@/types';
import { cn } from '@/lib/cn';

export function ArchiveModal() {
  const active = useModalStore((s) => s.active);
  const close = useModalStore((s) => s.close);
  const paperId = useModalStore((s) => s.archivePaperId);
  const open = active === 'archive';

  const { data: paper } = usePaper(paperId ?? undefined);
  const { data: topics = [] } = useTopics();
  const { data: bloggers = [] } = useBloggers();
  const { data: recommendations = [] } = useArchiveRecommendations(
    open ? paperId : null
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [primaryTopicId, setPrimaryTopicId] = useState<string | null>(null);
  const [extraTopicIds, setExtraTopicIds] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState('');
  const [summarySource, setSummarySource] = useState<'ai' | 'user'>('ai');
  const [dropOverId, setDropOverId] = useState<string | null>(null);

  const [newTopicMode, setNewTopicMode] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicParent, setNewTopicParent] = useState<string>('__root__');

  const archiveMutation = useArchivePaper();
  const createTopicMutation = useCreateTopic();

  // AI 总结流式生成
  const {
    data: streamedSummary,
    isStreaming: isSummarizing,
    start: startSummary,
    reset: resetSummary,
  } = useStreamingResource<string>({
    endpoint: archiveSummaryStreamPath(),
    mode: 'text',
  });

  // 流式生成的内容实时写入总结（除非用户已经编辑过）
  useEffect(() => {
    if (streamedSummary && summarySource === 'ai') {
      setSummary(streamedSummary);
    }
  }, [streamedSummary, summarySource]);

  // 弹窗关闭时重置状态
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setPrimaryTopicId(null);
      setExtraTopicIds(new Set());
      setSummary('');
      setSummarySource('ai');
      setDropOverId(null);
      setNewTopicMode(false);
      setNewTopicName('');
      setNewTopicParent('__root__');
      resetSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 选择目录后触发 AI 总结生成
  useEffect(() => {
    if (primaryTopicId && paperId && summarySource === 'ai') {
      startSummary({ paperId, topicId: primaryTopicId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryTopicId, paperId]);

  const recommendationMap = useMemo(() => {
    const map = new Map<string, TopicRecommendation>();
    recommendations.forEach((r) => map.set(r.topicId, r));
    return map;
  }, [recommendations]);

  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) return topics;
    const q = searchQuery.toLowerCase();
    const matched = new Set<string>();
    topics.forEach((t) => {
      if (t.name.toLowerCase().includes(q)) matched.add(t.id);
    });
    const addAncestors = (id: string) => {
      const t = topics.find((x) => x.id === id);
      if (t?.parentId) {
        matched.add(t.parentId);
        addAncestors(t.parentId);
      }
    };
    Array.from(matched).forEach(addAncestors);
    return topics.filter((t) => matched.has(t.id));
  }, [topics, searchQuery]);

  const allSelectedTopicIds = new Set(extraTopicIds);
  if (primaryTopicId) allSelectedTopicIds.add(primaryTopicId);

  const leafTopics = useMemo(() => {
    const hasChildren = new Set(topics.filter((t) => t.parentId).map((t) => t.parentId!));
    return topics.filter((t) => !hasChildren.has(t.id));
  }, [topics]);

  const handleSelectTopic = (topic: Topic) => {
    const isLeaf = !topics.some((x) => x.parentId === topic.id);
    if (!isLeaf) return;
    setPrimaryTopicId(topic.id);
    setExtraTopicIds((prev) => new Set(prev).add(topic.id));
    setSummarySource('ai'); // 切换目录时重置 AI 生成
    resetSummary();
  };

  const handleDrop = (topic: Topic) => {
    const isLeaf = !topics.some((t) => t.parentId === topic.id);
    if (!isLeaf) {
      toast.error('请拖拽到叶子目录');
      setDropOverId(null);
      return;
    }
    handleSelectTopic(topic);
    setDropOverId(null);
    toast.success(`已选择：${topic.name}`);
  };

  const handleCreateTopic = async () => {
    if (!newTopicName.trim()) {
      toast.error('请输入目录名称');
      return;
    }
    try {
      const topic = await createTopicMutation.mutateAsync({
        name: newTopicName.trim(),
        parentId: newTopicParent === '__root__' ? null : newTopicParent,
      });
      setPrimaryTopicId(topic.id);
      setExtraTopicIds((prev) => new Set(prev).add(topic.id));
      setNewTopicMode(false);
      setNewTopicName('');
      toast.success('目录已创建');
    } catch {
      toast.error('创建失败');
    }
  };

  const handleConfirm = async () => {
    if (!paperId) return;
    if (allSelectedTopicIds.size === 0) {
      toast.error('请至少选择一个目录');
      return;
    }
    try {
      await archiveMutation.mutateAsync({
        paperId,
        topicIds: Array.from(allSelectedTopicIds),
        summary,
      });
      toast.success('归档成功');
      close();
    } catch {
      toast.error('归档失败');
    }
  };

  const [isDragging, setIsDragging] = useState(false);
  const canConfirm = allSelectedTopicIds.size > 0;

  return (
    <Modal open={open} onOpenChange={(v) => !v && close()}>
      <ModalContent size="xl" className="max-h-[85vh]">
        <ModalHeader>
          <ModalTitle>归档到目录</ModalTitle>
        </ModalHeader>

        <ModalBody className="!p-0 flex flex-col">
          <div className="flex flex-1 min-h-0 border-b border-border">
            {/* 左侧目录树 */}
            <div className="w-[380px] flex-shrink-0 border-r border-border flex flex-col">
              <div className="p-4 border-b border-border">
                <Input
                  placeholder="搜索目录..."
                  leftIcon={<Search className="h-4 w-4" />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {recommendations.length > 0 && (
                  <div className="mt-2 text-xxs text-text-tertiary flex items-center gap-1">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    带 ⭐ 的是 AI 智能推荐目录
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <TopicTreeWithRec
                  topics={filteredTopics}
                  recommendationMap={recommendationMap}
                  activeId={primaryTopicId}
                  onSelect={handleSelectTopic}
                  onDrop={handleDrop}
                  onDropOver={(t) => setDropOverId(t.id)}
                  dropOverId={dropOverId}
                />
              </div>
              <div className="p-3 border-t border-border">
                {!newTopicMode ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => setNewTopicMode(true)}
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    新建目录
                  </Button>
                ) : (
                  <div className="space-y-2 animate-fade-in">
                    <Input
                      autoFocus
                      placeholder="目录名称"
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateTopic()}
                    />
                    <Select value={newTopicParent} onValueChange={setNewTopicParent}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__root__">根目录</SelectItem>
                        {topics.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={handleCreateTopic}
                        loading={createTopicMutation.isPending}
                      >
                        创建并选中
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setNewTopicMode(false);
                          setNewTopicName('');
                        }}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 右侧：待归档论文 */}
            <div className="flex-1 p-6 flex flex-col overflow-y-auto">
              <div className="text-xxs uppercase tracking-wider text-text-tertiary font-semibold mb-3">
                待归档论文
              </div>
              {paper ? (
                <div
                  draggable
                  onDragStart={(e) => {
                    setIsDragging(true);
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('text/plain', paper.id);
                  }}
                  onDragEnd={() => setIsDragging(false)}
                  className={cn(
                    'rounded-lg border-2 border-dashed border-primary/40 bg-primary-light/30 p-4',
                    'cursor-grab active:cursor-grabbing transition-all',
                    isDragging && 'opacity-40 scale-95'
                  )}
                >
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <SourceChip source={paper.source} />
                    {(paper.bloggerIds ?? []).slice(0, 2).map((bid) => {
                      const b = bloggers.find((x) => x.id === bid);
                      if (!b) return null;
                      return (
                        <SourceChip
                          key={bid}
                          source="blogger"
                          bloggerName={b.name}
                          platform={
                            b.platform as 'xiaohongshu' | 'zhihu' | undefined
                          }
                        />
                      );
                    })}
                    {(paper.bloggerIds?.length ?? 0) > 2 && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xxs font-medium bg-indigo-50 text-primary">
                        +{(paper.bloggerIds?.length ?? 0) - 2}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-text-primary line-clamp-2 mb-2">
                    {paper.title}
                  </h3>
                  <p className="text-xs text-text-secondary line-clamp-2 mb-2">
                    {paper.aiSummary}
                  </p>
                  <div className="text-xxs text-text-tertiary">
                    按住拖拽到左侧目录 →
                  </div>
                </div>
              ) : (
                <div className="text-sm text-text-tertiary">论文加载中...</div>
              )}

              <div className="text-center text-xs text-text-tertiary my-6">
                — 或直接点击左侧目录选择 —
              </div>

              {primaryTopicId && (
                <div className="animate-fade-in rounded-md border border-primary/30 bg-primary-light/30 p-3">
                  <div className="text-xxs uppercase tracking-wider text-primary font-semibold mb-1">
                    主目录
                  </div>
                  <div className="text-sm text-text-primary">
                    {topics.find((t) => t.id === primaryTopicId)?.name}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 底部：归档总结 + 多目录 */}
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xxs uppercase tracking-wider text-text-tertiary font-semibold flex items-center gap-1.5">
                归档总结
                {summarySource === 'ai' && !isSummarizing && summary && (
                  <span className="inline-flex items-center gap-0.5 text-ai-purple normal-case">
                    <Sparkles className="h-3 w-3" />
                    AI 初稿
                  </span>
                )}
                {isSummarizing && (
                  <span className="inline-flex items-center gap-1 text-ai-purple normal-case">
                    <span className="h-1.5 w-1.5 rounded-full bg-ai-purple animate-blink" />
                    生成中...
                  </span>
                )}
              </div>
              {primaryTopicId && !isSummarizing && (
                <button
                  onClick={() => {
                    setSummarySource('ai');
                    startSummary({ paperId, topicId: primaryTopicId });
                  }}
                  className="text-xxs text-primary hover:underline"
                >
                  重新生成
                </button>
              )}
            </div>
            <Textarea
              placeholder={
                primaryTopicId
                  ? '选择目录后 AI 会自动生成归档总结初稿，你可以编辑...'
                  : '选择目录后 AI 会自动生成归档总结初稿'
              }
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                setSummarySource('user'); // 用户编辑后不再被流式内容覆盖
              }}
              className={cn(
                'min-h-[100px]',
                summarySource === 'ai' && summary && 'bg-ai-bg'
              )}
            />

            {leafTopics.length > 0 && (
              <div className="mt-4">
                <div className="text-xxs uppercase tracking-wider text-text-tertiary font-semibold mb-2">
                  同时归入
                </div>
                <div className="flex flex-wrap gap-3 max-h-[100px] overflow-y-auto">
                  {leafTopics.map((t) => {
                    const checked = extraTopicIds.has(t.id);
                    return (
                      <label
                        key={t.id}
                        className="inline-flex items-center gap-1.5 text-xs cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setExtraTopicIds((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(t.id);
                              else next.delete(t.id);
                              return next;
                            });
                          }}
                        />
                        <span className="text-text-primary">{t.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" onClick={close}>
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            loading={archiveMutation.isPending}
            disabled={!canConfirm}
          >
            确认归档
            {allSelectedTopicIds.size > 0 && (
              <span className="ml-1 opacity-80">({allSelectedTopicIds.size})</span>
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/** 带 AI 推荐标记的目录树 */
function TopicTreeWithRec({
  topics,
  recommendationMap,
  activeId,
  onSelect,
  onDrop,
  onDropOver,
  dropOverId,
}: {
  topics: Topic[];
  recommendationMap: Map<string, TopicRecommendation>;
  activeId: string | null;
  onSelect: (t: Topic) => void;
  onDrop: (t: Topic) => void;
  onDropOver: (t: Topic) => void;
  dropOverId: string | null;
}) {
  const tree = useMemo(() => buildTopicTree(topics), [topics]);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
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

  const renderNode = (topic: TopicTreeNode, depth: number): React.ReactNode => {
    const hasChildren = topic.children.length > 0;
    const isExpanded = expanded.has(topic.id);
    const isActive = activeId === topic.id;
    const isDropTarget = dropOverId === topic.id;
    const rec = recommendationMap.get(topic.id);

    return (
      <div key={topic.id}>
        <div
          className={cn(
            'group flex items-center gap-1.5 py-1.5 pr-2 rounded cursor-pointer text-sm',
            'hover:bg-gray-50 transition-colors',
            isActive && 'bg-primary-light text-primary',
            isDropTarget && 'ring-2 ring-primary bg-primary-light'
          )}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => {
            if (hasChildren) toggle(topic.id);
            else onSelect(topic);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            onDropOver(topic);
          }}
          onDrop={(e) => {
            e.preventDefault();
            onDrop(topic);
          }}
        >
          <span
            className={cn(
              'inline-block h-3.5 w-3.5 text-center text-text-tertiary text-xs',
              hasChildren && 'transition-transform',
              hasChildren && isExpanded && 'rotate-90'
            )}
          >
            {hasChildren ? '▸' : '·'}
          </span>
          <span className="flex-shrink-0 text-text-secondary text-xs">📁</span>
          <span className="flex-1 truncate">{topic.name}</span>
          {rec && (
            <SimpleTooltip content={rec.reason}>
              <Star className="h-3 w-3 fill-amber-400 text-amber-400 flex-shrink-0" />
            </SimpleTooltip>
          )}
          <span className="text-xxs text-text-tertiary">{topic.paperCount}</span>
        </div>
        {isExpanded &&
          hasChildren &&
          topic.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return <div className="select-none">{tree.map((t) => renderNode(t, 0))}</div>;
}
