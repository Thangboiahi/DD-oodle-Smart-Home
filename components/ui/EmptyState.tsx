import React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-[var(--dd-radius-card)] border border-dashed border-border-strong bg-surface-elevated/40',
        compact ? 'px-4 py-6 gap-2' : 'px-6 py-10 gap-3',
        className
      )}
    >
      <div className="h-10 w-10 rounded-full border border-border bg-surface flex items-center justify-center text-foreground-muted">
        {icon ?? <Inbox className="h-4 w-4" />}
      </div>
      <div className="space-y-1 max-w-sm">
        <div className="text-xs font-semibold text-foreground">{title}</div>
        {description && (
          <p className="text-[11px] text-foreground-muted leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
};
