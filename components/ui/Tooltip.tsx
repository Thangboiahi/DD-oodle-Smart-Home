'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

const SIDE_CLASSES: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
};

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  side = 'top',
  className,
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border-strong bg-surface-elevated px-2 py-1 text-[11px] font-medium text-foreground shadow-lg',
            SIDE_CLASSES[side]
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
};
