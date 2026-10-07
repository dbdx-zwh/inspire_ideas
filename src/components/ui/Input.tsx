import * as React from 'react';
import { cn } from '@/lib/cn';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, leftIcon, rightIcon, ...props }, ref) => {
    if (leftIcon || rightIcon) {
      return (
        <div className={cn('relative flex items-center w-full', className)}>
          {leftIcon && (
            <span className="absolute left-3 text-text-tertiary pointer-events-none">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            className={cn(
              'w-full h-9 rounded-md border border-border bg-white text-sm',
              'placeholder:text-text-tertiary',
              'focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none',
              'transition-colors',
              leftIcon ? 'pl-9' : 'pl-3',
              rightIcon ? 'pr-9' : 'pr-3'
            )}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 text-text-tertiary">
              {rightIcon}
            </span>
          )}
        </div>
      );
    }
    return (
      <input
        ref={ref}
        className={cn(
          'w-full h-9 rounded-md border border-border bg-white px-3 text-sm',
          'placeholder:text-text-tertiary',
          'focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none',
          'transition-colors',
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-md border border-border bg-white px-3 py-2 text-sm',
      'placeholder:text-text-tertiary resize-y min-h-[80px]',
      'focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none',
      'transition-colors',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
