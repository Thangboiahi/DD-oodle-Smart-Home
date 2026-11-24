'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ThemedDatePicker, ThemedTimePicker } from './ThemedDateTimePickers';

export interface DateTimeCronValue {
  time: string; // HH:MM
  days: number[]; // 0=Sun..6=Sat
  date?: string; // optional YYYY-MM-DD for one-shot
}

export interface DateTimeCronInputProps {
  value: DateTimeCronValue;
  onChange: (next: DateTimeCronValue) => void;
  showDate?: boolean;
  label?: string;
  className?: string;
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const PRESETS: Array<{ label: string; time: string; days: number[] }> = [
  { label: 'Daily 06:30', time: '06:30', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Weekdays 07:00', time: '07:00', days: [1, 2, 3, 4, 5] },
  { label: 'Sunset 18:15', time: '18:15', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Night 23:00', time: '23:00', days: [0, 1, 2, 3, 4, 5, 6] },
];

/**
 * Date / Time / Cron Schedule Selector with quick presets and weekday chips
 */
export const DateTimeCronInput: React.FC<DateTimeCronInputProps> = ({
  value,
  onChange,
  showDate = false,
  label,
  className,
}) => {
  const cronExpression = useMemo(() => {
    const [hh = '06', mm = '30'] = (value.time || '06:30').split(':');
    const dayPart =
      value.days.length === 7
        ? '*'
        : value.days.length === 0
        ? '*'
        : [...value.days].sort((a, b) => a - b).join(',');
    return `${parseInt(mm, 10) || 0} ${parseInt(hh, 10) || 0} * * ${dayPart}`;
  }, [value]);

  const toggleDay = (day: number) => {
    const exists = value.days.includes(day);
    const nextDays = exists ? value.days.filter((d) => d !== day) : [...value.days, day];
    onChange({ ...value, days: nextDays });
  };

  return (
    <div className={cn('space-y-3 rounded-[var(--dd-radius-card)] border border-border bg-surface-elevated p-3', className)}>
      {label && <div className="text-xs font-medium text-foreground">{label}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-32">
          <ThemedTimePicker
            value={value.time}
            onChange={(nextTime) => onChange({ ...value, time: nextTime })}
            ariaLabel="Schedule time"
          />
        </div>

        {showDate && (
          <ThemedDatePicker
            value={value.date ?? ''}
            onChange={(nextDate) => onChange({ ...value, date: nextDate })}
            ariaLabel="Schedule date"
          />
        )}

        <span className="ml-auto rounded border border-border bg-surface px-2 py-1 font-mono text-[11px] text-accent tabular-nums">
          CRON: {cronExpression}
        </span>
      </div>

      {/* Weekday selector */}
      <div className="flex items-center gap-1 flex-wrap">
        {DAY_LABELS.map((dayLabel, idx) => {
          const active = value.days.includes(idx);
          return (
            <button
              key={dayLabel}
              type="button"
              onClick={() => toggleDay(idx)}
              className={cn(
                'h-8 w-8 rounded-md border text-[11px] font-mono font-medium transition-colors cursor-pointer',
                active
                  ? 'bg-accent-soft border-accent-border text-accent'
                  : 'bg-surface border-border text-foreground-muted hover:text-foreground'
              )}
            >
              {dayLabel}
            </button>
          );
        })}
      </div>

      {/* Quick Presets */}
      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/60">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange({ ...value, time: preset.time, days: preset.days })}
            className="rounded-md border border-border bg-surface hover:border-border-strong px-2 py-1 text-[11px] text-foreground-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
};
