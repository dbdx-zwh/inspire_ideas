import { MapPin, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Anchor } from '@/types';

interface AnchorHistoryProps {
  anchors: Anchor[];
  onRemove?: (id: string) => void;
  className?: string;
}

export function AnchorHistory({ anchors, onRemove, className }: AnchorHistoryProps) {
  if (anchors.length === 0) return null;
  return (
    <div className={cn('rounded-md border border-border bg-gray-50/50 p-3', className)}>
      <div className="flex items-center gap-1.5 mb-2">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-text-primary">
          锚点历史 ({anchors.length})
        </span>
      </div>
      <div className="space-y-1.5">
        {anchors.map((a, i) => (
          <div
            key={a.id}
            className="flex items-start gap-2 text-xs bg-white border border-border rounded px-2 py-1.5"
          >
            <span className="text-primary font-semibold flex-shrink-0">
              ①{i > 0 ? '+' + i : ''}
            </span>
            <span className="flex-1 text-text-primary leading-relaxed">
              {a.content}
            </span>
            {onRemove && (
              <button
                onClick={() => onRemove(a.id)}
                className="flex-shrink-0 text-text-tertiary hover:text-danger transition-colors"
                aria-label="删除锚点"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
