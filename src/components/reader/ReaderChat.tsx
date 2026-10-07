import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Quote,
  RefreshCw,
  Send,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { MarkdownContent } from '@/components/common/MarkdownContent';
import {
  fetchReaderChat,
  readerChatStreamPath,
  type ReaderChatMessage,
} from '@/api/endpoints/aiCards';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { streamFetch } from '@/api/streaming';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/cn';

interface ReaderChatProps {
  paperId: string;
  contentReady: boolean;
  /** 中栏点击“就这段问 AI”时注入的段落 anchor */
  pendingCite?: { anchor: string; text: string } | null;
  onCiteConsumed?: () => void;
}

type LocalChatMessage = ReaderChatMessage & {
  pending?: boolean;
  failed?: boolean;
};

const SUGGESTED_QUESTIONS = [
  '这篇论文解决了什么核心问题？',
  '核心方法和主要创新点是什么？',
  '实验结果是否充分支持作者的结论？',
];

export function ReaderChat({
  paperId,
  contentReady,
  pendingCite,
  onCiteConsumed,
}: ReaderChatProps) {
  const qc = useQueryClient();
  const {
    data: history = [],
    isLoading: historyLoading,
    isError: historyFailed,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['reader-chat', paperId],
    queryFn: () => fetchReaderChat(paperId),
  });

  const [localMessages, setLocalMessages] = useState<LocalChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const combined = useMemo<LocalChatMessage[]>(
    () => [...history, ...localMessages],
    [history, localMessages]
  );
  const lastMessage = combined[combined.length - 1];

  // 流式回答内容变化时始终跟随到最后一条消息。
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: lastMessage?.pending ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [combined.length, lastMessage?.content, lastMessage?.pending]);

  useEffect(() => {
    setLocalMessages([]);
    setInput('');
    setIsSending(false);
  }, [paperId]);

  // 收到“就这段问 AI”时聚焦输入框，引用内容通过请求体单独传给模型。
  useEffect(() => {
    if (!pendingCite) return;
    textareaRef.current?.focus();
  }, [pendingCite]);

  // 输入框随内容增长，最多扩展到 144px。
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [input]);

  const sendMessage = async (question?: string) => {
    const text = (question ?? input).trim();
    if (!text || isSending || !contentReady) return;

    const citedAnchor = pendingCite?.anchor;
    const citedText = pendingCite?.text;
    setInput('');
    setIsSending(true);

    const userMsg: LocalChatMessage = {
      id: nanoid(),
      paperId,
      role: 'user',
      content: text,
      citedAnchor,
      createdAt: new Date().toISOString(),
    };
    const aiMsg: LocalChatMessage = {
      id: nanoid(),
      paperId,
      role: 'ai',
      content: '',
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setLocalMessages((previous) => [...previous, userMsg, aiMsg]);
    if (pendingCite) onCiteConsumed?.();

    let accumulated = '';
    await streamFetch(readerChatStreamPath(paperId), {
      method: 'POST',
      body: {
        content: text,
        citedAnchor,
        citedText,
      },
      onDelta: (delta) => {
        accumulated += String(delta);
        setLocalMessages((previous) =>
          previous.map((message) =>
            message.id === aiMsg.id
              ? { ...message, content: accumulated, pending: true }
              : message
          )
        );
      },
      onEnd: () => {
        setIsSending(false);
        setLocalMessages((previous) =>
          previous.map((message) =>
            message.id === aiMsg.id ? { ...message, pending: false } : message
          )
        );
        // 等服务端历史真正拉取完成后再移除乐观消息，避免回答闪烁或短暂消失。
        // 如果历史拉取失败则保留当前消息，用户仍能看到刚刚的问答。
        void fetchReaderChat(paperId).then((persistedMessages) => {
          qc.setQueryData(['reader-chat', paperId], persistedMessages);
          setLocalMessages([]);
        }).catch(() => undefined);
      },
      onError: (error) => {
        setIsSending(false);
        const message =
          error instanceof Error ? error.message : 'AI 回答失败，请稍后重试。';
        setLocalMessages((previous) =>
          previous.map((item) =>
            item.id === aiMsg.id
              ? {
                  ...item,
                  content: message,
                  pending: false,
                  failed: true,
                }
              : item
          )
        );
      },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f8f9fb]">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        {historyLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-text-tertiary">
            <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-ai-purple border-t-transparent" />
            正在加载对话…
          </div>
        ) : historyFailed ? (
          <div className="mx-auto mt-8 max-w-[280px] rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-500" />
            <p className="text-xs text-red-700">对话记录加载失败</p>
            <Button
              className="mt-3"
              variant="secondary"
              size="xs"
              onClick={() => refetchHistory()}
            >
              <RefreshCw className="h-3 w-3" />
              重新加载
            </Button>
          </div>
        ) : combined.length === 0 ? (
          <EmptyChat
            contentReady={contentReady}
            onSelectQuestion={(question) => void sendMessage(question)}
          />
        ) : (
          <div className="space-y-5">
            {combined.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onRetry={
                  message.failed
                    ? () => {
                        const failedIndex = combined.findIndex(
                          (item) => item.id === message.id
                        );
                        const previousQuestion = [...combined]
                          .slice(0, failedIndex)
                          .reverse()
                          .find((item) => item.role === 'user');
                        if (previousQuestion) setInput(previousQuestion.content);
                        textareaRef.current?.focus();
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} className="h-1" />
      </div>

      <form
        className="flex-shrink-0 border-t border-border bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        {pendingCite && (
          <div className="mb-2 rounded-lg border border-primary/20 bg-primary-light/60 px-2.5 py-2 text-xs text-primary">
            <div className="flex items-start gap-2">
              <Quote className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span className="line-clamp-2 flex-1 leading-5">
                {pendingCite.text}
              </span>
              <button
                type="button"
                onClick={() => onCiteConsumed?.()}
                className="rounded p-0.5 hover:bg-primary/10"
                aria-label="移除引用"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="relative rounded-xl border border-border bg-white shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
          <Textarea
            ref={textareaRef}
            rows={1}
            placeholder={
              contentReady
                ? pendingCite
                  ? '针对这段原文提问…'
                  : '向 AI 询问这篇论文…'
                : '等待论文正文导入完成…'
            }
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            className="min-h-[44px] max-h-36 resize-none border-0 pb-9 text-[13px] leading-5 shadow-none focus:ring-0"
            disabled={isSending || !contentReady}
          />
          <div className="absolute bottom-1.5 left-2.5 text-[10px] text-text-tertiary">
            Enter 发送 · Shift + Enter 换行
          </div>
          <Button
            type="submit"
            size="icon"
            className="absolute bottom-1.5 right-1.5 h-7 w-7 rounded-lg"
            loading={isSending}
            disabled={!contentReady || !input.trim()}
            aria-label="发送问题"
          >
            {!isSending && <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-text-tertiary">
          AI 将结合论文正文与当前对话回答，请核对关键结论和实验数字。
        </p>
      </form>
    </div>
  );
}

function EmptyChat({
  contentReady,
  onSelectQuestion,
}: {
  contentReady: boolean;
  onSelectQuestion: (question: string) => void;
}) {
  return (
    <div className="mx-auto flex h-full max-w-[320px] flex-col items-center justify-center py-8 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-ai-purple to-ai-cyan text-white shadow-sm">
        <Sparkles className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-text-primary">和论文对话</h3>
      <p className="mt-1.5 text-xs leading-5 text-text-tertiary">
        AI 会检索论文正文，并结合上下文回答你的问题。
      </p>
      <div className="mt-5 w-full space-y-2">
        {SUGGESTED_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            disabled={!contentReady}
            onClick={() => onSelectQuestion(question)}
            className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-left text-xs leading-5 text-text-secondary transition hover:border-primary/40 hover:bg-primary-light/30 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatMessage({
  message,
  onRetry,
}: {
  message: LocalChatMessage;
  onRetry?: () => void;
}) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white shadow-sm',
          isUser
            ? 'bg-primary'
            : 'bg-gradient-to-br from-ai-purple to-ai-cyan'
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>

      <div className={cn('min-w-0 max-w-[84%]', isUser && 'text-right')}>
        <div
          className={cn(
            'rounded-2xl px-3 py-2.5 text-left text-[13px] leading-6',
            isUser
              ? 'rounded-tr-md bg-primary text-white'
              : message.failed
                ? 'rounded-tl-md border border-red-200 bg-red-50 text-red-700'
                : 'rounded-tl-md border border-border bg-white text-text-primary shadow-sm'
          )}
        >
          {message.citedAnchor && isUser && (
            <div className="mb-1.5 flex items-center gap-1 border-b border-white/20 pb-1.5 text-[10px] opacity-80">
              <Quote className="h-3 w-3" />
              已引用原文段落
            </div>
          )}

          {message.content ? (
            isUser ? (
              <div className="whitespace-pre-wrap break-words">{message.content}</div>
            ) : (
              <MarkdownContent content={message.content} />
            )
          ) : (
            <ThinkingIndicator />
          )}

          {message.pending && message.content && (
            <span className="ml-0.5 inline-block h-3.5 w-1 animate-blink bg-ai-purple align-baseline" />
          )}
        </div>

        <div
          className={cn(
            'mt-1 flex items-center gap-2 px-1 text-[10px] text-text-tertiary',
            isUser && 'justify-end'
          )}
        >
          <span>{formatMessageTime(message.createdAt)}</span>
          {message.failed && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 text-red-600 hover:text-red-700"
            >
              <RefreshCw className="h-3 w-3" />
              重新编辑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex h-6 items-center gap-1" aria-label="AI 正在思考">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-ai-purple"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  );
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
