'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface PrecisionSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  ticks?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Precision Custom Range Slider (0–100% dimmers/covers) with haptic-style visual ticks
 */
export const PrecisionSlider: React.FC<PrecisionSliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  unit = '%',
  ticks = 11,
  disabled = false,
  className,
}) => {
  const clamped = Math.min(max, Math.max(min, value));
  const pct = max === min ? 0 : ((clamped - min) / (max - min)) * 100;

  return (
    <div className={cn('space-y-2', disabled && 'opacity-50 pointer-events-none', className)}>
      {(label || unit) && (
        <div className="flex items-center justify-between gap-2 text-xs">
          {label ? <span className="font-medium text-foreground-secondary">{label}</span> : <span />}
          <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
            {clamped}
            {unit}
          </span>
        </div>
      )}

      <div className="relative flex items-center h-8">
        {/* Track background */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-surface-muted border border-border overflow-hidden">
          <div
            className="h-full bg-accent transition-[width] duration-75"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Native accessible range input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={clamped}
          disabled={disabled}
          aria-label={label ?? 'Precision slider'}
          onChange={(e) => onChange(Number(e.target.value))}
          className="dd-range relative z-10 w-full h-8"
        />
      </div>

      {/* Haptic-style visual ticks */}
      {ticks > 1 && (
        <div className="flex items-center justify-between px-1" aria-hidden="true">
          {Array.from({ length: ticks }).map((_, idx) => {
            const tickPct = (idx / (ticks - 1)) * 100;
            const active = tickPct <= pct;
            const isMajor = idx === 0 || idx === ticks - 1 || idx === Math.floor((ticks - 1) / 2);
            return (
              <span
                key={idx}
                className={cn(
                  'w-px transition-colors',
                  isMajor ? 'h-2' : 'h-1',
                  active ? 'bg-accent/80' : 'bg-border-strong'
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
