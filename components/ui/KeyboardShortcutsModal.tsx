'use client';

import React, { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

export interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['⌘ / Ctrl', 'K'], label: 'Open Quick Jump Command Palette' },
  { keys: ['?'], label: 'Toggle Keyboard Shortcuts Guide' },
  { keys: ['E'], label: 'Toggle Dashboard Edit Layout Mode' },
  { keys: ['Esc'], label: 'Close Active Modal / Drawer / Palette' },
  { keys: ['↑ / ↓'], label: 'Navigate Command Palette Results' },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  open,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[var(--dd-radius-card)] border border-border-strong bg-surface p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Desktop Keyboard Shortcuts</h2>
          </div>
          <button
            type="button"
            aria-label="Close keyboard shortcuts"
            onClick={onClose}
            className="h-7 w-7 inline-flex items-center justify-center rounded border border-border text-foreground-muted hover:text-foreground cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-2 text-xs">
          {SHORTCUTS.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-elevated px-3 py-2"
            >
              <span className="text-foreground-secondary">{s.label}</span>
              <div className="flex items-center gap-1 shrink-0">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-border-strong bg-surface px-1.5 py-0.5 font-mono text-[10px] text-foreground"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
