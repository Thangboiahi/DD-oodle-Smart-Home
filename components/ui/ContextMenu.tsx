'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  children: React.ReactNode;
  className?: string;
}

/**
 * Right-click Context Menu Primitive
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ items, children, className }) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [pos]);

  return (
    <div
      className={cn('relative', className)}
      onContextMenu={(e) => {
        e.preventDefault();
        setPos({
          x: Math.min(e.clientX, window.innerWidth - 210),
          y: Math.min(e.clientY, window.innerHeight - items.length * 36 - 16),
        });
      }}
    >
      {children}
      {pos && (
        <div
          ref={menuRef}
          role="menu"
          style={{ left: pos.x, top: pos.y }}
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[196px] rounded-[var(--dd-radius-card)] border border-border-strong bg-surface p-1 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                setPos(null);
              }}
              className={cn(
                'w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer',
                item.danger
                  ? 'text-danger hover:bg-danger-soft'
                  : 'text-foreground hover:bg-surface-muted',
                item.disabled && 'opacity-40 pointer-events-none'
              )}
            >
              <span className="flex items-center gap-2 truncate">
                {item.icon && <span className="shrink-0">{item.icon}</span>}
                <span>{item.label}</span>
              </span>
              {item.shortcut && (
                <span className="font-mono text-[10px] text-foreground-muted">{item.shortcut}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
