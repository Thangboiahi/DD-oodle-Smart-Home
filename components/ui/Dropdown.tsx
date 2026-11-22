'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  align?: 'left' | 'right';
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
}

/**
 * Custom Accessible Dropdown & Searchable Combobox
 */
export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchable = false,
  searchPlaceholder = 'Filter options...',
  align = 'left',
  className,
  triggerClassName,
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description && o.description.toLowerCase().includes(q)) ||
        o.value.toLowerCase().includes(q)
    );
  }, [options, query, searchable]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center justify-between gap-2 min-h-[38px] rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated hover:border-border-strong px-3 py-1.5 text-xs font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 cursor-pointer w-full',
          triggerClassName
        )}
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          {selected?.icon && <span className="shrink-0 text-foreground-secondary">{selected.icon}</span>}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-foreground-muted transition-transform duration-150',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute z-50 mt-1.5 min-w-[220px] w-full rounded-[var(--dd-radius-card)] border border-border-strong bg-surface shadow-xl overflow-hidden',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-2 bg-surface-elevated">
              <Search className="h-3.5 w-3.5 text-foreground-muted shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                autoFocus
                className="w-full bg-transparent text-xs text-foreground placeholder:text-foreground-muted focus:outline-none"
              />
            </div>
          )}

          <div className="max-h-60 overflow-y-auto p-1 dd-scroll">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-foreground-muted">No matches</div>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-accent-soft text-accent font-medium'
                        : 'text-foreground hover:bg-surface-muted',
                      opt.disabled && 'opacity-40 pointer-events-none'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                      <div className="min-w-0">
                        <div className="truncate">{opt.label}</div>
                        {opt.description && (
                          <div className="text-[10px] text-foreground-muted truncate">{opt.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.badge && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-elevated border border-border text-foreground-secondary">
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && <Check className="h-3.5 w-3.5 text-accent" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
