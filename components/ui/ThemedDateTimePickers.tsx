'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Calendar, ChevronLeft, ChevronRight, Clock, Minus, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ThemedTimePickerProps {
  value: string; // HH:MM
  onChange: (nextTime: string) => void;
  label?: string;
  ariaLabel?: string;
  className?: string;
}

const TIME_PRESETS = ['06:00', '06:30', '08:00', '18:15', '21:30', '23:00'];

/**
 * Custom Themed Time Picker (Zero native `<input type="time">`)
 */
export const ThemedTimePicker: React.FC<ThemedTimePickerProps> = ({
  value,
  onChange,
  label,
  ariaLabel,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean }>({
    top: 0,
    left: 0,
    openUp: false,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [hhStr = '06', mmStr = '30'] = (value || '06:30').split(':');
  const hh = Math.max(0, Math.min(23, parseInt(hhStr, 10) || 0));
  const mm = Math.max(0, Math.min(59, parseInt(mmStr, 10) || 0));

  const formatTime = (h: number, m: number) =>
    `${String(((h % 24) + 24) % 24).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;

  useEffect(() => {
    setMounted(true);
  }, []);

  const syncPos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 264;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const openUp = spaceBelow < 260 && rect.top > spaceBelow;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = openUp ? rect.top - 6 : rect.bottom + 6;
    setCoords({ top, left, openUp });
  };

  useEffect(() => {
    if (!open) return;
    syncPos();
    const onOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', syncPos);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', syncPos);
    };
  }, [open]);

  return (
    <div className={cn('relative inline-block w-full', className)}>
      {label && (
        <span className="block text-[10px] font-mono uppercase text-foreground-muted mb-1">
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel ?? label ?? 'Select time'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full h-9 flex items-center justify-between gap-2 rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated hover:border-border-strong px-2.5 font-mono text-xs text-foreground tabular-nums transition-colors cursor-pointer',
          open && 'border-accent ring-1 ring-accent/40'
        )}
      >
        <span className="inline-flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-accent shrink-0" />
          <span>{formatTime(hh, mm)}</span>
        </span>
        <span className="text-[10px] text-foreground-muted">24H</span>
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: coords.openUp ? 6 : -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: coords.openUp ? 4 : -4, scale: 0.97 }}
                transition={{ duration: 0.14 }}
                style={{
                  position: 'fixed',
                  top: coords.openUp ? undefined : coords.top,
                  bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
                  left: coords.left,
                  width: 264,
                }}
                className="z-[130] rounded-2xl border border-border-strong bg-surface shadow-2xl p-3 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-foreground-muted">
                    Select Time (24h)
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close time picker"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface-elevated text-foreground-muted cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Segmented Hour + Minute Stepper Wheel */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-border bg-surface-elevated p-2 flex flex-col items-center gap-1.5">
                    <span className="text-[9px] font-mono uppercase text-foreground-muted">
                      Hour
                    </span>
                    <button
                      type="button"
                      onClick={() => onChange(formatTime(hh + 1, mm))}
                      aria-label="Increment hour"
                      className="h-7 w-full rounded-md border border-border bg-surface hover:border-accent flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <span className="text-lg font-mono font-bold text-accent tabular-nums">
                      {String(hh).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      onClick={() => onChange(formatTime(hh - 1, mm))}
                      aria-label="Decrement hour"
                      className="h-7 w-full rounded-md border border-border bg-surface hover:border-accent flex items-center justify-center cursor-pointer"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="rounded-xl border border-border bg-surface-elevated p-2 flex flex-col items-center gap-1.5">
                    <span className="text-[9px] font-mono uppercase text-foreground-muted">
                      Minute
                    </span>
                    <button
                      type="button"
                      onClick={() => onChange(formatTime(hh, mm + 5))}
                      aria-label="Increment 5 minutes"
                      className="h-7 w-full rounded-md border border-border bg-surface hover:border-accent flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <span className="text-lg font-mono font-bold text-foreground tabular-nums">
                      {String(mm).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      onClick={() => onChange(formatTime(hh, mm - 5))}
                      aria-label="Decrement 5 minutes"
                      className="h-7 w-full rounded-md border border-border bg-surface hover:border-accent flex items-center justify-center cursor-pointer"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Minute Fine Pills */}
                <div className="grid grid-cols-4 gap-1 font-mono text-[10px]">
                  {[0, 15, 30, 45].map((mOpt) => (
                    <button
                      key={mOpt}
                      type="button"
                      onClick={() => onChange(formatTime(hh, mOpt))}
                      className={cn(
                        'h-7 rounded-md border cursor-pointer tabular-nums',
                        mm === mOpt
                          ? 'border-accent bg-accent-soft text-accent font-semibold'
                          : 'border-border bg-surface-elevated text-foreground-secondary hover:text-foreground'
                      )}
                    >
                      :{String(mOpt).padStart(2, '0')}
                    </button>
                  ))}
                </div>

                {/* Indian Schedule Presets */}
                <div className="pt-2 border-t border-border/60 grid grid-cols-3 gap-1 font-mono text-[10px]">
                  {TIME_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        onChange(p);
                        setOpen(false);
                      }}
                      className={cn(
                        'h-7 rounded-md border cursor-pointer tabular-nums',
                        value === p
                          ? 'border-accent bg-accent text-[var(--dd-accent-fg)] font-semibold'
                          : 'border-border bg-surface-elevated text-foreground-secondary hover:border-accent'
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};

export interface ThemedDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (nextDate: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Custom Themed Date Picker Calendar Popover (Zero native `<input type="date">`)
 */
export const ThemedDatePicker: React.FC<ThemedDatePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select date',
  ariaLabel = 'Select date',
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean }>({
    top: 0,
    left: 0,
    openUp: false,
  });

  const parsedInitial = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (m) {
      return { year: Number(m[1]), month: Number(m[2]) - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [value]);

  const [viewYear, setViewYear] = useState(parsedInitial.year);
  const [viewMonth, setViewMonth] = useState(parsedInitial.month);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const syncPos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 264;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const openUp = spaceBelow < 280 && rect.top > spaceBelow;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = openUp ? rect.top - 6 : rect.bottom + 6;
    setCoords({ top, left, openUp });
  };

  useEffect(() => {
    if (!open) return;
    setViewYear(parsedInitial.year);
    setViewMonth(parsedInitial.month);
    syncPos();
    const onOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', syncPos);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', syncPos);
    };
  }, [open, parsedInitial.year, parsedInitial.month]);

  const firstDayOffset = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const selectDay = (day: number) => {
    const formatted = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(formatted);
    setOpen(false);
  };

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'h-9 flex items-center gap-2 rounded-[var(--dd-radius-control)] border border-border bg-surface hover:border-border-strong px-2.5 font-mono text-xs text-foreground tabular-nums cursor-pointer',
          open && 'border-accent ring-1 ring-accent/40'
        )}
      >
        <Calendar className="h-3.5 w-3.5 text-accent shrink-0" />
        <span>{value || placeholder}</span>
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: coords.openUp ? 6 : -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: coords.openUp ? 4 : -4, scale: 0.97 }}
                transition={{ duration: 0.14 }}
                style={{
                  position: 'fixed',
                  top: coords.openUp ? undefined : coords.top,
                  bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
                  left: coords.left,
                  width: 264,
                }}
                className="z-[130] rounded-2xl border border-border-strong bg-surface shadow-2xl p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous month"
                    className="h-7 w-7 rounded-lg border border-border bg-surface-elevated hover:border-accent flex items-center justify-center cursor-pointer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs font-mono font-semibold text-foreground">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                  </span>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    aria-label="Next month"
                    className="h-7 w-7 rounded-lg border border-border bg-surface-elevated hover:border-accent flex items-center justify-center cursor-pointer"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-foreground-muted">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1 font-mono text-[11px]">
                  {Array.from({ length: firstDayOffset }).map((_, i) => (
                    <span key={`empty-${i}`} />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, idx) => {
                    const day = idx + 1;
                    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const active = value === iso;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => selectDay(day)}
                        className={cn(
                          'h-7 rounded-md transition-colors cursor-pointer tabular-nums',
                          active
                            ? 'bg-accent text-[var(--dd-accent-fg)] font-bold'
                            : 'hover:bg-surface-elevated text-foreground'
                        )}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/60 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                      onChange(iso);
                      setOpen(false);
                    }}
                    className="text-accent hover:underline cursor-pointer"
                  >
                    Today
                  </button>
                  {value && (
                    <button
                      type="button"
                      onClick={() => {
                        onChange('');
                        setOpen(false);
                      }}
                      className="text-foreground-muted hover:text-foreground cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};
