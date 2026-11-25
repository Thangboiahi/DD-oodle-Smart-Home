'use client';

import React, { useState } from 'react';
import { Check, IndianRupee, Search, Settings2, Tag } from 'lucide-react';
import { SubscriptionTier } from '@/lib/protocol/contract';
import { TIER_CATALOG } from '@/lib/entitlements/resolver';
import { ModuleAvailability } from '@/lib/catalog/hardwareRegistry';
import {
  LiveCatalogModule,
  StoreConfigDoc,
  useLiveStoreCatalog,
} from '@/lib/catalog/storeSync';
import { appendAuditLog } from '@/lib/admin/erpStore';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  TactileSwitch,
  ThemedSelect,
  useToast,
} from '@/components/ui';

const AVAILABILITY_OPTIONS: Array<{ value: ModuleAvailability; label: string }> = [
  { value: 'IN_STOCK', label: 'IN STOCK' },
  { value: 'PRE_ORDER', label: 'PRE-ORDER' },
  { value: 'COMING_SOON', label: 'COMING SOON' },
  { value: 'HIDDEN', label: 'HIDDEN' },
];

export function AdminPricingTab({
  actor,
}: {
  actor: { uid: string; email: string };
}) {
  const { modules, storeConfig, saveModuleOverride, saveStoreConfig } =
    useLiveStoreCatalog();
  const { pushToast } = useToast();

  const [query, setQuery] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<'ALL' | '1' | '2' | '3'>('ALL');
  const [editingDrafts, setEditingDrafts] = useState<
    Record<
      string,
      { retailInr: number; installInr: number; bomInr: number; availability: ModuleAvailability }
    >
  >({});

  const [configDraft, setConfigDraft] = useState<StoreConfigDoc | null>(null);
  const effectiveConfig = configDraft ?? storeConfig;

  const filtered = modules.filter((m) => {
    if (phaseFilter !== 'ALL' && String(m.phase) !== phaseFilter) return false;
    const q = query.trim().toLowerCase();
    if (
      q &&
      !`${m.module_code} ${m.name} ${m.category}`.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  const getModuleDraft = (mod: LiveCatalogModule) =>
    editingDrafts[mod.module_code] ?? {
      retailInr: mod.retailInr,
      installInr: mod.installInr,
      bomInr: mod.bomInr,
      availability: mod.availability,
    };

  const patchModuleDraft = (
    mod: LiveCatalogModule,
    patch: Partial<{
      retailInr: number;
      installInr: number;
      bomInr: number;
      availability: ModuleAvailability;
    }>
  ) => {
    const current = getModuleDraft(mod);
    setEditingDrafts((prev) => ({
      ...prev,
      [mod.module_code]: { ...current, ...patch },
    }));
  };

  const saveModuleRow = async (mod: LiveCatalogModule) => {
    const d = getModuleDraft(mod);
    await saveModuleOverride({
      module_code: mod.module_code,
      retailInr: Math.max(0, Number(d.retailInr) || 0),
      installInr: Math.max(0, Number(d.installInr) || 0),
      bomInr: Math.max(0, Number(d.bomInr) || 0),
      availability: d.availability,
      updatedAtMs: Date.now(),
    });
    await appendAuditLog({
      actor_uid: actor.uid,
      actor_email: actor.email,
      action_category: 'PRICING',
      action: 'UPDATE_MODULE_PRICING',
      target_collection: 'catalog_modules',
      target_id: mod.module_code,
      summary: `${mod.module_code}: MRP ₹${d.retailInr}, Install ₹${d.installInr}, BOM ₹${d.bomInr}, Status ${d.availability}`,
    });
    pushToast({
      title: `Saved ${mod.module_code} Pricing`,
      description: `Live MRP ₹${d.retailInr.toLocaleString('en-IN')} · Reflected on / & /shop`,
      tone: 'success',
    });
  };

  const saveStoreSettings = async () => {
    await saveStoreConfig(effectiveConfig);
    await appendAuditLog({
      actor_uid: actor.uid,
      actor_email: actor.email,
      action_category: 'PRICING',
      action: 'UPDATE_STORE_CONFIG',
      target_collection: 'store_config',
      target_id: 'main',
      summary: `WhatsApp ${effectiveConfig.whatsappSalesNumber}, DFY ₹${effectiveConfig.dfy3dPriceInr}, Plus ₹${effectiveConfig.tierPrices.plus}/yr, Offer ${effectiveConfig.globalDiscountPct}%`,
    });
    setConfigDraft(null);
    pushToast({
      title: 'Store & Subscription Config Synced',
      description: 'Updated live /shop subscription prices & WhatsApp sales desk.',
      tone: 'success',
    });
  };

  return (
    <div className="space-y-4">
      {/* 1. Store Config & Subscription Tier Pricing Editor */}
      <Card className="hairline-border space-y-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Settings2 className="h-4 w-4 text-primary" />
            <span>Global Storefront, WhatsApp &amp; Subscription Tier Config</span>
          </CardTitle>
          <Badge variant="success">SYNCS LIVE TO / &amp; /shop</Badge>
        </CardHeader>

        <CardContent className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="space-y-1">
              <span className="font-medium text-foreground-secondary">WhatsApp Desk (E.164 digits)</span>
              <input
                type="text"
                value={effectiveConfig.whatsappSalesNumber}
                onChange={(e) =>
                  setConfigDraft({
                    ...effectiveConfig,
                    whatsappSalesNumber: e.target.value.replace(/\D/g, ''),
                  })
                }
                className="w-full h-9 rounded-xl border border-border bg-surface-elevated px-2.5 font-mono text-foreground"
              />
            </label>

            <label className="space-y-1">
              <span className="font-medium text-foreground-secondary">DFY 3D Twin (₹)</span>
              <input
                type="number"
                value={effectiveConfig.dfy3dPriceInr}
                onChange={(e) =>
                  setConfigDraft({
                    ...effectiveConfig,
                    dfy3dPriceInr: Number(e.target.value) || 0,
                  })
                }
                className="w-full h-9 rounded-xl border border-border bg-surface-elevated px-2.5 font-mono text-foreground tabular-nums"
              />
            </label>

            <label className="space-y-1">
              <span className="font-medium text-foreground-secondary">Plus Trial Days</span>
              <input
                type="number"
                value={effectiveConfig.plusTrialDays}
                onChange={(e) =>
                  setConfigDraft({
                    ...effectiveConfig,
                    plusTrialDays: Number(e.target.value) || 0,
                  })
                }
                className="w-full h-9 rounded-xl border border-border bg-surface-elevated px-2.5 font-mono text-foreground tabular-nums"
              />
            </label>

            <label className="space-y-1">
              <span className="font-medium text-foreground-secondary">Global Discount (%)</span>
              <input
                type="number"
                min={0}
                max={45}
                value={effectiveConfig.globalDiscountPct}
                onChange={(e) =>
                  setConfigDraft({
                    ...effectiveConfig,
                    globalDiscountPct: Math.min(45, Math.max(0, Number(e.target.value) || 0)),
                  })
                }
                className="w-full h-9 rounded-xl border border-border bg-surface-elevated px-2.5 font-mono text-foreground tabular-nums"
              />
            </label>

            <label className="space-y-1">
              <span className="font-medium text-foreground-secondary">GST (%)</span>
              <input
                type="number"
                min={0}
                max={28}
                value={effectiveConfig.gstPercent}
                onChange={(e) =>
                  setConfigDraft({
                    ...effectiveConfig,
                    gstPercent: Number(e.target.value) || 0,
                  })
                }
                className="w-full h-9 rounded-xl border border-border bg-surface-elevated px-2.5 font-mono text-foreground tabular-nums"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {(['core', 'plus', 'drive', 'shield', 'all_in_family'] as SubscriptionTier[]).map((t) => (
              <label key={t} className="space-y-1 rounded-xl border border-border bg-surface-elevated/60 p-2.5">
                <span className="text-[10px] font-mono uppercase text-foreground-muted block">
                  {TIER_CATALOG[t].displayName} (₹/yr)
                </span>
                <input
                  type="number"
                  disabled={t === 'core'}
                  value={t === 'core' ? 0 : effectiveConfig.tierPrices[t]}
                  onChange={(e) =>
                    setConfigDraft({
                      ...effectiveConfig,
                      tierPrices: {
                        ...effectiveConfig.tierPrices,
                        [t]: Math.max(0, Number(e.target.value) || 0),
                      },
                    })
                  }
                  className="w-full h-8 rounded-lg border border-border bg-surface px-2 font-mono font-semibold text-foreground tabular-nums disabled:opacity-50"
                />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="w-full sm:w-auto">
              <TactileSwitch
                label="Display Prices Inclusive of GST"
                checked={effectiveConfig.pricesIncludeGst}
                onChange={(v) => setConfigDraft({ ...effectiveConfig, pricesIncludeGst: v })}
              />
            </div>

            <Button variant="primary" size="sm" onClick={() => void saveStoreSettings()}>
              <Check className="h-3.5 w-3.5" />
              <span>Publish Store &amp; Tier Config</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 2. All 42 Modules Live Pricing, BOM COGS & Stock Editor */}
      <Card noPadding className="hairline-border overflow-hidden">
        <div className="p-3.5 border-b border-border/60 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              42-Module Catalog, MRP &amp; BOM Unit Margin Editor
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px]">
              <Search className="h-3.5 w-3.5 text-foreground-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter module_code..."
                className="h-9 rounded-xl border border-border bg-surface-elevated pl-8 pr-3 text-xs text-foreground"
              />
            </div>
            <div className="w-36">
              <ThemedSelect
                ariaLabel="Filter module phase"
                value={phaseFilter}
                onChange={(v) => setPhaseFilter(v as 'ALL' | '1' | '2' | '3')}
                options={[
                  { value: 'ALL', label: `All (${modules.length})` },
                  { value: '1', label: 'Phase 1 (6)' },
                  { value: '2', label: 'Phase 2 (19)' },
                  { value: '3', label: 'Phase 3 (17)' },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto dd-scroll">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-elevated/70 font-mono text-[10px] text-foreground-muted">
                <th className="p-3">Module / Platform</th>
                <th className="p-3">Retail MRP (₹)</th>
                <th className="p-3">Install Fee (₹)</th>
                <th className="p-3">BOM COGS (₹)</th>
                <th className="p-3">Unit Margin</th>
                <th className="p-3 min-w-[155px]">Store Status</th>
                <th className="p-3 text-right">Publish</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((mod) => {
                const draft = getModuleDraft(mod);
                const margin = draft.retailInr - draft.bomInr;
                const marginPct =
                  draft.retailInr > 0 ? ((margin / draft.retailInr) * 100).toFixed(0) : '0';

                return (
                  <tr key={mod.module_code} className="border-b border-border/50 last:border-b-0">
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="accent">{mod.module_code}</Badge>
                        <span className="font-medium text-foreground">{mod.shortName}</span>
                      </div>
                      <div className="text-[10px] font-mono text-foreground-muted mt-0.5">
                        P{mod.phase} · {mod.category} · {mod.core_platform}
                      </div>
                    </td>

                    <td className="p-3">
                      <input
                        type="number"
                        aria-label={`${mod.module_code} MRP`}
                        value={draft.retailInr}
                        onChange={(e) =>
                          patchModuleDraft(mod, { retailInr: Number(e.target.value) || 0 })
                        }
                        className="w-24 h-8 rounded-lg border border-border bg-surface-elevated px-2 font-mono tabular-nums text-foreground"
                      />
                    </td>

                    <td className="p-3">
                      <input
                        type="number"
                        aria-label={`${mod.module_code} Install Fee`}
                        value={draft.installInr}
                        onChange={(e) =>
                          patchModuleDraft(mod, { installInr: Number(e.target.value) || 0 })
                        }
                        className="w-20 h-8 rounded-lg border border-border bg-surface-elevated px-2 font-mono tabular-nums text-foreground"
                      />
                    </td>

                    <td className="p-3">
                      <input
                        type="number"
                        aria-label={`${mod.module_code} BOM COGS`}
                        value={draft.bomInr}
                        onChange={(e) =>
                          patchModuleDraft(mod, { bomInr: Number(e.target.value) || 0 })
                        }
                        className="w-24 h-8 rounded-lg border border-border bg-surface-elevated px-2 font-mono tabular-nums text-foreground-secondary"
                      />
                    </td>

                    <td className="p-3 font-mono tabular-nums">
                      <div className={margin >= 0 ? 'text-success font-bold' : 'text-danger font-bold'}>
                        <IndianRupee className="h-3 w-3 inline" />
                        {margin.toLocaleString('en-IN')} ({marginPct}%)
                      </div>
                    </td>

                    <td className="p-3">
                      <ThemedSelect
                        ariaLabel={`${mod.module_code} Availability`}
                        value={draft.availability}
                        onChange={(v) =>
                          patchModuleDraft(mod, { availability: v as ModuleAvailability })
                        }
                        options={AVAILABILITY_OPTIONS}
                      />
                    </td>

                    <td className="p-3 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void saveModuleRow(mod)}
                      >
                        Save
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
