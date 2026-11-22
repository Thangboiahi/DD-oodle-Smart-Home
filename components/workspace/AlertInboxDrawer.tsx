'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, CheckCheck, ChevronRight, ShieldAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, Button, EmptyState } from '@/components/ui';

export interface AlertInboxEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  moduleCode: string;
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'WARNING' | 'INFO';
  detail: string;
  ts: number;
}

export interface AlertInboxDrawerProps {
  open: boolean;
  onClose: () => void;
  alerts: AlertInboxEntry[];
  readIds: string[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export const AlertInboxDrawer: React.FC<AlertInboxDrawerProps> = ({
  open,
  onClose,
  alerts,
  readIds,
  onMarkRead,
  onMarkAllRead,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'WARNING'>('ALL');

  const filtered = alerts.filter((a) => (filter === 'ALL' ? true : a.severity === filter));
  const unreadCount = alerts.filter((a) => !readIds.includes(a.id)).length;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/55 backdrop-blur-[2px]"
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Global Notification and Alert Inbox"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className="relative z-10 w-full max-w-md h-full border-l border-border-strong bg-surface shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-elevated px-4 py-3 shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Alert Center ({unreadCount} unread)
                  </div>
                  <div className="text-[10px] font-mono text-foreground-muted">
                    Protocol v1.4 `.../alert` &amp; G10/G13 Feed
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={onMarkAllRead}>
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span>Mark all</span>
                  </Button>
                )}
                <button
                  type="button"
                  aria-label="Close Alert Center"
                  onClick={onClose}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-foreground-secondary hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Severity Filter Chips */}
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border/70 bg-surface-elevated/40 overflow-x-auto dd-scroll shrink-0">
              {(['ALL', 'CRITICAL', 'HIGH', 'WARNING'] as const).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setFilter(sev)}
                  className={cn(
                    'px-2.5 h-7 rounded-full border text-[11px] font-mono transition-colors cursor-pointer shrink-0',
                    filter === sev
                      ? 'bg-primary-soft text-primary border-primary-border font-semibold'
                      : 'bg-surface border-border text-foreground-secondary hover:text-foreground'
                  )}
                >
                  {sev}
                </button>
              ))}
            </div>

            {/* Alerts List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 dd-scroll">
              {filtered.length === 0 ? (
                <EmptyState
                  icon={<ShieldAlert className="h-4 w-4 text-success" />}
                  title="No alerts in this filter"
                  description="All monitored modules, tanks, and vehicles are operating safely."
                />
              ) : (
                filtered.map((al) => {
                  const isRead = readIds.includes(al.id);
                  const targetHref =
                    al.moduleCode === 'VEH-01'
                      ? `/vehicles/${al.deviceId}`
                      : `/devices/${al.deviceId}`;
                  return (
                    <div
                      key={al.id}
                      onClick={() => onMarkRead(al.id)}
                      className={cn(
                        'rounded-[var(--dd-radius-control)] border p-3 space-y-1.5 transition-colors cursor-pointer',
                        isRead
                          ? 'border-border bg-surface-elevated/50 opacity-75'
                          : al.severity === 'CRITICAL'
                          ? 'border-danger/60 bg-danger-soft/50'
                          : 'border-primary-border bg-surface-elevated'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={
                              al.severity === 'CRITICAL'
                                ? 'danger'
                                : al.severity === 'HIGH'
                                ? 'warning'
                                : 'mono'
                            }
                          >
                            {al.type}
                          </Badge>
                          {!isRead && (
                            <span className="h-2 w-2 rounded-full bg-primary" title="Unread" />
                          )}
                        </div>
                        <span className="font-mono text-[10px] text-foreground-muted tabular-nums">
                          {new Date(al.ts).toLocaleTimeString()}
                        </span>
                      </div>

                      <div className="text-xs font-semibold text-foreground">
                        {al.deviceName}{' '}
                        <span className="font-mono text-[10px] text-foreground-muted">
                          ({al.moduleCode})
                        </span>
                      </div>
                      <p className="text-[11px] text-foreground-secondary leading-snug">
                        {al.detail}
                      </p>

                      <div className="flex items-center justify-end pt-1">
                        <Link
                          href={targetHref}
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkRead(al.id);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-primary hover:underline"
                        >
                          <span>Inspect Hardware</span>
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
