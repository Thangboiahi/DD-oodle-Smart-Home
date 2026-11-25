'use client';

/**
 * DD oodle Smart Home — Live Catalog & Store Config Synchronizer
 *
 * Merges the 42-module v1.4 HARDWARE_REGISTRY baseline with live Admin edits stored
 * in Firestore (`catalog_modules/{module_code}`, `store_config/main`) and mirrored
 * into localStorage / CustomEvents so edits reflect immediately on `/` and `/shop`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { SubscriptionTier } from '@/lib/protocol/contract';
import { DFY_3D_TWIN_ADDON_INR, PLUS_TRIAL_DAYS, TIER_CATALOG } from '@/lib/entitlements/resolver';
import {
  HARDWARE_REGISTRY,
  HardwareModuleSpec,
  ModuleAvailability,
} from './hardwareRegistry';

export interface CatalogModuleOverride {
  module_code: string;
  retailInr: number;
  installInr: number;
  bomInr: number;
  availability: ModuleAvailability;
  updatedAtMs: number;
}

export interface LiveCatalogModule extends HardwareModuleSpec {
  availability: ModuleAvailability;
  marginInr: number;
  marginPct: number;
  updatedAtMs: number;
}

export interface StoreConfigDoc {
  whatsappSalesNumber: string;
  dfy3dPriceInr: number;
  plusTrialDays: number;
  gstPercent: number;
  pricesIncludeGst: boolean;
  globalDiscountPct: number;
  tierPrices: Record<SubscriptionTier, number>;
  tierMonthlyPrices: Record<SubscriptionTier, number>;
  updatedAtMs: number;
}

export const DEFAULT_STORE_CONFIG: StoreConfigDoc = {
  whatsappSalesNumber: '919862011114',
  dfy3dPriceInr: DFY_3D_TWIN_ADDON_INR,
  plusTrialDays: PLUS_TRIAL_DAYS,
  gstPercent: 18,
  pricesIncludeGst: true,
  globalDiscountPct: 0,
  tierPrices: {
    core: TIER_CATALOG.core.annualInr,
    plus: TIER_CATALOG.plus.annualInr,
    drive: TIER_CATALOG.drive.annualInr,
    shield: TIER_CATALOG.shield.annualInr,
    all_in_family: TIER_CATALOG.all_in_family.annualInr,
  },
  tierMonthlyPrices: {
    core: TIER_CATALOG.core.monthlyInr,
    plus: TIER_CATALOG.plus.monthlyInr,
    drive: TIER_CATALOG.drive.monthlyInr,
    shield: TIER_CATALOG.shield.monthlyInr,
    all_in_family: TIER_CATALOG.all_in_family.monthlyInr,
  },
  updatedAtMs: 1764000000000,
};

const CATALOG_LS_KEY = 'dd_oodle_catalog_overrides_v1';
const CONFIG_LS_KEY = 'dd_oodle_store_config_v1';
const SYNC_EVENT = 'ddoodle:catalog-sync';

function readLocalOverrides(): Record<string, CatalogModuleOverride> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CATALOG_LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, CatalogModuleOverride>;
  } catch {
    return {};
  }
}

function readLocalStoreConfig(): StoreConfigDoc {
  if (typeof window === 'undefined') return DEFAULT_STORE_CONFIG;
  try {
    const raw = window.localStorage.getItem(CONFIG_LS_KEY);
    if (!raw) return DEFAULT_STORE_CONFIG;
    const parsed = JSON.parse(raw) as Partial<StoreConfigDoc>;
    return {
      ...DEFAULT_STORE_CONFIG,
      ...parsed,
      tierPrices: {
        ...DEFAULT_STORE_CONFIG.tierPrices,
        ...(parsed.tierPrices ?? {}),
      },
      tierMonthlyPrices: {
        ...DEFAULT_STORE_CONFIG.tierMonthlyPrices,
        ...(parsed.tierMonthlyPrices ?? {}),
      },
    };
  } catch {
    return DEFAULT_STORE_CONFIG;
  }
}

export async function saveCatalogModuleOverride(
  override: CatalogModuleOverride
): Promise<{ ok: boolean; syncedCloud: boolean }> {
  const next = {
    ...readLocalOverrides(),
    [override.module_code]: { ...override, updatedAtMs: Date.now() },
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CATALOG_LS_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(SYNC_EVENT));
    } catch {
      // Ignore quota errors
    }
  }

  let syncedCloud = false;
  try {
    await setDoc(
      doc(db, 'catalog_modules', override.module_code),
      {
        module_code: override.module_code,
        retail_inr: override.retailInr,
        install_inr: override.installInr,
        bom_inr: override.bomInr,
        availability: override.availability,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    syncedCloud = true;
  } catch {
    // Expected in local demo preview without verified Firebase Admin auth token
  }

  return { ok: true, syncedCloud };
}

export async function saveStoreConfig(
  config: StoreConfigDoc
): Promise<{ ok: boolean; syncedCloud: boolean }> {
  const stamped: StoreConfigDoc = { ...config, updatedAtMs: Date.now() };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CONFIG_LS_KEY, JSON.stringify(stamped));
      window.dispatchEvent(new CustomEvent(SYNC_EVENT));
    } catch {
      // Ignore quota errors
    }
  }

  let syncedCloud = false;
  try {
    await setDoc(
      doc(db, 'store_config', 'main'),
      {
        whatsapp_sales_number: stamped.whatsappSalesNumber,
        dfy_3d_price_inr: stamped.dfy3dPriceInr,
        plus_trial_days: stamped.plusTrialDays,
        gst_percent: stamped.gstPercent,
        prices_include_gst: stamped.pricesIncludeGst,
        global_discount_pct: stamped.globalDiscountPct,
        tier_prices: stamped.tierPrices,
        tier_monthly_prices: stamped.tierMonthlyPrices,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    syncedCloud = true;
  } catch {
    // Expected when not signed in with Firebase Admin credentials
  }

  return { ok: true, syncedCloud };
}

export function resolveMergedCatalog(
  overrides: Record<string, CatalogModuleOverride>,
  config: StoreConfigDoc
): LiveCatalogModule[] {
  const discountFactor =
    config.globalDiscountPct > 0 && config.globalDiscountPct < 50
      ? 1 - config.globalDiscountPct / 100
      : 1;

  return HARDWARE_REGISTRY.map((spec) => {
    const ov = overrides[spec.module_code];
    const baseRetail = ov?.retailInr ?? spec.retailInr;
    const retailInr = Math.round(baseRetail * discountFactor);
    const installInr = ov?.installInr ?? spec.installInr;
    const bomInr = ov?.bomInr ?? spec.bomInr;
    const availability = ov?.availability ?? spec.defaultAvailability;
    const marginInr = retailInr - bomInr;
    const marginPct = retailInr > 0 ? Number(((marginInr / retailInr) * 100).toFixed(1)) : 0;

    return {
      ...spec,
      retailInr,
      installInr,
      bomInr,
      availability,
      marginInr,
      marginPct,
      updatedAtMs: ov?.updatedAtMs ?? 1764000000000,
    };
  });
}

export function useLiveStoreCatalog() {
  const [overrides, setOverrides] = useState<Record<string, CatalogModuleOverride>>({});
  const [storeConfig, setStoreConfig] = useState<StoreConfigDoc>(DEFAULT_STORE_CONFIG);
  const [hydrated, setHydrated] = useState(false);

  const syncFromLocal = useCallback(() => {
    setOverrides(readLocalOverrides());
    setStoreConfig(readLocalStoreConfig());
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      syncFromLocal();
      setHydrated(true);
    }, 0);

    const onSync = () => syncFromLocal();
    const onStorage = (e: StorageEvent) => {
      if (e.key === CATALOG_LS_KEY || e.key === CONFIG_LS_KEY) syncFromLocal();
    };
    window.addEventListener(SYNC_EVENT, onSync);
    window.addEventListener('storage', onStorage);

    // Best-effort read from public Firestore catalog_modules & store_config/main
    let cancelled = false;
    (async () => {
      try {
        const [modsSnap, cfgSnap] = await Promise.all([
          getDocs(collection(db, 'catalog_modules')),
          getDoc(doc(db, 'store_config', 'main')),
        ]);
        if (cancelled) return;

        if (!modsSnap.empty) {
          const fsMap: Record<string, CatalogModuleOverride> = {};
          modsSnap.forEach((d) => {
            const raw = d.data() as {
              module_code?: string;
              retail_inr?: number;
              install_inr?: number;
              bom_inr?: number;
              availability?: ModuleAvailability;
            };
            const code = raw.module_code || d.id;
            if (typeof raw.retail_inr === 'number') {
              fsMap[code] = {
                module_code: code,
                retailInr: raw.retail_inr,
                installInr: typeof raw.install_inr === 'number' ? raw.install_inr : 0,
                bomInr: typeof raw.bom_inr === 'number' ? raw.bom_inr : 0,
                availability: raw.availability ?? 'IN_STOCK',
                updatedAtMs: Date.now(),
              };
            }
          });
          if (Object.keys(fsMap).length > 0) {
            setOverrides((prev) => ({ ...fsMap, ...prev }));
          }
        }

        if (cfgSnap.exists()) {
          const d = cfgSnap.data() as {
            whatsapp_sales_number?: string;
            dfy_3d_price_inr?: number;
            plus_trial_days?: number;
            gst_percent?: number;
            prices_include_gst?: boolean;
            global_discount_pct?: number;
            tier_prices?: Partial<Record<SubscriptionTier, number>>;
            tier_monthly_prices?: Partial<Record<SubscriptionTier, number>>;
          };
          setStoreConfig((prev) => ({
            ...prev,
            whatsappSalesNumber: d.whatsapp_sales_number || prev.whatsappSalesNumber,
            dfy3dPriceInr: d.dfy_3d_price_inr ?? prev.dfy3dPriceInr,
            plusTrialDays: d.plus_trial_days ?? prev.plusTrialDays,
            gstPercent: d.gst_percent ?? prev.gstPercent,
            pricesIncludeGst: d.prices_include_gst ?? prev.pricesIncludeGst,
            globalDiscountPct: d.global_discount_pct ?? prev.globalDiscountPct,
            tierPrices: { ...prev.tierPrices, ...(d.tier_prices ?? {}) },
            tierMonthlyPrices: { ...prev.tierMonthlyPrices, ...(d.tier_monthly_prices ?? {}) },
          }));
        }
      } catch {
        // Offline or unprovisioned Firestore collections safely fall back to registry + localStorage
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener(SYNC_EVENT, onSync);
      window.removeEventListener('storage', onStorage);
    };
  }, [syncFromLocal]);

  const modules = useMemo(
    () => resolveMergedCatalog(overrides, storeConfig),
    [overrides, storeConfig]
  );

  return {
    modules,
    visibleModules: modules.filter((m) => m.availability !== 'HIDDEN'),
    overrides,
    storeConfig,
    hydrated,
    saveModuleOverride: saveCatalogModuleOverride,
    saveStoreConfig,
  };
}
