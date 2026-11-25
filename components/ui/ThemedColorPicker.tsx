'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Pipette, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const emptySubscribe = () => () => {};

export interface ThemedColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  ariaLabel?: string;
  label?: string;
  className?: string;
}

const CURATED_SWATCHES = [
  '#06b6d4',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#0284c7',
  '#84cc16',
  '#f97316',
  '#e11d48',
];

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return { h: 190, s: 90, l: 45 };
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Custom Interactive HSL + Swatch Color Picker Popover (Zero native `<input type="color">`)
 */
export const ThemedColorPicker: React.FC<ThemedColorPickerProps> = ({
  value,
  onChange,
  ariaLabel = 'Choose color',
  label,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean }>({
    top: 0,
    left: 0,
    openUp: false,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const safeHex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#06b6d4';
  const hsl = hexToHsl(safeHex);

  const syncPosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 264;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const openUp = spaceBelow < 290 && rect.top > spaceBelow;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = openUp ? rect.top - 8 : rect.bottom + 8;
    setCoords({ top, left, openUp });
  };

  useEffect(() => {
    if (!open) return;
    syncPosition();
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
    window.addEventListener('resize', syncPosition);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', syncPosition);
    };
  }, [open]);

  const updateHue = (clientX: number, rect: DOMRect) => {
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onChange(hslToHex(Math.round(ratio * 360), hsl.s, hsl.l));
  };

  const updateSL = (clientX: number, clientY: number, rect: DOMRect) => {
    const rx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const ry = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const nextS = Math.round(rx * 100);
    const nextL = Math.round((1 - ry) * 76 + 12);
    onChange(hslToHex(hsl.h, nextS, nextL));
  };

  return (
    <div className={cn('relative inline-block shrink-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'relative h-9 w-11 rounded-[var(--dd-radius-control)] border border-border-strong p-1 bg-surface-elevated hover:border-accent transition-colors cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          open && 'border-accent ring-1 ring-accent/40'
        )}
      >
        <span
          className="h-full w-full rounded flex items-center justify-center border border-black/15 shadow-inner"
          style={{ backgroundColor: safeHex }}
        >
          <Pipette className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]" />
        </span>
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
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-foreground-muted">
                    {label ?? 'Custom Channel Tint'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close color picker"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface-elevated text-foreground-muted cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Interactive Saturation / Lightness Pad */}
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Saturation and lightness"
                  aria-valuenow={hsl.l}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    updateSL(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons !== 1) return;
                    updateSL(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
                  }}
                  style={{
                    backgroundColor: `hsl(${hsl.h}, 100%, 50%)`,
                    backgroundImage:
                      'linear-gradient(to top, #090b0f, transparent, #ffffff), linear-gradient(to right, #808080, transparent)',
                  }}
                  className="relative h-28 w-full rounded-xl border border-border cursor-crosshair touch-none select-none overflow-hidden"
                >
                  <span
                    style={{
                      left: `${hsl.s}%`,
                      top: `${Math.max(0, Math.min(100, ((88 - hsl.l) / 76) * 100))}%`,
                      backgroundColor: safeHex,
                    }}
                    className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md pointer-events-none"
                  />
                </div>

                {/* Hue Spectrum Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-foreground-muted">
                    <span>HUE SPECTRUM</span>
                    <span className="uppercase text-foreground">{safeHex}</span>
                  </div>
                  <div
                    role="slider"
                    tabIndex={0}
                    aria-label="Hue"
                    aria-valuemin={0}
                    aria-valuemax={360}
                    aria-valuenow={hsl.h}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      updateHue(e.clientX, e.currentTarget.getBoundingClientRect());
                    }}
                    onPointerMove={(e) => {
                      if (e.buttons !== 1) return;
                      updateHue(e.clientX, e.currentTarget.getBoundingClientRect());
                    }}
                    style={{
                      background:
                        'linear-gradient(to right, #ef4444, #f59e0b, #84cc16, #10b981, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)',
                    }}
                    className="relative h-3.5 w-full rounded-full border border-border cursor-pointer touch-none select-none"
                  >
                    <span
                      style={{ left: `${(hsl.h / 360) * 100}%` }}
                      className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-surface shadow pointer-events-none"
                    />
                  </div>
                </div>

                {/* Curated Swatches */}
                <div className="grid grid-cols-6 gap-1.5">
                  {CURATED_SWATCHES.map((swatch) => {
                    const active = swatch.toLowerCase() === safeHex.toLowerCase();
                    return (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => onChange(swatch)}
                        aria-label={`Select color ${swatch}`}
                        style={{ backgroundColor: swatch }}
                        className={cn(
                          'h-7 rounded-lg border transition-transform cursor-pointer flex items-center justify-center',
                          active
                            ? 'border-white ring-2 ring-accent scale-105'
                            : 'border-black/20 hover:scale-105'
                        )}
                      >
                        {active && (
                          <Check className="h-3.5 w-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};
