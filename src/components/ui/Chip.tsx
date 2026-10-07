import * as React from 'react';
import { X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const chipVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors max-w-full',
  {
    variants: {
      variant: {
        default: 'bg-gray-100 text-text-secondary',
        primary: 'bg-primary-light text-primary',
        arxiv: 'bg-gray-100 text-text-secondary',
        blogger: 'bg-indigo-50 text-primary',
        ai: 'bg-violet-50 text-violet-700',
        success: 'bg-emerald-50 text-emerald-700',
        warning: 'bg-amber-50 text-amber-700',
        danger: 'bg-red-50 text-red-700',
      },
      size: {
        sm: 'px-2 py-0.5 text-xxs',
        md: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1 text-[13px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {
  onRemove?: () => void;
}

/**
 * 用 forwardRef 让 Chip 能与 Radix Tooltip/Popover 的 asChild 模式配合
 */
export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, variant, size, children, onRemove, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(chipVariants({ variant, size }), className)}
        {...props}
      >
        <span className="truncate">{children}</span>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="ml-0.5 flex-shrink-0 hover:opacity-70"
            aria-label="移除"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  }
);
Chip.displayName = 'Chip';
