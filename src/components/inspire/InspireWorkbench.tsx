import { useEffect, useRef, useState } from 'react';
import { Bot, Code2, FileText, Rocket, Send, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input, Textarea } from '@/components/ui/Input';
import { EmptyState } from '@/components/common/EmptyState';
import { IdeaCard } from './IdeaCard';
import { AnchorHistory } from './AnchorHistory';
import { useSelectionStore } from '@/stores/useSelectionStore';
import {
  useGenerateIdea,
  useIdeaMessages,
  useRemoveAnchor,
  useSendIdeaMessage,
  useUpdateIdeaStatus,
} from '@/hooks/useIdeas';
import type { Anchor, Idea } from '@/types';
import { truncate } from '@/lib/format';

export function InspireWorkbench() {
  const selectedPapers = useSelectionStore((s) => s.list());
  const removeSelected = useSelectionStore((s) => s.remove);
  const clearSelected = useSelectionStore((s) => s.clear);

  const [scenario, setScenario] = useState('');
  const [codeRef, setCodeRef] = useState('');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [chatInput, setChatInput] = useState('');

  // 当前活跃的 Idea（新消息发送到这个）
  const activeIdea = ideas[ideas.length - 1] ?? null;

  const generateMutation = useGenerateIdea();
  const updateStatusMutation = useUpdateIdeaStatus();
  const sendMsgMutation = useSendIdeaMessage();
  const removeAnchorMutation = useRemoveAnchor();

  const { data: messages } = useIdeaMessages(activeIdea?.id ?? null);

  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages?.length]);

  const canGenerate =
    selectedPapers.length > 0 && scenario.trim().length > 0 && !generateMutation.isPending;

  const handleGenerate = async () => {
    if (!canGenerate) {
      if (selectedPapers.length === 0) toast.error('请先勾选灵感来源论文');
      else if (!scenario.trim()) toast.error('请填写业务场景');
      return;
    }
    try {
      const idea = await generateMutation.mutateAsync({
        paperIds: selectedPapers.map((p) => p.id),
        scenario,
        codeRef: codeRef || undefined,
        anchorContents: anchors.map((a) => a.content),
      });
      setIdeas((prev) => [...prev, idea]);
      toast.success('Idea 已生成');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '生成失败，请重试'
      );
    }
  };

  const handleIdeaStatus = async (
    idea: Idea,
    status: 'confirmed' | 'discarded'
  ) => {
    try {
      const updated = await updateStatusMutation.mutateAsync({
        id: idea.id,
        status,
      });
      setIdeas((prev) => prev.map((i) => (i.id === idea.id ? updated : i)));
      if (status === 'confirmed') {
        toast.success('已标记为待实验');
      } else {
        toast.info('已放弃该 Idea');
      }
    } catch {
      toast.error('操作失败');
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !activeIdea) return;
    const content = chatInput.trim();
    setChatInput('');
    try {
      const res = await sendMsgMutation.mutateAsync({
        ideaId: activeIdea.id,
        content,
      });
      if (res.anchor) {
        setAnchors((prev) => [...prev, res.anchor!]);
      }
    } catch {
      toast.error('发送失败');
    }
  };

  const handleRemoveAnchor = async (id: string) => {
    try {
      await removeAnchorMutation.mutateAsync(id);
      setAnchors((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast.error('删除失败');
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-page overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full p-6 space-y-5">
        {/* 已选灵感来源 */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xxs uppercase tracking-wider text-text-tertiary font-semibold flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              已选灵感来源
              <span className="text-primary">({selectedPapers.length})</span>
            </div>
            {selectedPapers.length > 0 && (
              <button
                onClick={clearSelected}
                className="text-xs text-text-tertiary hover:text-danger transition-colors"
              >
                清空
              </button>
            )}
          </div>
          <div className="rounded-md border border-dashed border-border bg-white/60 p-3 min-h-[52px] flex flex-wrap gap-2">
            {selectedPapers.length === 0 ? (
              <div className="text-xs text-text-tertiary italic w-full text-center py-2">
                从左侧目录树勾选论文添加到这里
              </div>
            ) : (
              selectedPapers.map((p) => (
                <Chip
                  key={p.id}
                  variant="primary"
                  size="md"
                  onRemove={() => removeSelected(p.id)}
                >
                  {truncate(p.title, 28)}
                </Chip>
              ))
            )}
          </div>
        </section>

        {/* 业务场景 */}
        <section>
          <div className="text-xxs uppercase tracking-wider text-text-tertiary font-semibold mb-2">
            业务场景
          </div>
          <Textarea
            placeholder="描述你的业务背景、当前问题、约束条件…例如：精排多目标学习中，collect 样本量少，希望通过序列建模引入更多监督信号。"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            className="min-h-[80px]"
          />
        </section>

        {/* 关联代码 */}
        <section>
          <div className="text-xxs uppercase tracking-wider text-text-tertiary font-semibold mb-2 flex items-center gap-1.5">
            <Code2 className="h-3.5 w-3.5" />
            关联代码（可选）
          </div>
          <Input
            placeholder="文件名或路径，例如: graviton_model.py"
            value={codeRef}
            onChange={(e) => setCodeRef(e.target.value)}
          />
        </section>

        {/* 生成按钮 */}
        <Button
          size="lg"
          className="w-full"
          onClick={handleGenerate}
          loading={generateMutation.isPending}
          disabled={!canGenerate && !generateMutation.isPending}
        >
          {!generateMutation.isPending && <Rocket className="h-4 w-4" />}
          {generateMutation.isPending
            ? '正在阅读全文并生成 Idea…'
            : '基于已选论文生成 Idea'}
        </Button>

        {/* Idea 列表 */}
        {ideas.length === 0 && !generateMutation.isPending && (
          <EmptyState
            icon={<Rocket className="h-10 w-10" />}
            title="还没有生成 Idea"
            description="勾选论文 + 填写业务场景后，点击上方按钮开始生成"
            className="py-10"
          />
        )}

        {ideas.map((idea, i) => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            index={i + 1}
            onDeepen={() =>
              toast.info('请在下方对话框输入你的判断或约束')
            }
            onConfirm={() => handleIdeaStatus(idea, 'confirmed')}
            onDiscard={() => handleIdeaStatus(idea, 'discarded')}
          />
        ))}

        {/* 对话式迭代（只在生成过 Idea 后显示） */}
        {activeIdea && (
          <section className="pt-4 border-t border-border">
            <div className="text-xxs uppercase tracking-wider text-text-tertiary font-semibold mb-3">
              对话式迭代
            </div>

            <div className="space-y-3 mb-4">
              {(messages ?? []).map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-white text-xs ${
                      m.role === 'user'
                        ? 'bg-primary'
                        : 'bg-gradient-to-br from-ai-purple to-ai-cyan'
                    }`}
                  >
                    {m.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-primary text-white'
                        : 'bg-white border border-border'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            <AnchorHistory
              anchors={anchors}
              onRemove={handleRemoveAnchor}
              className="mb-3"
            />

            {/* 输入框 */}
            <div className="flex gap-2">
              <Input
                placeholder="输入你的判断或约束，如：延迟要 <50ms"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="flex-1"
              />
              <Button
                onClick={handleSendMessage}
                loading={sendMsgMutation.isPending}
                disabled={!chatInput.trim()}
              >
                <Send className="h-3.5 w-3.5" />
                发送
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
