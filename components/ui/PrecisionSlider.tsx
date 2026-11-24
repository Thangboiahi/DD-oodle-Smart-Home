'use client';

import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface PrecisionSliderProps {
  value: number;
  onChange: (value: number) => void;
  onRelease?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  ticks?: number;
  compact?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * Precision Custom Range Slider (Zero native `<input type="range">`)
 * Supports pointer capture dragging, keyboard accessibility (`role="slider"`),
 * optional haptic ticks, compact tray mode, and `onRelease` callback.
 */
export const PrecisionSlider: React.FC<PrecisionSliderProps> = ({
  value,
  onChange,
  onRelease,
  min = 0,
  max = 100,
  step = 1,
  label,
  unit = '%',
  ticks = 11,
  compact = false,
  disabled = false,
  ariaLabel,
  className,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const clamped = Math.min(max, Math.max(min, value));
  const span = max - min;
  const pct = span <= 0 ? 0 : ((clamped - min) / span) * 100;

  const snapValue = (raw: number): number => {
    const safeStep = step > 0 ? step : 1;
    const stepped = Math.round((raw - min) / safeStep) * safeStep + min;
    const decimals = (safeStep.toString().split('.')[1] || '').length;
    const rounded = Number(stepped.toFixed(decimals));
    return Math.min(max, Math.max(min, rounded));
  };

  const valueFromClientX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el || span <= 0) return clamped;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return clamped;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return snapValue(min + ratio * span);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    const next = valueFromClientX(e.clientX);
    if (next !== clamped) onChange(next);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || disabled) return;
    const next = valueFromClientX(e.clientX);
    if (next !== clamped) onChange(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const finalVal = valueFromClientX(e.clientX);
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (finalVal !== clamped) onChange(finalVal);
    onRelease?.(finalVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const safeStep = step > 0 ? step : 1;
    const bigStep = safeStep * 5;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      next = snapValue(clamped + safeStep);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      next = snapValue(clamped - safeStep);
    } else if (e.key === 'PageUp') {
      next = snapValue(clamped + bigStep);
    } else if (e.key === 'PageDown') {
      next = snapValue(clamped - bigStep);
    } else if (e.key === 'Home') {
      next = min;
    } else if (e.key === 'End') {
      next = max;
    }
    if (next !== null) {
      e.preventDefault();
      onChange(next);
      onRelease?.(next);
    }
  };

  return (
    <div
      className={cn(
        compact ? 'space-y-1' : 'space-y-2',
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
    >
      {(label || unit) && (
        <div className="flex items-center justify-between gap-2 text-xs">
          {label ? (
            <span className="font-medium text-foreground-secondary truncate">{label}</span>
          ) : (
            <span />
          )}
          <span className="font-mono text-xs font-semibold text-foreground tabular-nums shrink-0">
            {clamped}
            {unit}
          </span>
        </div>
      )}

      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel ?? label ?? 'Precision slider'}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={`${clamped}${unit}`}
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          setDragging(false);
          onRelease?.(clamped);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative flex items-center touch-none select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-full',
          compact ? 'h-6' : 'h-8'
        )}
      >
        {/* Track Background + Active Fill */}
        <div className="relative w-full h-1.5 rounded-full bg-surface-muted border border-border overflow-hidden">
          <div
            className="h-full bg-[var(--dd-color-1)] transition-[width] duration-75"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Custom Thumb */}
        <span
          aria-hidden="true"
          style={{ left: `${pct}%` }}
          className={cn(
            'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--dd-color-1)] border-2 border-surface shadow-[0_0_0_1px_var(--dd-color-1-border)] transition-transform duration-100 pointer-events-none',
            compact ? 'h-4 w-4' : 'h-[18px] w-[18px]',
            dragging && 'scale-125 shadow-md'
          )}
        />
      </div>

      {/* Haptic-style visual ticks */}
      {!compact && ticks > 1 && (
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
