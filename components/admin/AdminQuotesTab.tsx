'use client';

import React, { useState } from 'react';
import { ArrowRightCircle, CheckCircle2, ExternalLink, MessageCircle, Search } from 'lucide-react';
import { TIER_CATALOG } from '@/lib/entitlements/resolver';
import { useLiveStoreCatalog } from '@/lib/catalog/storeSync';
import {
  buildWhatsAppQuoteUrl,
  QuoteRecord,
  QuoteStatus,
} from '@/lib/quotes/quoteService';
import { PaymentMode, useAdminErpStore } from '@/lib/admin/erpStore';
import { Badge, Button, Card, ThemedSelect, useToast } from '@/components/ui';

const QUOTE_STATUS_OPTIONS: Array<{ value: QuoteStatus; label: string }> = [
  { value: 'NEW', label: 'NEW' },
  { value: 'CONTACTED', label: 'CONTACTED' },
  { value: 'APPROVED', label: 'APPROVED' },
  { value: 'CONVERTED', label: 'CONVERTED' },
  { value: 'ARCHIVED', label: 'ARCHIVED' },
];

export function AdminQuotesTab({
  actor,
}: {
  actor: { uid: string; email: string };
}) {
  const { storeConfig } = useLiveStoreCatalog();
  const {
    quotes,
    accounts,
    setQuoteStatus,
    convertQuoteToOrderAndJob,
  } = useAdminErpStore();
  const { pushToast } = useToast();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | QuoteStatus>('ALL');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('UPI');
  const installers = accounts.filter(
    (a) => (a.role === 'installer' || a.role === 'admin') && a.status === 'ACTIVE'
  );
  const [assigneeUid, setAssigneeUid] = useState('uid_installer_manipur_01');

  const filtered = quotes.filter((q) => {
    if (statusFilter !== 'ALL' && q.status !== statusFilter) return false;
    const term = query.trim().toLowerCase();
    if (
      term &&
      !`${q.quote_ref} ${q.buyerName} ${q.buyerPhone} ${q.city}`.toLowerCase().includes(term)
    ) {
      return false;
    }
    return true;
  });

  const handleConvert = async (quote: QuoteRecord) => {
    const inst = installers.find((i) => i.uid === assigneeUid) ?? installers[0];
    const res = await convertQuoteToOrderAndJob(
      quote,
      {
        installerUid: inst?.uid || 'uid_installer_manipur_01',
        installerName: inst?.name || 'Bikramjit Singh (Field Tech)',
        paymentMode,
      },
      actor
    );
    pushToast({
      title: `Converted ${quote.quote_ref} -> Order & Installer Job`,
      description: `Income + BOM COGS logged in Finance Ledger · Job assigned for ${res.homeId}`,
      tone: 'success',
    });
  };

  return (
    <div className="space-y-4">
      <Card className="hairline-border p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessageCircle className="h-4 w-4 text-primary" />
            <span>Incoming Storefront &amp; WhatsApp Quotes ({filtered.length})</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="w-48">
              <ThemedSelect
                ariaLabel="Default installer for conversion"
                value={assigneeUid}
                onChange={setAssigneeUid}
                options={installers.map((i) => ({ value: i.uid, label: `Job → ${i.name}` }))}
              />
            </div>
            <div className="w-28">
              <ThemedSelect
                ariaLabel="Payment mode for conversion"
                value={paymentMode}
                onChange={(v) => setPaymentMode(v as PaymentMode)}
                options={[
                  { value: 'UPI', label: 'Pay: UPI' },
                  { value: 'Bank', label: 'Pay: Bank' },
                  { value: 'Cash', label: 'Pay: Cash' },
                  { value: 'Card', label: 'Pay: Card' },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-3.5 w-3.5 text-foreground-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search quote ref, customer name, phone, or city..."
              className="w-full h-9 rounded-xl border border-border bg-surface-elevated pl-8 pr-3 text-xs text-foreground"
            />
          </div>
          <div className="w-40">
            <ThemedSelect
              ariaLabel="Filter quote status"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as 'ALL' | QuoteStatus)}
              options={[
                { value: 'ALL', label: `All (${quotes.length})` },
                ...QUOTE_STATUS_OPTIONS,
              ]}
            />
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {filtered.map((q) => {
          const bomCostTotal = q.items.reduce((s, i) => s + i.unitBomInr * i.qty, 0);
          const waUrl = buildWhatsAppQuoteUrl(storeConfig.whatsappSalesNumber, q);

          return (
            <Card key={q.quote_id} className="hairline-border space-y-3 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-primary">{q.quote_ref}</span>
                    <span className="font-semibold text-sm text-foreground">{q.buyerName}</span>
                    <Badge
                      variant={
                        q.status === 'CONVERTED'
                          ? 'success'
                          : q.status === 'APPROVED'
                          ? 'accent'
                          : q.status === 'NEW'
                          ? 'warning'
                          : 'mono'
                      }
                    >
                      {q.status}
                    </Badge>
                    {q.includeDfy3d && <Badge variant="mono">+ DFY 3D TWIN</Badge>}
                  </div>
                  <div className="text-[11px] font-mono text-foreground-secondary">
                    {q.buyerPhone} · {q.city} · {q.homeType} · Plan:{' '}
                    {TIER_CATALOG[q.subscriptionTier].displayName}
                  </div>
                  {q.notes && <p className="text-[11px] text-foreground-muted">{q.notes}</p>}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-right font-mono tabular-nums pr-2">
                    <div className="text-base font-bold text-foreground">
                      ₹{q.grandTotalInr.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] text-foreground-muted">
                      Est BOM COGS: ₹{bomCostTotal.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div className="w-36">
                    <ThemedSelect
                      ariaLabel={`Status for ${q.quote_ref}`}
                      value={q.status}
                      onChange={(v) => void setQuoteStatus(q.quote_id, v as QuoteStatus, actor)}
                      options={QUOTE_STATUS_OPTIONS}
                    />
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/50">
                {q.items.map((item) => (
                  <Badge key={item.module_code} variant="mono">
                    {item.module_code} × {item.qty} (₹
                    {(item.unitRetailInr * item.qty).toLocaleString('en-IN')})
                  </Badge>
                ))}
              </div>

              {/* Action Footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50">
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono text-primary hover:underline"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>Open WhatsApp Quote Draft</span>
                  <ExternalLink className="h-3 w-3" />
                </a>

                {q.status === 'CONVERTED' ? (
                  <Badge variant="success">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Converted &rarr; {q.homeId}</span>
                  </Badge>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleConvert(q)}
                  >
                    <ArrowRightCircle className="h-3.5 w-3.5" />
                    <span>1-Tap Convert Quote to Order &amp; Job</span>
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
