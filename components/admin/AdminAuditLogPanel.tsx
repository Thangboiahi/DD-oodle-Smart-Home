'use client';

import React, { useMemo, useState } from 'react';
import { FileText, Search, ShieldCheck } from 'lucide-react';
import { AuditActionCategory, useAdminErpStore } from '@/lib/admin/erpStore';
import { Badge, Banner, Card, ThemedSelect } from '@/components/ui';

const AUDIT_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: 'All Audit Categories' },
  { value: 'PRICING', label: 'Pricing & Catalog' },
  { value: 'SUBSCRIPTION', label: 'Subscription & Billing' },
  { value: 'DEVICE_STATE', label: 'Device Activation' },
  { value: 'ACCOUNT', label: 'User Accounts & Roles' },
  { value: 'INSTALLER_AUTH', label: 'Installer Authority' },
  { value: 'QUOTE_CONVERT', label: 'Quote Pipeline' },
  { value: 'FINANCE', label: 'Finance Ledger' },
];

function categoryBadgeVariant(
  cat: AuditActionCategory
): 'accent' | 'success' | 'warning' | 'danger' | 'neutral' {
  switch (cat) {
    case 'PRICING':
    case 'QUOTE_CONVERT':
      return 'accent';
    case 'FINANCE':
    case 'SUBSCRIPTION':
      return 'success';
    case 'DEVICE_STATE':
    case 'INSTALLER_AUTH':
      return 'warning';
    case 'ACCOUNT':
      return 'neutral';
  }
}

export function AdminAuditLogPanel() {
  const { auditLogs } = useAdminErpStore();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditLogs.filter((entry) => {
      if (categoryFilter !== 'ALL' && entry.action_category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        entry.summary.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        entry.actor_email.toLowerCase().includes(q) ||
        entry.target_id.toLowerCase().includes(q) ||
        entry.target_collection.toLowerCase().includes(q)
      );
    });
  }, [auditLogs, search, categoryFilter]);

  return (
    <div className="space-y-4">
      <Banner
        tone="info"
        title="Immutable Admin Action Stream (admin_audit_logs)"
        description="Every live pricing override, subscription change, Core Free Forever downgrade, device activation/suspension, installer 3D permission grant, quote conversion, and manual transaction/expense is permanently recorded here with actor identity and timestamp."
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actor, action, target ID, or summary..."
              aria-label="Search audit logs"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <ThemedSelect
            ariaLabel="Filter audit log category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={AUDIT_CATEGORY_OPTIONS}
            className="min-w-[190px]"
          />
        </div>

        <span className="text-[11px] font-mono text-muted-foreground">
          Showing {filtered.length} of {auditLogs.length} immutable records
        </span>
      </div>

      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <Card className="p-6 text-center text-xs text-muted-foreground">
            No audit records match your search or category filter.
          </Card>
        ) : (
          filtered.map((entry) => (
            <Card key={entry.log_id} className="p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={categoryBadgeVariant(entry.action_category)}>
                      {entry.action_category}
                    </Badge>
                    <span className="font-mono text-xs font-bold text-foreground">
                      {entry.action}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {entry.target_collection}/{entry.target_id}
                    </span>
                  </div>
                  <p className="text-xs text-foreground">{entry.summary}</p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-primary" />
                      {entry.actor_email} ({entry.actor_uid})
                    </span>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1 shrink-0">
                  <FileText className="h-3 w-3" />
                  <span>
                    {new Date(entry.createdAtMs).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
