'use client';

import React, { useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Cpu,
  CreditCard,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  Zap,
} from 'lucide-react';
import { SubscriptionTier } from '@/lib/protocol/contract';
import { TIER_CATALOG } from '@/lib/entitlements/resolver';
import { useLiveStoreCatalog } from '@/lib/catalog/storeSync';
import { VirtualDeviceInstance } from '@/lib/simulator/types';
import {
  ManagedDeviceActivation,
  ManagedSubscriptionRecord,
  PaymentMode,
  useAdminErpStore,
} from '@/lib/admin/erpStore';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ThemedSelect,
  useToast,
} from '@/components/ui';

export interface AmcTicketItem {
  ticket_id: string;
  customer: string;
  tier: SubscriptionTier;
  device: string;
  issue: string;
  sla24h: boolean;
  status: 'OPEN' | 'SCHEDULED' | 'RESOLVED';
}

export function AdminBillingDevicesTab({
  actor,
  devicesList,
  amcTickets,
  onResolveAmc,
}: {
  actor: { uid: string; email: string };
  devicesList: VirtualDeviceInstance[];
  amcTickets: AmcTicketItem[];
  onResolveAmc: (ticketId: string) => void;
}) {
  const { storeConfig } = useLiveStoreCatalog();
  const {
    subscriptions,
    deviceStates,
    updateSubscriptionPlan,
    setDeviceActivationState,
  } = useAdminErpStore();
  const { pushToast } = useToast();

  const [selectedTiers, setSelectedTiers] = useState<Record<string, SubscriptionTier>>({});
  const [selectedModes, setSelectedModes] = useState<Record<string, PaymentMode>>({});
  const [deviceReason, setDeviceReason] = useState<string>('Routine bench inspection / RMA');

  const handleActivateOrRenew = async (sub: ManagedSubscriptionRecord) => {
    const nextTier = selectedTiers[sub.homeId] ?? sub.tier;
    const mode = selectedModes[sub.homeId] ?? sub.paymentMode;
    const price = storeConfig.tierPrices[nextTier] ?? TIER_CATALOG[nextTier].annualInr;

    await updateSubscriptionPlan(
      sub.homeId,
      {
        tier: nextTier,
        status: 'active',
        trialStatus: nextTier === 'core' ? 'Core Free Forever' : 'Annual Active (+365d)',
        paymentMode: mode,
        upiStatus: nextTier === 'core' ? 'CORE FLOOR' : 'PAID',
        logRenewalInr: price,
      },
      actor
    );
    pushToast({
      title: `Updated ${sub.customer} -> ${TIER_CATALOG[nextTier].displayName}`,
      description:
        price > 0
          ? `Logged ₹${price.toLocaleString('en-IN')} (${mode}) into Finance Ledger.`
          : 'Active on Core Free Forever.',
      tone: 'success',
    });
  };

  /**
   * Anti-Bricking Lock: Deactivating a paid plan explicitly downgrades to Core Free Forever.
   */
  const handleDowngradeToCore = async (sub: ManagedSubscriptionRecord) => {
    await updateSubscriptionPlan(
      sub.homeId,
      {
        tier: 'core',
        status: 'cancelled',
        trialStatus: 'Downgraded -> Core Free Forever',
        paymentMode: sub.paymentMode,
        upiStatus: 'CORE FLOOR',
      },
      actor
    );
    pushToast({
      title: `${sub.customer} Deactivated to Core (Free Forever)`,
      description:
        'Paid cloud extras disabled. 4-Tier control, 2D Grid, 5 local rules & hardware cutoffs stay 100% unlocked.',
      tone: 'warning',
    });
  };

  const handleDeviceAction = async (
    dev: VirtualDeviceInstance,
    activation: ManagedDeviceActivation['activation']
  ) => {
    if (!deviceReason.trim()) {
      pushToast({ title: 'Mandatory audit reason required', tone: 'warning' });
      return;
    }
    await setDeviceActivationState(
      {
        device_id: dev.device_id,
        home_id: 'home_imphal_001',
        module_code: dev.module_code,
        name: dev.name,
        activation,
        reason: deviceReason.trim(),
      },
      actor
    );
    pushToast({
      title: `${dev.device_id} -> ${activation}`,
      description: `Audit logged: ${deviceReason.trim()}`,
      tone: activation === 'ACTIVE' ? 'success' : 'warning',
    });
  };

  return (
    <div className="space-y-4">
      <Banner
        tone="success"
        title="Hard Anti-Bricking Floor Enforced"
        description="Deactivating or pausing any paid plan automatically downgrades the home to Core (Free Forever)—never blocking offline LAN/BLE control or G10/WAT-01/PWR-03 safety cutoffs."
      />

      {/* 1. Subscriptions Activation, Renewal & Anti-Bricking Downgrade Table */}
      <Card noPadding className="overflow-hidden hairline-border">
        <div className="p-3.5 border-b border-border/60 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <CreditCard className="h-4 w-4 text-primary" />
            <span>Customer Subscriptions, 4G M2M SIM &amp; Renewal Actions</span>
          </div>
          <Badge variant="mono">{subscriptions.length} Homes</Badge>
        </div>

        <div className="overflow-x-auto dd-scroll">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-elevated/60 text-[11px] font-mono text-foreground-muted">
                <th className="p-3">Customer / Home</th>
                <th className="p-3 min-w-[155px]">Assign Tier</th>
                <th className="p-3 min-w-[115px]">Payment Mode</th>
                <th className="p-3">SIM &amp; Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((row) => {
                const draftTier = selectedTiers[row.homeId] ?? row.tier;
                const draftMode = selectedModes[row.homeId] ?? row.paymentMode;

                return (
                  <tr key={row.homeId} className="border-b border-border/40 last:border-b-0">
                    <td className="p-3">
                      <div className="font-semibold text-foreground">{row.customer}</div>
                      <div className="text-[10px] font-mono text-foreground-muted">
                        {row.homeId} · {row.phone}
                      </div>
                    </td>

                    <td className="p-3">
                      <ThemedSelect
                        ariaLabel={`Plan tier for ${row.homeId}`}
                        value={draftTier}
                        onChange={(v) =>
                          setSelectedTiers((prev) => ({
                            ...prev,
                            [row.homeId]: v as SubscriptionTier,
                          }))
                        }
                        options={[
                          { value: 'core', label: 'Core (Free Forever)' },
                          { value: 'plus', label: `Plus (₹${storeConfig.tierPrices.plus})` },
                          { value: 'drive', label: `Drive (₹${storeConfig.tierPrices.drive})` },
                          { value: 'shield', label: `Shield (₹${storeConfig.tierPrices.shield})` },
                          {
                            value: 'all_in_family',
                            label: `All-In (₹${storeConfig.tierPrices.all_in_family})`,
                          },
                        ]}
                      />
                    </td>

                    <td className="p-3">
                      <ThemedSelect
                        ariaLabel={`Payment mode for ${row.homeId}`}
                        value={draftMode}
                        onChange={(v) =>
                          setSelectedModes((prev) => ({
                            ...prev,
                            [row.homeId]: v as PaymentMode,
                          }))
                        }
                        options={[
                          { value: 'UPI', label: 'UPI' },
                          { value: 'Cash', label: 'Cash' },
                          { value: 'Bank', label: 'Bank' },
                          { value: 'Card', label: 'Card' },
                        ]}
                      />
                    </td>

                    <td className="p-3 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant={
                            row.upiStatus === 'PAID'
                              ? 'success'
                              : row.upiStatus === 'DUE D-7'
                              ? 'warning'
                              : 'accent'
                          }
                        >
                          {row.upiStatus}
                        </Badge>
                        {row.dfy3dPurchased && <Badge variant="mono">DFY 3D</Badge>}
                      </div>
                      <div className="text-[10px] font-mono text-foreground-muted">
                        {row.trialStatus} · {row.simRenewal}
                      </div>
                    </td>

                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => void handleActivateOrRenew(row)}
                        >
                          <Zap className="h-3 w-3" />
                          <span>Activate</span>
                        </Button>
                        {row.tier !== 'core' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleDowngradeToCore(row)}
                          >
                            Downgrade Core
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 2. Hardware Node Activation / Quarantine / Unclaim Control (Audit Logged) */}
      <Card className="hairline-border space-y-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Cpu className="h-4 w-4 text-primary" />
            <span>Hardware Node Activation, Quarantine &amp; Unclaim</span>
          </CardTitle>
          <Badge variant="mono">WRITES admin_audit_logs</Badge>
        </CardHeader>

        <CardContent className="space-y-3 text-xs">
          <label className="block space-y-1">
            <span className="font-medium text-foreground-secondary">
              Mandatory Audit Reason for Hardware State Change *
            </span>
            <input
              type="text"
              value={deviceReason}
              onChange={(e) => setDeviceReason(e.target.value)}
              placeholder="e.g., RMA replacement, customer transfer, suspected tamper..."
              className="w-full h-9 rounded-xl border border-border bg-surface-elevated px-3 text-foreground"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {devicesList.map((dev) => {
              const st = deviceStates[dev.device_id]?.activation ?? 'ACTIVE';
              return (
                <div
                  key={dev.device_id}
                  className="rounded-xl border border-border bg-surface-elevated/60 p-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="accent">{dev.module_code}</Badge>
                      <span className="font-semibold text-foreground truncate">{dev.name}</span>
                      <Badge
                        variant={
                          st === 'ACTIVE' ? 'success' : st === 'QUARANTINED' ? 'danger' : 'warning'
                        }
                      >
                        {st}
                      </Badge>
                    </div>
                    <div className="text-[10px] font-mono text-foreground-muted mt-0.5">
                      {dev.device_id} · FW v{dev.info.fw_version}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant={st === 'ACTIVE' ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => void handleDeviceAction(dev, 'ACTIVE')}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Active</span>
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void handleDeviceAction(dev, 'QUARANTINED')}
                    >
                      <ShieldAlert className="h-3 w-3" />
                      <span>Quarantine</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDeviceAction(dev, 'UNCLAIMED')}
                    >
                      <Ban className="h-3 w-3" />
                      <span>Unclaim</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 3. Preserved AMC Tickets & 24h Swap Priority SLA */}
      <Card className="space-y-3 hairline-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wrench className="h-4 w-4 text-accent" />
            <span>AMC Tickets (`amc_tickets`)</span>
          </CardTitle>
          <Badge variant="warning">
            <ShieldCheck className="h-3 w-3" />
            <span>24h SWAP SLA — SHIELD / ALL-IN</span>
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {amcTickets.map((t) => (
            <div
              key={t.ticket_id}
              className="rounded-lg hairline-border bg-surface-elevated/70 p-3 flex flex-wrap items-center justify-between gap-2.5"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono font-semibold text-foreground">{t.ticket_id}</span>
                  <span className="font-medium text-foreground">{t.device}</span>
                  {t.sla24h && <Badge variant="danger">24h SWAP SLA</Badge>}
                  <Badge variant={t.status === 'RESOLVED' ? 'success' : 'warning'}>
                    {t.status}
                  </Badge>
                </div>
                <div className="text-foreground-secondary">{t.issue}</div>
                <div className="text-[10px] font-mono text-foreground-muted">{t.customer}</div>
              </div>

              {t.status !== 'RESOLVED' && (
                <Button variant="secondary" size="sm" onClick={() => onResolveAmc(t.ticket_id)}>
                  Mark Resolved
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
