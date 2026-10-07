import { useEffect, useRef, useState } from 'react';
import { AlertCircle, MessageSquare, RefreshCw, Settings, Sparkles } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AICardBlock } from './AICardBlock';
import { ReaderChat } from './ReaderChat';
import { cn } from '@/lib/cn';
import type { AICardType } from '@/types';
import { fetchAICards, generateAICards } from '@/api/endpoints/aiCards';
import { Button } from '@/components/ui/Button';
import { useModalStore } from '@/stores/useModalStore';

/** 是否"大模型未配置/配置不完整"类错误（此时引导用户去设置） */
function isLlmConfigError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /尚未配置大模型|LLM_NOT_CONFIGURED|配置不完整/.test(err.message)
  );
}

const CARD_TYPES: { type: AICardType; title: string }[] = [
  { type: 'motivation', title: 'Motivation' },
  { type: 'method', title: 'Method' },
  { type: 'experiments', title: 'Experiments' },
  { type: 'limitations', title: 'Limitations' },
  { type: 'transferable', title: '可迁移点' },
];

interface ReaderRightPanelProps {
  paperId: string;
  contentReady: boolean;
  pendingCite?: { anchor: string; text: string } | null;
  onCiteConsumed?: () => void;
}

export function ReaderRightPanel({
  paperId,
  contentReady,
  pendingCite,
  onCiteConsumed,
}: ReaderRightPanelProps) {
  const [tab, setTab] = useState<'cards' | 'chat'>('cards');
  const qc = useQueryClient();
  const autoGenerationAttempt = useRef<string | null>(null);
  const {
    data: cards = [],
    isLoading: cardsLoading,
    isError: cardsLoadFailed,
  } = useQuery({
    queryKey: ['ai-cards', paperId],
    queryFn: () => fetchAICards(paperId),
    enabled: contentReady,
  });
  const generateCards = useMutation({
    mutationFn: () => generateAICards(paperId),
    onSuccess: (generated) => {
      qc.setQueryData(['ai-cards', paperId], generated);
    },
  });

  // 当用户从中栏发起"就这段问 AI"，自动切到 Chat tab
  useEffect(() => {
    if (pendingCite) setTab('chat');
  }, [pendingCite]);

  // 正文就绪后先读取持久化结果。只有缓存不完整时才自动生成一次，
  // 刷新或再次进入已有五张卡片的论文不会重复调用大模型。
  useEffect(() => {
    if (
      !contentReady ||
      cardsLoading ||
      cardsLoadFailed ||
      cards.length >= CARD_TYPES.length ||
      generateCards.isPending ||
      autoGenerationAttempt.current === paperId
    ) {
      return;
    }
    autoGenerationAttempt.current = paperId;
    generateCards.mutate();
    // generateCards 本身由当前 paperId 创建；这里只响应缓存状态变化。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, contentReady, cardsLoading, cardsLoadFailed, cards.length]);

  const handleRegenerateAll = () => {
    autoGenerationAttempt.current = paperId;
    generateCards.mutate();
  };

  return (
    <aside className="flex h-full min-h-0 w-[400px] flex-shrink-0 flex-col overflow-hidden border-l border-border bg-bg-page">
      {/* Tab 切换 */}
      <div className="h-11 flex-shrink-0 flex items-center border-b border-border bg-white">
        <TabButton
          active={tab === 'cards'}
          onClick={() => setTab('cards')}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="AI 结构化"
        />
        <TabButton
          active={tab === 'chat'}
          onClick={() => setTab('chat')}
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label="Chat 问答"
        />
      </div>

      {/* 内容区 */}
      <div className="relative flex-1 overflow-hidden">
        {/* 两个面板始终保持挂载，避免切换 Tab 时丢失输入、乐观消息或流式状态。 */}
        <div
          className={cn(
            'absolute inset-0 overflow-y-auto p-3 space-y-2.5',
            tab !== 'cards' && 'invisible pointer-events-none'
          )}
          aria-hidden={tab !== 'cards'}
        >
          {!contentReady && (
            <div className="rounded-lg border border-border bg-white p-4 text-center text-xs text-text-tertiary">
              正文导入完成后，将自动生成结构化总结。
            </div>
          )}
          {contentReady && (cardsLoading || generateCards.isPending) && (
            <div className="rounded-lg border border-ai-purple/20 bg-ai-bg p-3 text-xs text-text-secondary flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ai-purple border-t-transparent" />
              AI 正在阅读全文并生成五类结构化总结…
            </div>
          )}
          {generateCards.isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex items-start gap-2 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>
                  {generateCards.error instanceof Error
                    ? generateCards.error.message
                    : 'AI 分析失败，请稍后重试。'}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={handleRegenerateAll}
                >
                  <RefreshCw className="h-3 w-3" />
                  重试
                </Button>
                {isLlmConfigError(generateCards.error) && (
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={() => useModalStore.getState().open('settings')}
                  >
                    <Settings className="h-3 w-3" />
                    去配置大模型
                  </Button>
                )}
              </div>
            </div>
          )}
          {CARD_TYPES.map((c) => (
            <AICardBlock
              key={`${paperId}:${c.type}`}
              paperId={paperId}
              type={c.type}
              title={c.title}
              initialContent={cards.find((card) => card.type === c.type)?.content}
            />
          ))}
          {contentReady && !cardsLoading && (
            <Button
              className="w-full"
              variant={cards.length > 0 ? 'ghost' : 'primary'}
              size="xs"
              onClick={handleRegenerateAll}
              loading={generateCards.isPending}
            >
              {cards.length > 0 ? (
                <RefreshCw className="h-3 w-3" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {cards.length > 0 ? '基于正文重新分析' : '生成 AI 结构化内容'}
            </Button>
          )}
        </div>
        <div
          className={cn(
            'absolute inset-0',
            tab !== 'chat' && 'invisible pointer-events-none'
          )}
          aria-hidden={tab !== 'chat'}
        >
          <ReaderChat
            paperId={paperId}
            contentReady={contentReady}
            pendingCite={pendingCite}
            onCiteConsumed={onCiteConsumed}
          />
        </div>
      </div>
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 h-full flex items-center justify-center gap-1.5 text-[13px] font-medium transition-colors relative',
        active
          ? 'text-primary'
          : 'text-text-secondary hover:text-text-primary'
      )}
    >
      {icon}
      {label}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
      )}
    </button>
  );
}
