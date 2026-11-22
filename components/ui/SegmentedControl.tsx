'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

/**
 * Precision Segmented Control & Stepped Selector (e.g. 0–4 fan speeds, tab bars)
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  fullWidth = false,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-[var(--dd-radius-control)] border border-border bg-surface-muted/80 p-0.5',
        fullWidth && 'w-full',
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative inline-flex items-center justify-center gap-1.5 rounded-[calc(var(--dd-radius-control)-2px)] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 cursor-pointer select-none tabular-nums',
              fullWidth && 'flex-1',
              size === 'sm' ? 'min-h-[32px] px-2.5 text-[11px]' : 'min-h-[38px] md:min-h-[34px] px-3 text-xs',
              active
                ? 'bg-surface text-foreground border border-border-strong shadow-xs'
                : 'text-foreground-secondary hover:text-foreground border border-transparent',
              opt.disabled && 'opacity-40 pointer-events-none'
            )}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span className="truncate">{opt.label}</span>
            {opt.badge !== undefined && (
              <span
                className={cn(
                  'rounded px-1 py-0.2 text-[10px] font-mono',
                  active ? 'bg-accent-soft text-accent' : 'bg-surface-elevated text-foreground-muted'
                )}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
