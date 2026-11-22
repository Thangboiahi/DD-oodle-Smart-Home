'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  touchTarget?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-foreground border border-accent-border hover:brightness-110 active:scale-[0.98]',
  accent:
    'bg-accent-soft text-accent border border-accent-border hover:bg-accent/20 active:scale-[0.98]',
  secondary:
    'bg-surface-muted text-foreground border border-border hover:border-border-strong hover:bg-surface-elevated active:scale-[0.98]',
  outline:
    'bg-transparent text-foreground border border-border hover:border-border-strong hover:bg-surface-elevated active:scale-[0.98]',
  ghost:
    'bg-transparent text-foreground-secondary border border-transparent hover:text-foreground hover:bg-surface-muted/80',
  danger:
    'bg-danger-soft text-danger border border-danger/35 hover:bg-danger/20 active:scale-[0.98]',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-[var(--dd-radius-control)]',
  md: 'h-9 px-3.5 text-xs font-medium gap-2 rounded-[var(--dd-radius-control)]',
  lg: 'h-11 px-4 text-sm font-medium gap-2 rounded-[var(--dd-radius-control)]',
  icon: 'h-9 w-9 p-0 rounded-[var(--dd-radius-control)]',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'secondary',
      size = 'md',
      loading = false,
      touchTarget = false,
      disabled,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-45 cursor-pointer select-none',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          touchTarget && 'min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0',
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
