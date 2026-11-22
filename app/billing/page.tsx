'use client';

import React, { useMemo, useState } from 'react';
import {
  Bell,
  Check,
  CreditCard,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { SubscriptionTier } from '@/lib/protocol/contract';
import {
  DFY_3D_TWIN_ADDON_INR,
  TIER_CATALOG,
  resolveEntitlements,
} from '@/lib/entitlements/resolver';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SegmentedControl,
  TactileSwitch,
  useToast,
} from '@/components/ui';

type PlanPreviewScenario = 'trial' | 'expired_core' | 'plus' | 'shield' | 'all_in_family';

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

  const [scenario, setScenario] = useState<PlanPreviewScenario>('trial');
  const [billingCycle, setBillingCycle] = useState<'annual' | 'monthly'>('annual');
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionTier>('plus');
  const [dfyPurchased, setDfyPurchased] = useState(false);
  const [upiId, setUpiId] = useState('family@okaxis');

  const [reminders, setReminders] = useState({
    d30: true,
    d7: true,
    d1: true,
  });

  const [nowRef] = useState(() => Date.now());

  const entitlements = useMemo(() => {
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
  }, [scenario, dfyPurchased, nowRef]);

  const activeTierMeta = TIER_CATALOG[selectedPlan];
  const payableInr =
    billingCycle === 'annual' ? activeTierMeta.annualInr : activeTierMeta.monthlyInr;

  const generateUpiLink = () => {
    const upiUrl = `upi://pay?pa=ddoodle.billing@icici&pn=DD%20oodle%20Smart%20Home&am=${payableInr}&cu=INR&tn=${selectedPlan.toUpperCase()}_${billingCycle.toUpperCase()}`;
    pushToast({
      title: `UPI Payment Link Ready (₹${payableInr})`,
      description: `VPA ${upiId} · ${upiUrl.slice(0, 56)}...`,
      tone: 'success',
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Subscription, Trial &amp; Anti-Bricking Floor
          </h1>
          <p className="text-xs text-foreground-secondary font-mono">
            homes/home_imphal_001/subscription · Effective Tier:{' '}
            <strong className="text-accent uppercase">{entitlements.effectiveTier}</strong>
          </p>
        </div>

        <SegmentedControl<PlanPreviewScenario>
          size="sm"
          ariaLabel="Subscription State Preview"
          value={scenario}
          onChange={setScenario}
          options={[
            { value: 'trial', label: '90d Trial' },
            { value: 'expired_core', label: 'Expired→Core' },
            { value: 'plus', label: 'Plus' },
            { value: 'shield', label: 'Shield' },
            { value: 'all_in_family', label: 'All-In' },
          ]}
        />
      </div>

      {/* 90-Day Trial Countdown or Graceful Downgrade Banner */}
      {entitlements.isTrialActive ? (
        <Banner
          tone="info"
          title={`90-Day Plus Trial Active — ${entitlements.trialDaysRemaining} Days Remaining`}
          description="You have full access to the 3D Home Twin, Pro Logic Automations, Voice C2C, and 90-day analytics. No card required."
        />
      ) : entitlements.degradedToCore ? (
        <Banner
          tone="warning"
          title="Plan Expired — Gracefully Degraded to Core (Free Forever)"
          description="All 4-Tier Fail-Safe controls, 2D Room Grid, up to 5 local schedules, 24h logs, standard FCM push, and hardware safety cutoffs remain 100% unlocked."
        />
      ) : null}

      {/* Core Free Forever Anti-Bricking Floor Card */}
      <Card className="border-success/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-success" />
            <div>
              <CardTitle>Core (Free Forever — Anti-Bricking Guarantee)</CardTitle>
              <p className="text-xs text-foreground-secondary">
                Hardware never bricks or locks out if a subscription expires.
              </p>
            </div>
          </div>
          <Badge variant="success">₹0 FOREVER</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
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
              className="flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-2.5 py-2 text-foreground"
            >
              <Check className="h-3.5 w-3.5 text-success shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Billing Cycle Toggle + DFY 3D Add-On Status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<'annual' | 'monthly'>
          ariaLabel="Billing Cycle"
          value={billingCycle}
          onChange={setBillingCycle}
          options={[
            { value: 'annual', label: 'Annual UPI (Save ~16%)' },
            { value: 'monthly', label: 'Monthly' },
          ]}
        />

        <div className="flex items-center gap-2">
          <Badge variant={dfyPurchased ? 'success' : 'accent'}>
            <Sparkles className="h-3 w-3" />
            <span>
              DFY 3D Twin Add-On: ₹{DFY_3D_TWIN_ADDON_INR} One-Time ({dfyPurchased ? 'OWNED' : 'AVAILABLE'})
            </span>
          </Badge>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDfyPurchased((p) => !p);
              pushToast({
                title: dfyPurchased ? 'DFY 3D Add-On Removed (Preview)' : 'DFY 3D Home Twin Added',
                description: `One-time ₹${DFY_3D_TWIN_ADDON_INR} custom floorplan scan`,
                tone: 'info',
              });
            }}
          >
            {dfyPurchased ? 'Owned' : `Add ₹${DFY_3D_TWIN_ADDON_INR}`}
          </Button>
        </div>
      </div>

      {/* Responsive Plan Comparison — Stacked Cards on Mobile, Clean Table on Desktop */}
      <div className="grid grid-cols-1 md:hidden gap-3">
        {(Object.keys(TIER_CATALOG) as SubscriptionTier[]).map((tierKey) => {
          const meta = TIER_CATALOG[tierKey];
          const price = billingCycle === 'annual' ? meta.annualInr : meta.monthlyInr;
          const isSelected = selectedPlan === tierKey;
          return (
            <Card
              key={tierKey}
              className={isSelected ? 'border-accent-border ring-1 ring-accent/25' : undefined}
            >
              <CardHeader>
                <div>
                  <CardTitle>{meta.displayName}</CardTitle>
                  {meta.trialDays > 0 && (
                    <Badge variant="accent" className="mt-1">
                      {meta.trialDays}-Day Free Trial
                    </Badge>
                  )}
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-lg font-bold">
                    {price === 0 ? '₹0' : `₹${price.toLocaleString('en-IN')}`}
                  </div>
                  <div className="text-[10px] text-foreground-muted">
                    {price === 0 ? 'FOREVER' : billingCycle === 'annual' ? '/ YEAR' : '/ MONTH'}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <p className="text-foreground-secondary">{meta.summary}</p>
                {tierKey !== 'core' && (
                  <Button
                    variant={isSelected ? 'primary' : 'secondary'}
                    className="w-full"
                    touchTarget
                    onClick={() => setSelectedPlan(tierKey)}
                  >
                    {isSelected ? 'Selected for UPI Renewal' : `Select ${meta.displayName}`}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tablet/Desktop Comparison Matrix Table */}
      <Card noPadding className="hidden md:block overflow-hidden">
        <div className="overflow-x-auto dd-scroll">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-elevated">
                <th className="p-3.5 font-semibold text-foreground-secondary">Capability / SLA</th>
                {(Object.keys(TIER_CATALOG) as SubscriptionTier[]).map((tierKey) => {
                  const meta = TIER_CATALOG[tierKey];
                  const price = billingCycle === 'annual' ? meta.annualInr : meta.monthlyInr;
                  const isSelected = selectedPlan === tierKey;
                  return (
                    <th key={tierKey} className="p-3.5 align-top">
                      <button
                        type="button"
                        onClick={() => tierKey !== 'core' && setSelectedPlan(tierKey)}
                        className={`text-left w-full rounded-lg p-2 border transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-accent-border bg-accent-soft/60'
                            : 'border-transparent hover:bg-surface-muted'
                        }`}
                      >
                        <div className="font-semibold text-foreground">{meta.displayName}</div>
                        <div className="font-mono text-sm font-bold text-accent tabular-nums mt-0.5">
                          {price === 0
                            ? '₹0 Forever'
                            : `₹${price.toLocaleString('en-IN')}/${billingCycle === 'annual' ? 'yr' : 'mo'}`}
                        </div>
                        {meta.trialDays > 0 && (
                          <div className="text-[10px] font-mono text-success mt-0.5">
                            90-day trial
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
                <tr key={row.feature} className="border-b border-border/60 last:border-b-0">
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

      {/* UPI Annual Payment Link & Renewal Reminder Preferences */}
      <div className="grid grid-cols-1 lg:grid-cols-2 dd-grid-gap">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-accent" />
              <span>UPI Instant Renewal ({activeTierMeta.displayName})</span>
            </CardTitle>
            <Badge variant="mono">
              ₹{payableInr.toLocaleString('en-IN')}/{billingCycle === 'annual' ? 'yr' : 'mo'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <label className="block space-y-1">
              <span className="text-foreground-secondary font-medium">Your UPI VPA</span>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="w-full h-10 rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated px-3 font-mono text-xs text-foreground focus:outline-none focus:border-accent"
              />
            </label>
            <Button
              variant="primary"
              className="w-full"
              touchTarget
              disabled={payableInr === 0}
              onClick={generateUpiLink}
            >
              <Zap className="h-3.5 w-3.5" />
              <span>
                Pay ₹{payableInr.toLocaleString('en-IN')} via UPI ({activeTierMeta.displayName})
              </span>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-accent" />
              <span>Renewal Reminder Preferences</span>
            </CardTitle>
            <Badge variant="mono">WHATSAPP + PUSH</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <TactileSwitch
              label="D-30 Advance Reminder"
              sublabel="30 days before expiry via WhatsApp & FCM"
              checked={reminders.d30}
              onChange={(v) => setReminders((r) => ({ ...r, d30: v }))}
            />
            <TactileSwitch
              label="D-7 Renewal Reminder"
              sublabel="7 days before expiry with 1-tap UPI link"
              checked={reminders.d7}
              onChange={(v) => setReminders((r) => ({ ...r, d7: v }))}
            />
            <TactileSwitch
              label="D-1 Final Notice"
              sublabel="24 hours before graceful Core Floor fallback"
              checked={reminders.d1}
              onChange={(v) => setReminders((r) => ({ ...r, d1: v }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
