'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace } from './WorkspaceProvider';

export interface CollapsibleSectionProps {
  sectionId: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  defaultCollapsed?: boolean;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

/**
 * Animated Collapsible & Expandable Container with persisted state
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  sectionId,
  title,
  subtitle,
  icon,
  badge,
  actions,
  defaultCollapsed = false,
  className,
  contentClassName,
  children,
}) => {
  const { isSectionCollapsed, toggleSectionCollapsed } = useWorkspace();
  const collapsed = isSectionCollapsed(sectionId, defaultCollapsed);

  return (
    <section
      className={cn(
        'rounded-[var(--dd-radius-card)] border border-border bg-surface overflow-hidden transition-colors',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-surface-elevated/60 border-b border-border/70">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => toggleSectionCollapsed(sectionId, defaultCollapsed)}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 text-foreground-muted shrink-0 transition-transform duration-200',
              collapsed && '-rotate-90'
            )}
          />
          {icon && <span className="text-accent shrink-0">{icon}</span>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xs font-semibold tracking-tight text-foreground truncate">
                {title}
              </h2>
              {badge}
            </div>
            {subtitle && (
              <p className="text-[11px] text-foreground-muted truncate">{subtitle}</p>
            )}
          </div>
        </button>

        {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
        )}
      >
        <div className="overflow-hidden">
          <div className={cn('p-[var(--dd-card-pad)]', contentClassName)}>{children}</div>
        </div>
      </div>
    </section>
  );
};
