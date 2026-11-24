'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from './haptics';

export interface ThemedCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  variant?: 'inline' | 'card';
  'aria-label'?: string;
}

/**
 * Custom Accessible ThemedCheckbox (Zero native `<input type="checkbox">`)
 */
export const ThemedCheckbox: React.FC<ThemedCheckboxProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  className,
  variant = 'inline',
  'aria-label': ariaLabel,
}) => {
  const toggle = () => {
    if (disabled) return;
    triggerHaptic('tap');
    onChange(!checked);
  };

  return (
    <button
      id={id}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={toggle}
      className={cn(
        'group flex items-start gap-2.5 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 select-none',
        variant === 'card'
          ? cn(
              'w-full rounded-[var(--dd-radius-control)] border p-3',
              checked
                ? 'border-accent-border bg-accent-soft/45'
                : 'border-border bg-surface-elevated hover:border-border-strong'
            )
          : 'py-1',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-colors duration-150',
          checked
            ? 'border-[var(--dd-color-1-border)] bg-[var(--dd-color-1)] text-[var(--dd-color-1-fg)] shadow-sm'
            : 'border-border-strong bg-surface group-hover:border-accent/70'
        )}
      >
        <motion.span
          initial={false}
          animate={{ scale: checked ? 1 : 0.4, opacity: checked ? 1 : 0 }}
          transition={{ type: 'spring', stiffness: 560, damping: 30 }}
        >
          <Check className="h-3 w-3 stroke-[3]" />
        </motion.span>
      </span>

      {(label || description) && (
        <span className="min-w-0 flex-1">
          {label && (
            <span className="block text-xs font-medium text-foreground leading-snug">
              {label}
            </span>
          )}
          {description && (
            <span className="block text-[11px] text-foreground-muted mt-0.5 leading-snug">
              {description}
            </span>
          )}
        </span>
      )}
    </button>
  );
};
