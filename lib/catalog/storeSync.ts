'use client';

/**
 * DD oodle Smart Home — Store & Catalog Real-Time Synchronization Layer
 *
 * Routed directly through the Phase 13B Unified Full-Stack Data Spine (`lib/data/unifiedStore.ts`).
 * Mutations made in `/admin` reflect live on `/shop`, `/`, `/console`, and `/installer` without page reloads.
 */

import {
  getUnifiedWorkspaceState,
  mutateUnifiedWorkspace,
  resetDemoWorkspace,
  useUnifiedCatalog,
  type CatalogModuleOverride,
  type LiveCatalogModule,
  type StoreConfigDoc,
} from '../data/unifiedStore';

export type {
  CatalogModuleOverride,
  StoreConfigDoc,
  LiveCatalogModule,
};

export function loadCatalogOverrides(): Record<string, CatalogModuleOverride> {
  return getUnifiedWorkspaceState().catalogOverrides;
}

export function loadStoreConfig(): StoreConfigDoc {
  return getUnifiedWorkspaceState().storeConfig;
}

export async function saveModuleOverride(override: CatalogModuleOverride): Promise<void> {
  mutateUnifiedWorkspace((prev) => ({
    ...prev,
    catalogOverrides: {
      ...prev.catalogOverrides,
      [override.module_code]: {
        ...override,
        updatedAtMs: Date.now(),
      },
    },
  }));
}

export async function saveStoreConfig(config: StoreConfigDoc): Promise<void> {
  mutateUnifiedWorkspace((prev) => ({
    ...prev,
    storeConfig: {
      ...config,
      updatedAtMs: Date.now(),
    },
  }));
}

export function useLiveStoreCatalog() {
  return useUnifiedCatalog();
}

export function useSyncedCatalog() {
  return useUnifiedCatalog();
}

export { useUnifiedCatalog, resetDemoWorkspace };
