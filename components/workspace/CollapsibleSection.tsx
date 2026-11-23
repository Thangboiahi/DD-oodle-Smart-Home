'use client';

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

/**
 * Animated Collapsible & Expandable Container with persisted state.
 * Phase 8 Declutter: Uses soft tonal surface separation and subtle 1px low-opacity hairline dividers
 * instead of heavy nested double-borders.
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  sectionId,
  title,
  subtitle,
  icon,
  badge,
  actions,
  defaultCollapsed = false,
  defaultOpen,
  className,
  contentClassName,
  children,
}) => {
  const effectiveDefaultCollapsed =
    defaultOpen !== undefined ? !defaultOpen : defaultCollapsed;
  const { isSectionCollapsed, toggleSectionCollapsed } = useWorkspace();
  const collapsed = isSectionCollapsed(sectionId, effectiveDefaultCollapsed);

  return (
    <section
      className={cn(
        'rounded-2xl border hairline-border bg-surface/65 overflow-hidden transition-colors',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-2 px-3.5 py-2.5 bg-surface-elevated/40',
          !collapsed && 'border-b hairline-border'
        )}
      >
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => toggleSectionCollapsed(sectionId, defaultCollapsed)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 text-foreground-muted shrink-0 transition-transform duration-200',
              collapsed && '-rotate-90'
            )}
          />
          {icon && <span className="text-accent shrink-0">{icon}</span>}
          <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
            <h2 className="text-xs font-semibold tracking-tight text-foreground truncate">
              {title}
            </h2>
            {subtitle && (
              <span className="text-[11px] font-mono text-foreground-muted tabular-nums">
                · {subtitle}
              </span>
            )}
            {badge}
          </div>
        </button>

        {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className={cn('p-3 sm:p-3.5', contentClassName)}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
