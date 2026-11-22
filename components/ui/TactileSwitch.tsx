'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Check, Hand, Loader2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from './haptics';

export interface TactileSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  sublabel?: string;
  pending?: boolean;
  acked?: boolean;
  manualOverride?: boolean;
  locked?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/**
 * Tactile Industrial Switch (>= 44px mobile touch target)
 * Supports optimistic state, snappy micro-spring thumb, pending spinner,
 * hardware `ack` indicator, and manual wall-switch override badge.
 */
export const TactileSwitch: React.FC<TactileSwitchProps> = ({
  checked,
  onChange,
  label,
  sublabel,
  pending = false,
  acked = false,
  manualOverride = false,
  locked = false,
  disabled = false,
  className,
  id,
}) => {
  const isDisabled = disabled || locked;

  return (
    <motion.button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={isDisabled}
      whileTap={isDisabled ? undefined : { scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 600, damping: 35 }}
      onClick={() => {
        if (!isDisabled) {
          triggerHaptic('tap');
          onChange(!checked);
        }
      }}
      className={cn(
        'group w-full min-h-[44px] flex items-center justify-between gap-3 rounded-[var(--dd-radius-control)] border px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 select-none cursor-pointer',
        checked
          ? 'bg-accent-soft/70 border-accent-border text-foreground'
          : 'bg-surface-elevated border-border hover:border-border-strong text-foreground',
        isDisabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {label && <span className="text-xs font-medium truncate">{label}</span>}
          {manualOverride && (
            <span
              title="Manual wall-switch override active"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono bg-warning-soft text-warning border border-warning/30"
            >
              <Hand className="h-2.5 w-2.5" />
              <span>MANUAL</span>
            </span>
          )}
          {locked && (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono bg-danger-soft text-danger border border-danger/30"
            >
              <Lock className="h-2.5 w-2.5" />
              <span>LOCKED</span>
            </span>
          )}
        </div>
        {sublabel && (
          <div className="text-[11px] text-foreground-muted font-mono tabular-nums truncate mt-0.5">
            {sublabel}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Hardware ACK / Pending indicator */}
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 text-accent animate-spin" aria-label="Command pending" />
        ) : acked ? (
          <span
            title="Hardware ACK confirmed"
            className="inline-flex items-center gap-0.5 text-[10px] font-mono text-tertiary"
          >
            <Check className="h-3 w-3" />
            <span className="hidden sm:inline">ACK</span>
          </span>
        ) : null}

        {/* Physical toggle track */}
        <span
          aria-hidden="true"
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition-colors duration-150',
            checked
              ? 'bg-accent border-accent-border justify-end'
              : 'bg-surface-muted border-border-strong justify-start'
          )}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 560, damping: 34 }}
            className={cn(
              'inline-block h-4 w-4 rounded-full',
              checked ? 'bg-accent-foreground' : 'bg-foreground-secondary'
            )}
          />
        </span>
      </div>
    </motion.button>
  );
};
