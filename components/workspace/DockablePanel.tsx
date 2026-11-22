'use client';

import React, { useEffect, useState } from 'react';
import {
  ChevronUp,
  GripHorizontal,
  Maximize2,
  Minimize2,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PictureInPicture2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DockPosition, useWorkspace } from './WorkspaceProvider';

export interface DockablePanelProps {
  panelId: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  defaultPosition?: DockPosition;
  children: React.ReactNode;
}

/**
 * Reusable DockablePanel System
 * - Desktop/Tablet: Dock Left, Right, Bottom, Float (draggable + resizable), Collapse to edge tab, or Fullscreen.
 * - Mobile (< 768px): Gracefully renders as a swipeable/expandable bottom sheet.
 */
export const DockablePanel: React.FC<DockablePanelProps> = ({
  panelId,
  title,
  subtitle,
  icon,
  defaultOpen = false,
  defaultPosition = 'right',
  children,
}) => {
  const { getDockPanelState, setDockPanelState } = useWorkspace();
  const state = getDockPanelState(panelId, { open: defaultOpen, position: defaultPosition });
  const [isMobile, setIsMobile] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!state.open) return null;

  const update = (patch: Partial<typeof state>) => setDockPanelState(panelId, patch);

  // Mobile Bottom Sheet presentation
  if (isMobile) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col">
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
          onClick={() => update({ open: false })}
        />
        <div
          className={cn(
            'relative z-10 flex flex-col rounded-t-2xl border-t border-border-strong bg-surface shadow-2xl transition-[height] duration-200',
            sheetExpanded ? 'h-[88vh]' : 'h-[52vh]'
          )}
        >
          {/* Sheet drag handle */}
          <button
            type="button"
            onClick={() => setSheetExpanded((e) => !e)}
            aria-label={sheetExpanded ? 'Shrink sheet' : 'Expand sheet'}
            className="flex flex-col items-center justify-center pt-2 pb-1.5 cursor-pointer"
          >
            <span className="h-1 w-10 rounded-full bg-border-strong" />
          </button>

          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {icon && <span className="text-accent shrink-0">{icon}</span>}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground truncate">{title}</div>
                {subtitle && (
                  <div className="text-[10px] font-mono text-foreground-muted truncate">{subtitle}</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSheetExpanded((e) => !e)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-foreground-secondary"
              >
                {sheetExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => update({ open: false })}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-foreground-secondary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 pb-safe dd-scroll">{children}</div>
        </div>
      </div>
    );
  }

  // Collapsed Edge Tab on Desktop/Tablet
  if (state.collapsed && !state.fullscreen) {
    const edgeClasses: Record<DockPosition, string> = {
      left: 'left-0 top-1/2 -translate-y-1/2 rounded-r-lg border-l-0',
      right: 'right-0 top-1/2 -translate-y-1/2 rounded-l-lg border-r-0',
      bottom: 'bottom-0 left-1/2 -translate-x-1/2 rounded-t-lg border-b-0',
      float: 'bottom-4 right-4 rounded-lg',
    };

    return (
      <button
        type="button"
        onClick={() => update({ collapsed: false })}
        className={cn(
          'fixed z-40 flex items-center gap-2 border border-border-strong bg-surface-elevated hover:border-accent-border px-3 py-2 text-xs font-medium text-foreground shadow-xl cursor-pointer transition-colors',
          edgeClasses[state.position]
        )}
      >
        {icon && <span className="text-accent">{icon}</span>}
        <span>{title}</span>
        <ChevronUp className="h-3.5 w-3.5 text-foreground-muted" />
      </button>
    );
  }

  // Floating drag handler
  const startFloatDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (state.position !== 'float' || state.fullscreen) return;
    e.preventDefault();
    const startX = e.clientX - state.floatX;
    const startY = e.clientY - state.floatY;

    const onMove = (ev: PointerEvent) => {
      const nextX = Math.max(12, Math.min(window.innerWidth - 280, ev.clientX - startX));
      const nextY = Math.max(56, Math.min(window.innerHeight - 160, ev.clientY - startY));
      update({ floatX: nextX, floatY: nextY });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Edge / corner resize handler
  const startResize = (edge: 'left' | 'right' | 'top' | 'corner') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = state.width;
    const startH = state.height;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (edge === 'left') {
        update({ width: Math.min(760, Math.max(280, startW - dx)) });
      } else if (edge === 'right') {
        update({ width: Math.min(760, Math.max(280, startW + dx)) });
      } else if (edge === 'top') {
        update({ height: Math.min(640, Math.max(200, startH - dy)) });
      } else {
        update({
          width: Math.min(820, Math.max(300, startW + dx)),
          height: Math.min(680, Math.max(240, startH + dy)),
        });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const containerStyle: React.CSSProperties = state.fullscreen
    ? {}
    : state.position === 'float'
    ? {
        left: state.floatX,
        top: state.floatY,
        width: state.width,
        height: state.height,
      }
    : state.position === 'bottom'
    ? { height: state.height }
    : { width: state.width };

  const positionClasses = state.fullscreen
    ? 'inset-3 rounded-[var(--dd-radius-card)]'
    : state.position === 'right'
    ? 'top-14 right-0 bottom-0 border-r-0 rounded-l-[var(--dd-radius-card)]'
    : state.position === 'left'
    ? 'top-14 left-0 bottom-0 border-l-0 rounded-r-[var(--dd-radius-card)]'
    : state.position === 'bottom'
    ? 'left-0 right-0 bottom-0 border-b-0 rounded-t-[var(--dd-radius-card)]'
    : 'rounded-[var(--dd-radius-card)]';

  return (
    <aside
      style={containerStyle}
      className={cn(
        'fixed z-40 flex flex-col border border-border-strong bg-surface shadow-2xl overflow-hidden',
        positionClasses
      )}
    >
      {/* Resize handles */}
      {!state.fullscreen && state.position === 'right' && (
        <div
          onPointerDown={startResize('left')}
          title="Drag to resize width"
          className="absolute left-0 inset-y-0 w-1.5 cursor-col-resize hover:bg-accent/50 transition-colors z-20"
        />
      )}
      {!state.fullscreen && state.position === 'left' && (
        <div
          onPointerDown={startResize('right')}
          title="Drag to resize width"
          className="absolute right-0 inset-y-0 w-1.5 cursor-col-resize hover:bg-accent/50 transition-colors z-20"
        />
      )}
      {!state.fullscreen && state.position === 'bottom' && (
        <div
          onPointerDown={startResize('top')}
          title="Drag to resize height"
          className="absolute top-0 inset-x-0 h-1.5 cursor-row-resize hover:bg-accent/50 transition-colors z-20"
        />
      )}

      {/* Header bar */}
      <div
        onPointerDown={startFloatDrag}
        className={cn(
          'flex items-center justify-between gap-2 border-b border-border bg-surface-elevated px-3 py-2 shrink-0 select-none',
          state.position === 'float' && !state.fullscreen && 'cursor-move'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {state.position === 'float' && !state.fullscreen && (
            <GripHorizontal className="h-3.5 w-3.5 text-foreground-muted shrink-0" />
          )}
          {icon && <span className="text-accent shrink-0">{icon}</span>}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-foreground truncate">{title}</div>
            {subtitle && (
              <div className="text-[10px] font-mono text-foreground-muted truncate">{subtitle}</div>
            )}
          </div>
        </div>

        {/* Dock Controls */}
        <div
          className="flex items-center gap-0.5 shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {(
            [
              ['left', PanelLeft, 'Dock Left'],
              ['bottom', PanelBottom, 'Dock Bottom'],
              ['right', PanelRight, 'Dock Right'],
              ['float', PictureInPicture2, 'Float Panel'],
            ] as const
          ).map(([pos, Icon, label]) => (
            <button
              key={pos}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => update({ position: pos, fullscreen: false, collapsed: false })}
              className={cn(
                'h-6 w-6 inline-flex items-center justify-center rounded text-foreground-muted hover:text-foreground hover:bg-surface-muted transition-colors cursor-pointer',
                state.position === pos && !state.fullscreen && 'bg-accent-soft text-accent'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}

          <span className="mx-1 h-3.5 w-px bg-border" />

          <button
            type="button"
            title="Collapse to edge tab"
            aria-label="Collapse panel"
            onClick={() => update({ collapsed: true, fullscreen: false })}
            className="h-6 px-1.5 inline-flex items-center justify-center rounded text-[10px] font-mono text-foreground-muted hover:text-foreground hover:bg-surface-muted cursor-pointer"
          >
            _
          </button>

          <button
            type="button"
            title={state.fullscreen ? 'Restore size' : 'Expand to fullscreen'}
            aria-label={state.fullscreen ? 'Restore size' : 'Expand to fullscreen'}
            onClick={() => update({ fullscreen: !state.fullscreen })}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-foreground-muted hover:text-foreground hover:bg-surface-muted cursor-pointer"
          >
            {state.fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            title="Close panel"
            aria-label="Close panel"
            onClick={() => update({ open: false, fullscreen: false })}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-foreground-muted hover:text-danger hover:bg-danger-soft cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 dd-scroll">{children}</div>

      {/* Floating bottom-right resize corner */}
      {!state.fullscreen && state.position === 'float' && (
        <div
          onPointerDown={startResize('corner')}
          title="Drag to resize"
          className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize flex items-end justify-end p-0.5 text-foreground-muted/60 hover:text-accent"
        >
          <span className="h-2 w-2 border-r-2 border-b-2 border-current rounded-br-[2px]" />
        </div>
      )}
    </aside>
  );
};
