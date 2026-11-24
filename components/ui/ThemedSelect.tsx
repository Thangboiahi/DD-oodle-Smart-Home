'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ThemedSelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface ThemedSelectProps {
  options: ThemedSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  ariaLabel?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  size?: 'xs' | 'sm' | 'md';
  align?: 'left' | 'right';
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

/**
 * Custom Accessible ThemedSelect
 * - Desktop (>= 640px): animated viewport-clamped portal popover
 * - Mobile (< 640px): sleek themed slide-up bottom sheet
 * - Auto-enables search when > 6 items (or explicitly `searchable`)
 * - Tri-color active checkmark + custom `.dd-scroll` scrollbar
 */
export const ThemedSelect: React.FC<ThemedSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  ariaLabel,
  searchable,
  searchPlaceholder = 'Search options...',
  size = 'sm',
  align = 'left',
  disabled = false,
  className,
  triggerClassName,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [popoverCoords, setPopoverCoords] = useState<{
    top: number;
    left: number;
    width: number;
    openUp: boolean;
  }>({ top: 0, left: 0, width: 240, openUp: false });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const shouldSearch = searchable ?? options.length > 6;

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!shouldSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description && o.description.toLowerCase().includes(q)) ||
        (o.badge && o.badge.toLowerCase().includes(q)) ||
        o.value.toLowerCase().includes(q)
    );
  }, [options, query, shouldSearch]);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(max-width: 639px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const minW = Math.max(rect.width, 236);
    const maxW = Math.min(360, window.innerWidth - 24);
    const width = Math.min(Math.max(minW, rect.width), maxW);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    const rawLeft = align === 'right' ? rect.right - width : rect.left;
    const left = Math.max(12, Math.min(rawLeft, window.innerWidth - width - 12));
    const top = openUp ? rect.top - 6 : rect.bottom + 6;
    setPopoverCoords({ top, left, width, openUp });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const idx = filtered.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);

    if (shouldSearch) {
      window.setTimeout(() => searchInputRef.current?.focus(), 40);
    }

    const onOutsidePointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) =>
          filtered.length === 0 ? 0 : (prev + 1) % filtered.length
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) =>
          filtered.length === 0
            ? 0
            : (prev - 1 + filtered.length) % filtered.length
        );
      } else if (e.key === 'Enter') {
        const opt = filtered[activeIndex];
        if (opt && !opt.disabled) {
          e.preventDefault();
          onChange(opt.value);
          setOpen(false);
          setQuery('');
        }
      }
    };

    const onViewportChange = () => {
      if (!isMobile) updatePosition();
    };

    document.addEventListener('mousedown', onOutsidePointer);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', onOutsidePointer);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, filtered, activeIndex, value, isMobile, shouldSearch, onChange]);

  const sizeClass =
    size === 'xs'
      ? 'h-7 px-2 text-[11px] rounded-lg'
      : size === 'md'
      ? 'h-10 px-3 text-xs rounded-[var(--dd-radius-control)]'
      : 'h-9 px-2.5 text-xs rounded-[var(--dd-radius-control)]';

  const handleSelect = (opt: ThemedSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  };

  const renderOptionsList = () => (
    <>
      {shouldSearch && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 bg-surface-elevated/80 shrink-0">
          <Search className="h-3.5 w-3.5 text-accent shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-foreground-muted focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear filter"
              className="text-foreground-muted hover:text-foreground cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      <div
        id={listboxId}
        role="listbox"
        className={cn(
          'overflow-y-auto p-1.5 space-y-0.5 dd-scroll',
          isMobile ? 'max-h-[55vh]' : 'max-h-64'
        )}
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-foreground-muted font-mono">
            No matching options
          </div>
        ) : (
          filtered.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === activeIndex;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={opt.disabled}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => handleSelect(opt)}
                className={cn(
                  'w-full flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer min-h-[38px]',
                  isSelected
                    ? 'bg-accent-soft border border-accent-border text-foreground font-semibold'
                    : isHighlighted
                    ? 'bg-surface-elevated text-foreground border border-transparent'
                    : 'text-foreground-secondary hover:bg-surface-elevated hover:text-foreground border border-transparent',
                  opt.disabled && 'opacity-40 pointer-events-none'
                )}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {opt.icon && (
                    <span className="shrink-0 text-[var(--dd-color-2)]">
                      {opt.icon}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{opt.label}</div>
                    {opt.description && (
                      <div className="text-[10px] text-foreground-muted truncate mt-0.5">
                        {opt.description}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {opt.badge && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-muted border border-border text-[var(--dd-color-2)]">
                      {opt.badge}
                    </span>
                  )}
                  {isSelected && (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--dd-color-1)] text-[var(--dd-color-1-fg)] shadow-sm">
                      <Check className="h-3 w-3 stroke-[2.5]" />
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );

  return (
    <div className={cn('relative inline-block w-full', className)}>
      {label && (
        <span className="block text-[10px] font-mono uppercase tracking-wider text-foreground-muted mb-1">
          {label}
        </span>
      )}

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel ?? label ?? placeholder}
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev);
          }
        }}
        className={cn(
          'w-full flex items-center justify-between gap-2 border border-border bg-surface-elevated hover:border-border-strong text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          open && 'border-accent ring-1 ring-accent/40',
          disabled && 'opacity-50 cursor-not-allowed',
          sizeClass,
          triggerClassName
        )}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {selected?.icon && (
            <span className="shrink-0 text-accent">{selected.icon}</span>
          )}
          <span className="truncate font-medium">
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-foreground-muted transition-transform duration-150',
            open && 'rotate-180 text-accent'
          )}
        />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open &&
              (isMobile ? (
                <div className="fixed inset-0 z-[120] flex flex-col justify-end">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => setOpen(false)}
                    className="fixed inset-0 bg-black/55"
                  />
                  <motion.div
                    ref={panelRef}
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', stiffness: 440, damping: 38 }}
                    className="relative z-10 w-full rounded-t-2xl border-t border-border-strong bg-surface shadow-2xl overflow-hidden pb-safe"
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-elevated">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">
                          {label ?? ariaLabel ?? 'Select Option'}
                        </div>
                        <div className="text-[10px] font-mono text-foreground-muted">
                          {options.length} available
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        aria-label="Close selector"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-foreground-secondary hover:text-foreground cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {renderOptionsList()}
                  </motion.div>
                </div>
              ) : (
                <motion.div
                  ref={panelRef}
                  initial={{
                    opacity: 0,
                    y: popoverCoords.openUp ? 6 : -6,
                    scale: 0.98,
                  }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{
                    opacity: 0,
                    y: popoverCoords.openUp ? 4 : -4,
                    scale: 0.98,
                  }}
                  transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    position: 'fixed',
                    top: popoverCoords.openUp ? undefined : popoverCoords.top,
                    bottom: popoverCoords.openUp
                      ? window.innerHeight - popoverCoords.top
                      : undefined,
                    left: popoverCoords.left,
                    width: popoverCoords.width,
                  }}
                  className="z-[120] rounded-xl border border-border-strong bg-surface shadow-2xl overflow-hidden flex flex-col"
                >
                  {renderOptionsList()}
                </motion.div>
              ))}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};
