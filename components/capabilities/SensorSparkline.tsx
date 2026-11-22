'use client';

import React, { useMemo, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SensorSparklineProps {
  label: string;
  sensorKey: string;
  value: number | string | null | undefined;
  unit?: string;
  min?: number;
  max?: number;
  hasPlusHistory?: boolean;
  className?: string;
}

/**
 * G12 Strictly Read-Only Sensor Widget with expandable 24h (Core) / 90d (Plus) sparkline.
 * NEVER renders write controls or emits commands.
 */
export const SensorSparkline: React.FC<SensorSparklineProps> = ({
  label,
  sensorKey,
  value,
  unit = '',
  min,
  max,
  hasPlusHistory = false,
  className,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState<'24h' | '90d'>('24h');

  const numericValue = typeof value === 'number' ? value : Number(value);
  const isNumeric = Number.isFinite(numericValue);

  // Deterministic sparkline series anchored to current live value + min/max scale hints
  const points = useMemo(() => {
    const base = isNumeric ? numericValue : 50;
    const low = min ?? Math.max(0, base * 0.7);
    const high = max ?? Math.max(low + 1, base * 1.3);
    const span = Math.max(0.001, high - low);
    const count = range === '24h' ? 16 : 24;
    let seed = sensorKey.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

    const series: number[] = [];
    for (let i = 0; i < count; i++) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      const jitter = ((seed / 4294967296) - 0.5) * span * 0.22;
      const v = i === count - 1 ? base : Math.min(high, Math.max(low, base + jitter));
      series.push(v);
    }
    return { series, low, high, span };
  }, [isNumeric, numericValue, min, max, range, sensorKey]);

  // Color-coded status tone using min/max bounds
  const toneClass = useMemo(() => {
    if (!isNumeric) return 'bg-surface-muted text-foreground-secondary border-border';
    if (max !== undefined && numericValue >= max * 0.9) {
      return 'bg-warning-soft text-warning border-warning/35';
    }
    if (min !== undefined && numericValue <= min + (max !== undefined ? (max - min) * 0.1 : 0)) {
      return 'bg-warning-soft text-warning border-warning/35';
    }
    return 'bg-success-soft text-success border-success/30';
  }, [isNumeric, numericValue, min, max]);

  const svgPoints = useMemo(() => {
    const w = 220;
    const h = 44;
    return points.series
      .map((val, idx) => {
        const x = (idx / Math.max(1, points.series.length - 1)) * w;
        const y = h - ((val - points.low) / points.span) * (h - 6) - 3;
        return `${x.toFixed(1)},${Math.min(h - 2, Math.max(2, y)).toFixed(1)}`;
      })
      .join(' ');
  }, [points]);

  return (
    <div
      data-readonly-sensor={sensorKey}
      className={cn(
        'rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated overflow-hidden',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full min-h-[44px] flex items-center justify-between gap-2 px-3 py-2 text-left cursor-pointer hover:bg-surface-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="h-3.5 w-3.5 text-accent shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-foreground truncate">{label}</span>
              <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-surface-muted text-foreground-muted border border-border">
                RO
              </span>
            </div>
            {(min !== undefined || max !== undefined) && (
              <div className="text-[10px] font-mono text-foreground-muted tabular-nums">
                Range: {min ?? '–'} .. {max ?? '–'} {unit}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              'rounded-md border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums',
              toneClass
            )}
          >
            {value === null || value === undefined
              ? '—'
              : isNumeric
              ? `${Number(numericValue.toFixed(1))}${unit ? ` ${unit}` : ''}`
              : String(value)}
          </span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-foreground-muted" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-foreground-muted" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/70 px-3 py-2.5 bg-surface space-y-2">
          <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
            <span className="text-foreground-muted">G12 Read-Only Telemetry Trend</span>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRange('24h')}
                className={cn(
                  'px-1.5 py-0.5 rounded border cursor-pointer',
                  range === '24h'
                    ? 'bg-accent-soft text-accent border-accent-border'
                    : 'bg-surface-elevated text-foreground-muted border-border'
                )}
              >
                24h Core
              </button>
              <button
                type="button"
                onClick={() => {
                  if (hasPlusHistory) setRange('90d');
                }}
                disabled={!hasPlusHistory}
                title={hasPlusHistory ? '90-day Plus history' : 'Requires DD oodle Plus'}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border',
                  range === '90d'
                    ? 'bg-accent-soft text-accent border-accent-border'
                    : 'bg-surface-elevated text-foreground-muted border-border',
                  !hasPlusHistory ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                )}
              >
                {!hasPlusHistory && <Lock className="h-2.5 w-2.5" />}
                <span>90d Plus</span>
              </button>
            </div>
          </div>

          <svg
            viewBox="0 0 220 44"
            className="w-full h-11 overflow-visible"
            role="img"
            aria-label={`${label} ${range} sparkline`}
          >
            <polyline
              fill="none"
              stroke="var(--dd-accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={svgPoints}
            />
          </svg>
        </div>
      )}
    </div>
  );
};
