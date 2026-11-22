'use client';

import React from 'react';
import { Columns2, Maximize2, Minimize2, Rows2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace, WidgetSize } from './WorkspaceProvider';

export interface WidgetSizeFrameProps {
  widgetId: string;
  defaultSize?: WidgetSize;
  showSizeControls?: boolean;
  className?: string;
  children: React.ReactNode;
}

const SIZE_GRID_CLASSES: Record<WidgetSize, string> = {
  compact: 'col-span-1',
  standard: 'col-span-1',
  wide: 'col-span-1 md:col-span-2',
  tall: 'col-span-1 row-span-2',
};

const SIZE_OPTIONS: Array<{ value: WidgetSize; label: string; icon: React.ReactNode }> = [
  { value: 'compact', label: 'Compact', icon: <Minimize2 className="h-3 w-3" /> },
  { value: 'standard', label: 'Standard', icon: <Maximize2 className="h-3 w-3" /> },
  { value: 'wide', label: 'Wide', icon: <Columns2 className="h-3 w-3" /> },
  { value: 'tall', label: 'Tall', icon: <Rows2 className="h-3 w-3" /> },
];

/**
 * Widget Size Frame with persisted `compact | standard | wide | tall` controls
 */
export const WidgetSizeFrame: React.FC<WidgetSizeFrameProps> = ({
  widgetId,
  defaultSize = 'standard',
  showSizeControls = true,
  className,
  children,
}) => {
  const { getWidgetSize, setWidgetSize } = useWorkspace();
  const size = getWidgetSize(widgetId, defaultSize);

  return (
    <div
      data-widget-size={size}
      className={cn('relative group/widget', SIZE_GRID_CLASSES[size], className)}
    >
      {showSizeControls && (
        <div className="hidden sm:flex items-center gap-0.5 absolute top-2 right-2 z-20 opacity-0 group-hover/widget:opacity-100 focus-within:opacity-100 transition-opacity rounded-md border border-border-strong bg-surface/95 backdrop-blur-xs p-0.5 shadow-sm">
          {SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={`Size: ${opt.label}`}
              aria-label={`Set widget size to ${opt.label}`}
              onClick={() => setWidgetSize(widgetId, opt.value)}
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded text-foreground-muted hover:text-foreground transition-colors cursor-pointer',
                size === opt.value && 'bg-accent-soft text-accent'
              )}
            >
              {opt.icon}
            </button>
          ))}
        </div>
      )}
      <div className={cn(size === 'compact' && 'text-[13px]', size === 'tall' && 'h-full')}>
        {children}
      </div>
    </div>
  );
};
