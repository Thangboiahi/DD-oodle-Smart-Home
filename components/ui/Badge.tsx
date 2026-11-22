'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'mono';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  pulse?: boolean;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-muted text-foreground-secondary border-border',
  accent: 'bg-accent-soft text-accent border-accent-border',
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger: 'bg-danger-soft text-danger border-danger/35',
  mono: 'bg-surface-elevated text-foreground-secondary border-border font-mono tracking-tight',
};

const DOT_STYLES: Record<BadgeVariant, string> = {
  neutral: 'bg-foreground-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  mono: 'bg-foreground-secondary',
};

export function Badge({
  className,
  variant = 'neutral',
  dot = false,
  pulse = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-tight tabular-nums',
        VARIANT_STYLES[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full shrink-0',
            DOT_STYLES[variant],
            pulse && 'animate-pulse'
          )}
        />
      )}
      {children}
    </span>
  );
}
