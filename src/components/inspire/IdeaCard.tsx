import { AlertTriangle, ArrowRight, CheckCircle2, Sparkles, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MarkdownContent } from '@/components/common/MarkdownContent';
import { cn } from '@/lib/cn';
import type { Idea } from '@/types';

interface IdeaCardProps {
  idea: Idea;
  index: number;
  onDeepen?: () => void;
  onConfirm?: () => void;
  onDiscard?: () => void;
}

export function IdeaCard({ idea, index, onDeepen, onConfirm, onDiscard }: IdeaCardProps) {
  const isConfirmed = idea.status === 'confirmed';
  const isDiscarded = idea.status === 'discarded';

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-white shadow-card overflow-hidden',
        isDiscarded && 'opacity-50'
      )}
    >
      {/* 顶部渐变条 */}
      <div className="h-0.5 ai-gradient-bar" />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-ai-purple" />
            <span className="text-sm font-semibold text-text-primary">
              Idea 候选 #{index}
            </span>
          </div>
          {isConfirmed && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
              <CheckCircle2 className="h-3 w-3" /> 已标记待实验
            </span>
          )}
          {isDiscarded && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-text-tertiary">
              已放弃
            </span>
          )}
        </div>

        {/* 五字段 */}
        <div className="space-y-3.5">
          <Field label="💡 假设" content={idea.hypothesis} />
          <Field label="🔧 改动" content={idea.changes} accent="boxed" />
          <Field label="📚 来源" content={idea.sourceCitation} accent="link" />
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xxs uppercase tracking-wider text-text-tertiary font-semibold">
                可行性
              </span>
              <FeasibilityRating score={idea.feasibility} />
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xxs uppercase tracking-wider text-amber-700 font-semibold mb-1">
                风险
              </div>
              <div className="text-[13px] leading-relaxed text-amber-900">
                <MarkdownContent content={idea.risk} />
              </div>
            </div>
          </div>
        </div>

        {/* 操作 */}
        {!isConfirmed && !isDiscarded && (
          <div className="flex items-center gap-2 mt-5 pt-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={onDeepen}>
              <ArrowRight className="h-3.5 w-3.5" />
              继续深化
            </Button>
            <Button variant="success" size="sm" onClick={onConfirm}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              确认待实验
            </Button>
            <Button variant="danger-ghost" size="sm" onClick={onDiscard}>
              <XCircle className="h-3.5 w-3.5" />
              放弃
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  content,
  accent,
}: {
  label: string;
  content: string;
  accent?: 'boxed' | 'link';
}) {
  return (
    <div>
      <div className="text-xxs uppercase tracking-wider text-text-tertiary font-semibold mb-1">
        {label}
      </div>
      <div
        className={cn(
          'text-[13px] leading-relaxed text-text-primary',
          accent === 'boxed' && 'bg-gray-50 rounded p-3 border border-border',
          accent === 'link' && 'text-primary'
        )}
      >
        <MarkdownContent content={content} />
      </div>
    </div>
  );
}

function FeasibilityRating({ score }: { score: number }) {
  const total = 5;
  const label = ['很低', '较低', '中等', '较高', '很高'][Math.min(score - 1, 4)] || '未评';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              i < score ? 'bg-primary' : 'bg-gray-200'
            )}
          />
        ))}
      </div>
      <span className="text-xs text-text-secondary">{label}</span>
    </div>
  );
}
