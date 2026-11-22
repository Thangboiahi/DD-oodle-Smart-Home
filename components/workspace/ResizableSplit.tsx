'use client';

import React, { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useWorkspace } from './WorkspaceProvider';

export interface ResizableSplitProps {
  splitId: string;
  direction?: 'horizontal' | 'vertical';
  defaultPrimaryPct?: number;
  minPrimaryPct?: number;
  maxPrimaryPct?: number;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  className?: string;
}

/**
 * Resizable Split-Pane Handle with min/max bounds, persistence, and double-click-to-reset.
 * Stacks vertically on small mobile screens for horizontal splits.
 */
export const ResizableSplit: React.FC<ResizableSplitProps> = ({
  splitId,
  direction = 'horizontal',
  defaultPrimaryPct = 66,
  minPrimaryPct = 28,
  maxPrimaryPct = 82,
  primary,
  secondary,
  className,
}) => {
  const { getSplitSize, setSplitSize } = useWorkspace();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const primaryPct = getSplitSize(splitId, defaultPrimaryPct);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      setDragging(true);

      const onMove = (ev: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        const rawPct =
          direction === 'horizontal'
            ? ((ev.clientX - rect.left) / rect.width) * 100
            : ((ev.clientY - rect.top) / rect.height) * 100;
        const clamped = Math.min(maxPrimaryPct, Math.max(minPrimaryPct, Math.round(rawPct * 10) / 10));
        setSplitSize(splitId, clamped);
      };

      const onUp = () => {
        setDragging(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [direction, maxPrimaryPct, minPrimaryPct, setSplitSize, splitId]
  );

  const handleReset = () => {
    setSplitSize(splitId, defaultPrimaryPct);
  };

  if (direction === 'vertical') {
    return (
      <div
        ref={containerRef}
        className={cn('flex flex-col h-full min-h-[420px] gap-0', className)}
      >
        <div style={{ flexBasis: `${primaryPct}%` }} className="min-h-0 overflow-auto dd-scroll">
          {primary}
        </div>
        <div
          role="separator"
          aria-orientation="horizontal"
          title="Drag to resize · Double-click to reset"
          onPointerDown={handlePointerDown}
          onDoubleClick={handleReset}
          className={cn(
            'h-2.5 flex items-center justify-center cursor-row-resize select-none group shrink-0',
            dragging && 'bg-accent-soft'
          )}
        >
          <div className="h-0.5 w-12 rounded-full bg-border-strong group-hover:bg-accent transition-colors" />
        </div>
        <div className="flex-1 min-h-0 overflow-auto dd-scroll">{secondary}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('flex flex-col lg:flex-row gap-3 lg:gap-0 items-stretch', className)}
    >
      <div
        className="min-w-0 lg:shrink-0"
        style={{ width: undefined, flexBasis: `${primaryPct}%` }}
      >
        {primary}
      </div>

      {/* Desktop/Tablet Landscape Drag Handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize · Double-click to reset"
        onPointerDown={handlePointerDown}
        onDoubleClick={handleReset}
        className={cn(
          'hidden lg:flex w-3 items-center justify-center cursor-col-resize select-none group shrink-0',
          dragging && 'bg-accent-soft/40'
        )}
      >
        <div
          className={cn(
            'w-0.5 h-12 rounded-full bg-border-strong group-hover:bg-accent transition-colors',
            dragging && 'bg-accent h-20'
          )}
        />
      </div>

      <div className="min-w-0 flex-1">{secondary}</div>
    </div>
  );
};
