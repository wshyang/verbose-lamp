import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'panel' | 'selected' | 'accent' | 'quiet';
export type ButtonSize = 'compact' | 'small' | 'control' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANTS: Record<ButtonVariant, string> = {
  panel:
    'bg-[var(--ui-surface)] border-[var(--ui-border)] text-[var(--ui-foreground)] hover:bg-[var(--ui-surface-hover)] hover:border-[var(--ui-accent-bright)] backdrop-blur-sm',
  selected:
    'bg-[var(--ui-selected-bg)] border-[var(--ui-accent-bright)] text-[var(--ui-foreground-bright)] shadow-[0_0_14px_var(--ui-selected-glow)]',
  accent:
    'ui-button-accent border-[var(--ui-accent-bright)] text-[var(--ui-accent-contrast)] hover:brightness-110 shadow-[0_0_24px_var(--ui-accent-glow)]',
  quiet:
    'border-transparent bg-transparent text-[var(--ui-accent)] hover:bg-[var(--ui-surface-hover-soft)] hover:text-[var(--ui-foreground-bright)]',
};

const SIZES: Record<ButtonSize, string> = {
  compact: 'px-3 py-1.5 text-[11px] tracking-[0.18em] uppercase',
  small: 'px-2.5 py-1 text-[10px] tracking-[0.16em] uppercase',
  control: 'px-4 py-2.5 text-xs tracking-[0.18em] uppercase',
  icon: 'h-8 w-8 p-1.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { type = 'button', variant = 'panel', size = 'compact', className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 border font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] focus-visible:outline-offset-2',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  );
});