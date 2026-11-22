'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FullscreenStageProps {
  title: string;
  subtitle?: string;
  toolbar?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Fullscreen Mode Wrapper
 * Uses browser Fullscreen API when supported, with clean CSS viewport fallback
 * for iOS Safari and restricted webviews.
 */
export const FullscreenStage: React.FC<FullscreenStageProps> = ({
  title,
  subtitle,
  toolbar,
  className,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [usingCssFallback, setUsingCssFallback] = useState(false);

  const exitFullscreen = useCallback(async () => {
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Fallback cleanup below
      }
    }
    setIsFullscreen(false);
    setUsingCssFallback(false);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen) {
      await exitFullscreen();
      return;
    }

    const el = containerRef.current;
    if (el && typeof el.requestFullscreen === 'function') {
      try {
        await el.requestFullscreen();
        setIsFullscreen(true);
        setUsingCssFallback(false);
        return;
      } catch {
        // iOS Safari or permission restriction — fall through to CSS viewport fallback
      }
    }
    setIsFullscreen(true);
    setUsingCssFallback(true);
  }, [isFullscreen, exitFullscreen]);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && !usingCssFallback) {
        setIsFullscreen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        void exitFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen, usingCssFallback, exitFullscreen]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col rounded-[var(--dd-radius-card)] border border-border bg-surface overflow-hidden',
        isFullscreen && usingCssFallback && 'fixed inset-0 z-50 rounded-none border-0 bg-canvas',
        isFullscreen && !usingCssFallback && 'h-screen w-screen rounded-none border-0 bg-canvas',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-elevated px-3.5 py-2 shrink-0">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground truncate">{title}</div>
          {subtitle && (
            <div className="text-[11px] text-foreground-muted truncate font-mono">{subtitle}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {toolbar}
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen Stage'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface hover:border-border-strong text-foreground-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          {isFullscreen && (
            <button
              type="button"
              onClick={() => void exitFullscreen()}
              aria-label="Close fullscreen stage"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface hover:border-border-strong text-foreground-secondary hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className={cn('relative flex-1 min-h-0', isFullscreen && 'overflow-auto dd-scroll')}>
        {children}
      </div>
    </div>
  );
};
