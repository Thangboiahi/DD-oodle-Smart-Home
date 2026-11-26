'use client';

import React, { useMemo, useState } from 'react';
import {
  Bell,
  Check,
  CreditCard,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { SubscriptionTier } from '@/lib/protocol/contract';
import {
  TIER_CATALOG,
  resolveEntitlements,
} from '@/lib/entitlements/resolver';
import { useLiveStoreCatalog } from '@/lib/catalog/storeSync';
import { useUnifiedFinance, useUnifiedHome } from '@/lib/data/unifiedStore';
import {
  Badge,
  Banner,
  Button,
  Card,
  SegmentedControl,
  TactileSwitch,
  useToast,
} from '@/components/ui';
import { CollapsibleSection, useWorkspace } from '@/components/workspace';
import { cn } from '@/lib/utils';

type PlanPreviewScenario = 'live_sync' | 'trial' | 'expired_core' | 'plus' | 'shield' | 'all_in_family';

const MATRIX_ROWS: Array<{
  feature: string;
  core: string;
  plus: string;
  drive: string;
  shield: string;
  all_in_family: string;
}> = [
  {
    feature: '4-Tier Fail-Safe Control & 2D Grid',
    core: 'Forever',
    plus: 'Included',
    drive: 'Included',
    shield: 'Included',
    all_in_family: 'Included',
  },
  {
    feature: 'Hardware Safety Cutoffs (G8/G10)',
    core: 'Forever',
    plus: 'Included',
    drive: 'Included',
    shield: 'Included',
    all_in_family: 'Included',
  },
  {
    feature: 'Local Schedules (`.../rules`)',
    core: 'Up to 5',
    plus: 'Up to 64 (Hub)',
    drive: 'Up to 5',
    shield: 'Up to 64 (Hub)',
    all_in_family: 'Up to 64 (Hub)',
  },
  {
    feature: '3D Home Twin + Voice C2C',
    core: '—',
    plus: 'Included',
    drive: '—',
    shield: 'Included',
    all_in_family: 'Included',
  },
  {
    feature: 'Log & Telemetry Retention',
    core: '24 Hours',
    plus: '90 Days',
    drive: '90 Days',
    shield: '90 Days',
    all_in_family: '90 Days',
  },
  {
    feature: 'VEH-01 4G M2M SIM + Crash SOS',
    core: '—',
    plus: '—',
    drive: 'Included (Yr-2+)',
    shield: '—',
    all_in_family: '1 Vehicle + Geofence',
  },
  {
    feature: 'Annual AMC + 24h Swap Priority',
    core: '—',
    plus: '—',
    drive: '—',
    shield: 'Included',
    all_in_family: 'Included',
  },
];

export default function BillingPage() {
  const { pushToast } = useToast();
  const { prefs } = useWorkspace();
  const { storeConfig } = useLiveStoreCatalog();
  const { subscription, entitlements: liveEntitlements } = useUnifiedHome(prefs.activeHomeId);
  const { updateSubscriptionPlan, setHomeDfy3dPurchased } = useUnifiedFinance();

  const [scenario, setScenario] = useState<PlanPreviewScenario>('live_sync');
  const [billingCycle, setBillingCycle] = useState<'annual' | 'monthly'>('annual');
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionTier>(
    subscription?.tier && subscription.tier !== 'core' ? subscription.tier : 'plus'
  );
  const [upiId, setUpiId] = useState('family@okaxis');
  const [upiModalOpen, setUpiModalOpen] = useState(false);

  const [reminders, setReminders] = useState({
    d30: true,
    d7: true,
    d1: true,
  });

  const [nowRef] = useState(() => Date.now());
  const dfyPurchased = subscription?.dfy3dPurchased ?? true;
  const dfyPriceInr = storeConfig.dfy3dPriceInr;

  const entitlements = useMemo(() => {
    if (scenario === 'live_sync') {
      return liveEntitlements;
    }
    const dayMs = 24 * 60 * 60 * 1000;
    if (scenario === 'trial') {
      return resolveEntitlements({
        tier: 'core',
        status: 'trial',
        trial_ends_at: nowRef + 89 * dayMs,
        expires_at: null,
        dfy_3d_purchased: dfyPurchased,
      });
    }
    if (scenario === 'expired_core') {
      return resolveEntitlements({
        tier: 'plus',
        status: 'expired',
        trial_ends_at: nowRef - 5 * dayMs,
        expires_at: nowRef - 1 * dayMs,
        dfy_3d_purchased: dfyPurchased,
      });
    }
    return resolveEntitlements({
      tier: scenario,
      status: 'active',
      trial_ends_at: null,
      expires_at: nowRef + 320 * dayMs,
      dfy_3d_purchased: dfyPurchased,
    });
  }, [scenario, liveEntitlements, dfyPurchased, nowRef]);

  const activeTierMeta = TIER_CATALOG[selectedPlan];
  const liveAnnualPrice = storeConfig.tierPrices[selectedPlan] ?? activeTierMeta.annualInr;
  const payableInr =
    billingCycle === 'annual' ? liveAnnualPrice : activeTierMeta.monthlyInr;

  const generateUpiLink = async () => {
    const upiUrl = `upi://pay?pa=ddoodle.billing@icici&pn=DD%20oodle%20Smart%20Home&am=${payableInr}&cu=INR&tn=${selectedPlan.toUpperCase()}_${billingCycle.toUpperCase()}`;
    await updateSubscriptionPlan(
      prefs.activeHomeId,
      {
        tier: selectedPlan,
        status: 'active',
        trialStatus:
          billingCycle === 'annual' ? 'Annual Active (+365d)' : 'Monthly Active (+30d)',
        paymentMode: 'UPI',
        upiStatus: 'PAID',
        logRenewalInr: payableInr,
      },
      {
        uid: 'demo_owner_01',
        email: 'owner@ddoodle.in',
      }
    );
    setScenario('live_sync');
    setUpiModalOpen(false);
    pushToast({
      title: `UPI Renewal Activated (${activeTierMeta.displayName} · ₹${payableInr.toLocaleString('en-IN')})`,
      description: `Synced to Admin Subscriptions & P&L Ledger · VPA ${upiId} · ${upiUrl.slice(0, 44)}...`,
      tone: 'success',
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      {/* Compact Top Plan Summary Pill Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border hairline-border bg-surface/80 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Plans &amp; Core Guarantee
              </h1>
              <Badge variant="accent">
                ACTIVE: {entitlements.effectiveTier.toUpperCase()}
              </Badge>
              {subscription && (
                <Badge variant={subscription.status === 'cancelled' ? 'warning' : 'success'}>
                  {subscription.trialStatus}
                </Badge>
              )}
            </div>
            <p className="text-[11px] font-mono text-foreground-muted">
              homes/{prefs.activeHomeId}/subscription · Zero Cloud Lock-In
            </p>
          </div>
        </div>

        <SegmentedControl<PlanPreviewScenario>
          size="sm"
          ariaLabel="Subscription State Preview"
          value={scenario}
          onChange={setScenario}
          options={[
            { value: 'live_sync', label: 'Live Home Plan' },
            { value: 'trial', label: '90d Trial' },
            { value: 'expired_core', label: 'Expired→Core' },
            { value: 'plus', label: 'Plus' },
            { value: 'shield', label: 'Shield' },
            { value: 'all_in_family', label: 'All-In' },
          ]}
        />
      </div>

      {/* Graceful Downgrade Notice when testing Expired -> Core or when Admin downgrades home */}
      {(entitlements.degradedToCore || subscription?.status === 'cancelled') && (
        <Banner
          tone="warning"
          title="Plan Deactivated / Expired — Gracefully Degraded to Core (Free Forever)"
          description="All 4-Tier Fail-Safe controls, 2D Room Grid, up to 5 local schedules, 24h logs, standard FCM push, and hardware safety cutoffs remain 100% unlocked."
        />
      )}

      {/* Collapsible Core Free Forever Guarantee Accordion */}
      <CollapsibleSection
        sectionId="billing_core_free_forever_accordion"
        title="Core (Free Forever) — Hard Anti-Bricking Guarantee"
        subtitle="₹0 Forever · Hardware never locks out"
        icon={<ShieldCheck className="h-4 w-4 text-success" />}
        defaultCollapsed={false}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
          {[
            '4-Tier Fail-Safe Control (Cloud / Hub / LAN / BLE)',
            '2D Room Grid & Capability Switchboards',
            'Up to 5 Local ESP32 Schedules (.../rules)',
            '24-Hour Live Telemetry & Event Logs',
            'Standard FCM Push Notifications',
            'All Hardware Safety Cutoffs (Dry-Run / 45m Geyser)',
          ].map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 rounded-xl border hairline-border bg-surface-elevated/60 px-2.5 py-2 text-foreground"
            >
              <Check className="h-3.5 w-3.5 text-success shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Billing Cycle Toggle + DFY 3D Add-On Pill */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border hairline-border bg-surface/75 px-3 py-2">
        <SegmentedControl<'annual' | 'monthly'>
          size="sm"
          ariaLabel="Billing Cycle"
          value={billingCycle}
          onChange={setBillingCycle}
          options={[
            { value: 'annual', label: 'Annual UPI (Save 16%)' },
            { value: 'monthly', label: 'Monthly' },
          ]}
        />

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={dfyPurchased ? 'success' : 'accent'}>
            <Sparkles className="h-3 w-3" />
            <span>
              DFY 3D Twin: ₹{dfyPriceInr} One-Time ({dfyPurchased ? 'OWNED' : 'ADD-ON'})
            </span>
          </Badge>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const nextVal = !dfyPurchased;
              void setHomeDfy3dPurchased(prefs.activeHomeId, nextVal, {
                uid: 'demo_owner_01',
                email: 'owner@ddoodle.in',
              });
              pushToast({
                title: nextVal ? 'DFY 3D Home Twin Activated' : 'DFY 3D Add-On Disabled',
                description: `One-time ₹${dfyPriceInr} custom floorplan scan synced with Admin`,
                tone: 'info',
              });
            }}
          >
            {dfyPurchased ? 'Owned' : `+ Add ₹${dfyPriceInr}`}
          </Button>
        </div>
      </div>

      {/* Mobile: Horizontal Swipeable Snap-Carousel of Plan Cards (Zero Vertical Wall) */}
      <div className="md:hidden snap-strip gap-3 pb-1">
        {(Object.keys(TIER_CATALOG) as SubscriptionTier[]).map((tierKey) => {
          const meta = TIER_CATALOG[tierKey];
          const price = billingCycle === 'annual' ? meta.annualInr : meta.monthlyInr;
          const isSelected = selectedPlan === tierKey;
          return (
            <div
              key={tierKey}
              className={cn(
                'snap-center shrink-0 w-[275px] rounded-2xl border bg-surface p-3.5 flex flex-col justify-between space-y-3',
                isSelected
                  ? 'border-accent ring-1 ring-accent/30'
                  : 'hairline-border'
              )}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{meta.displayName}</div>
                    {meta.trialDays > 0 && (
                      <Badge variant="accent" className="mt-1 text-[10px]">
                        {meta.trialDays}-Day Free Trial
                      </Badge>
                    )}
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-base font-bold text-accent">
                      {price === 0 ? '₹0' : `₹${price.toLocaleString('en-IN')}`}
                    </div>
                    <div className="text-[10px] text-foreground-muted">
                      {price === 0 ? 'FOREVER' : billingCycle === 'annual' ? '/ YEAR' : '/ MONTH'}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-foreground-secondary leading-relaxed">
                  {meta.summary}
                </p>
              </div>

              {tierKey !== 'core' ? (
                <Button
                  variant={isSelected ? 'primary' : 'secondary'}
                  size="sm"
                  className="w-full"
                  touchTarget
                  onClick={() => {
                    setSelectedPlan(tierKey);
                    setUpiModalOpen(true);
                  }}
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Renew via UPI</span>
                </Button>
              ) : (
                <div className="rounded-xl border border-success/35 bg-success-soft py-2 text-center text-[11px] font-mono font-semibold text-success">
                  INCLUDED FOREVER
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tablet / Desktop Comparison Matrix Table */}
      <Card noPadding className="hidden md:block overflow-hidden rounded-2xl hairline-border">
        <div className="overflow-x-auto dd-scroll">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b hairline-border bg-surface-elevated/60">
                <th className="p-3.5 font-semibold text-foreground-secondary">Capability / SLA</th>
                {(Object.keys(TIER_CATALOG) as SubscriptionTier[]).map((tierKey) => {
                  const meta = TIER_CATALOG[tierKey];
                  const price = billingCycle === 'annual' ? meta.annualInr : meta.monthlyInr;
                  const isSelected = selectedPlan === tierKey;
                  return (
                    <th key={tierKey} className="p-3 align-top">
                      <button
                        type="button"
                        onClick={() => {
                          if (tierKey !== 'core') {
                            setSelectedPlan(tierKey);
                            setUpiModalOpen(true);
                          }
                        }}
                        className={cn(
                          'text-left w-full rounded-xl p-2.5 border transition-colors cursor-pointer',
                          isSelected
                            ? 'border-accent-border bg-accent-soft/60'
                            : 'border-transparent hover:bg-surface-muted'
                        )}
                      >
                        <div className="font-semibold text-foreground">{meta.displayName}</div>
                        <div className="font-mono text-sm font-bold text-accent tabular-nums mt-0.5">
                          {price === 0
                            ? '₹0 Forever'
                            : `₹${price.toLocaleString('en-IN')}/${billingCycle === 'annual' ? 'yr' : 'mo'}`}
                        </div>
                        {tierKey !== 'core' && (
                          <div className="text-[10px] font-mono text-foreground-muted mt-1 underline">
                            Renew via UPI →
                          </div>
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {MATRIX_ROWS.map((row) => (
                <tr key={row.feature} className="border-b hairline-border last:border-b-0">
                  <td className="p-3.5 font-medium text-foreground">{row.feature}</td>
                  <td className="p-3.5 font-mono text-foreground-secondary">{row.core}</td>
                  <td className="p-3.5 font-mono text-foreground">{row.plus}</td>
                  <td className="p-3.5 font-mono text-foreground">{row.drive}</td>
                  <td className="p-3.5 font-mono text-foreground">{row.shield}</td>
                  <td className="p-3.5 font-mono text-accent font-medium">{row.all_in_family}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Collapsible Renewal Reminders & Instant UPI Action Bar */}
      <CollapsibleSection
        sectionId="billing_renewal_reminders"
        title="Renewal Reminders & UPI Checkout"
        subtitle={`${activeTierMeta.displayName} · ₹${payableInr.toLocaleString('en-IN')}/${billingCycle === 'annual' ? 'yr' : 'mo'}`}
        icon={<Bell className="h-3.5 w-3.5" />}
        defaultCollapsed={true}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setUpiModalOpen(true)}
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>Open UPI Checkout</span>
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <TactileSwitch
            label="D-30 Early Reminder"
            sublabel="30 days before expiry via FCM & WhatsApp"
            checked={reminders.d30}
            onChange={(next) => setReminders((r) => ({ ...r, d30: next }))}
          />
          <TactileSwitch
            label="D-7 Renewal Notice"
            sublabel="7 days before expiry with 1-tap UPI link"
            checked={reminders.d7}
            onChange={(next) => setReminders((r) => ({ ...r, d7: next }))}
          />
          <TactileSwitch
            label="D-1 Final Grace Notice"
            sublabel="Reminds that Core Free Floor stays active"
            checked={reminders.d1}
            onChange={(next) => setReminders((r) => ({ ...r, d1: next }))}
          />
        </div>
      </CollapsibleSection>

      {/* Modal / Bottom Sheet UPI Renewal Dialog */}
      {upiModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setUpiModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upi-checkout-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-surface shadow-2xl p-4 sm:p-5 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-accent" />
                  <h2 id="upi-checkout-title" className="text-sm font-semibold text-foreground">
                    UPI Instant Renewal ({activeTierMeta.displayName})
                  </h2>
                </div>
                <p className="text-[11px] text-foreground-muted mt-0.5">
                  Zero auto-debit trap · Manual annual or monthly UPI intent
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUpiModalOpen(false)}
                aria-label="Close UPI modal"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground-secondary hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border hairline-border bg-surface-elevated/70 p-3 flex items-center justify-between font-mono">
              <div>
                <div className="text-[10px] text-foreground-muted">SELECTED PLAN</div>
                <div className="text-sm font-bold text-foreground">{activeTierMeta.displayName}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-foreground-muted uppercase">{billingCycle}</div>
                <div className="text-base font-bold text-accent tabular-nums">
                  ₹{payableInr.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <label className="block space-y-1">
              <span className="text-foreground-secondary font-medium">Your UPI VPA (GPay / PhonePe / Paytm)</span>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="w-full h-10 rounded-xl border border-border bg-surface-elevated px-3 font-mono text-xs text-foreground focus:outline-none focus:border-accent"
              />
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t hairline-border">
              <Button variant="ghost" size="sm" onClick={() => setUpiModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                touchTarget
                disabled={payableInr === 0}
                onClick={generateUpiLink}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Pay ₹{payableInr.toLocaleString('en-IN')} via UPI</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
