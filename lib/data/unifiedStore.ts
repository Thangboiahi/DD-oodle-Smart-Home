'use client';

/**
 * DD oodle Smart Home — Phase 13B Unified Full-Stack Data Spine
 *
 * Centralizes all reads and mutations across:
 *   - Public Landing (`/`) & Storefront (`/shop`)
 *   - Customer Console (`/console`)
 *   - Field Installer Portal (`/installer`)
 *   - Master Admin Command Center (`/admin`)
 *
 * Sync Layers:
 *   1. In-memory reactive store initialized from `createCanonicalWorkspaceSeed()`
 *   2. Instant client persistence via `localStorage` (`dd_oodle_unified_workspace_v13b`)
 *   3. Instant cross-tab & multi-portal synchronization via `BroadcastChannel("ddoodle-sync")`
 *   4. Server-side singleton synchronization via `/api/workspace`
 *   5. Optional live Firebase Firestore synchronization when Firebase config is active
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import {
  HARDWARE_REGISTRY,
  type HardwareModuleSpec,
  type ModuleAvailability,
} from '@/lib/catalog/hardwareRegistry';
import {
  createCanonicalWorkspaceSeed,
  createDynamicVirtualDeviceInstance,
  type AmcTicketRecord,
  type AuditActionCategory,
  type AuditLogEntry,
  type CanonicalLockAccessLog,
  type CanonicalVehicleTrip,
  type CatalogModuleOverride,
  type ErpSnapshot,
  type ExpenseCategory,
  type ExpenseRecord,
  type IncidentRecord,
  type InstallerJobRecord,
  type InstallerJobStatus,
  type InstallerJobType,
  type ManagedDeviceActivation,
  type ManagedSubscriptionRecord,
  type PaymentMode,
  type QuoteRecord,
  type QuoteStatus,
  type StoreConfigDoc,
  type TransactionCategory,
  type TransactionModuleBreakdownItem,
  type TransactionRecord,
  type UnifiedWorkspaceState,
  type UserAccountRecord,
} from '@/lib/data/canonicalSeed';
import { resolveEntitlements } from '@/lib/entitlements/resolver';
import type { ModuleCode, SubscriptionTier, VehicleGeofence } from '@/lib/protocol/contract';
import type { SessionPayload, SessionRole } from '@/lib/auth/session';
import { simulatorEngine } from '@/lib/simulator/engine';
import type { SimulatorSnapshot, VirtualDeviceInstance } from '@/lib/simulator/types';

export const UNIFIED_STORAGE_KEY = 'dd_oodle_unified_workspace_v13b';
export const UNIFIED_SYNC_EVENT = 'ddoodle:unified-sync';
export const BROADCAST_CHANNEL_NAME = 'ddoodle-sync';

export interface LiveCatalogModule extends HardwareModuleSpec {
  availability: ModuleAvailability;
  grossMarginPct: number;
}

type UnifiedListener = (state: UnifiedWorkspaceState) => void;

let memoryWorkspace: UnifiedWorkspaceState = createCanonicalWorkspaceSeed();
let hydratedFromStorage = false;
let initialServerSyncTriggered = false;
let simIncidentListenerAttached = false;
const listeners = new Set<UnifiedListener>();
let broadcastChannel: BroadcastChannel | null = null;

function attachSimIncidentListener(): void {
  if (typeof window === 'undefined' || simIncidentListenerAttached) return;
  simIncidentListenerAttached = true;
  window.addEventListener('ddoodle:sim-incident-event', ((event: CustomEvent<{
    homeId: string;
    deviceId: string;
    moduleCode: string;
    alertType: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    status: 'OPEN' | 'RESOLVED';
    summary: string;
  }>) => {
    const detail = event.detail;
    if (!detail) return;
    mutateUnifiedWorkspace((prev) => {
      if (detail.status === 'RESOLVED') {
        return {
          ...prev,
          erp: {
            ...prev.erp,
            incidents: prev.erp.incidents.map((inc) =>
              inc.deviceId === detail.deviceId && inc.alertType === detail.alertType
                ? { ...inc, status: 'RESOLVED' }
                : inc
            ),
          },
        };
      }
      const existingOpen = prev.erp.incidents.find(
        (inc) =>
          inc.deviceId === detail.deviceId &&
          inc.alertType === detail.alertType &&
          inc.status === 'OPEN'
      );
      if (existingOpen) return prev;
      const created: IncidentRecord = {
        id: `INC-2026-${Math.floor(100 + Math.random() * 899)}`,
        createdAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        homeId: detail.homeId || 'home_imphal_001',
        deviceId: detail.deviceId,
        moduleCode: detail.moduleCode,
        alertType: detail.alertType,
        severity: detail.severity,
        status: 'OPEN',
        summary: detail.summary,
        assignedTo: 'Master Admin NOC',
      };
      return {
        ...prev,
        erp: {
          ...prev.erp,
          incidents: [created, ...prev.erp.incidents],
        },
      };
    });
  }) as EventListener);
}

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannel.onmessage = (event) => {
        const data = event.data as {
          type?: 'WORKSPACE_PATCH' | 'WORKSPACE_RESET';
          workspace?: UnifiedWorkspaceState;
        };
        if (!data) return;
        if (data.type === 'WORKSPACE_RESET' && data.workspace) {
          memoryWorkspace = data.workspace;
          saveWorkspaceToLocalStorage(memoryWorkspace);
          simulatorEngine.reset();
          notifyListeners();
          window.dispatchEvent(new CustomEvent(UNIFIED_SYNC_EVENT, { detail: memoryWorkspace }));
        } else if (data.type === 'WORKSPACE_PATCH' && data.workspace) {
          memoryWorkspace = data.workspace;
          saveWorkspaceToLocalStorage(memoryWorkspace);
          notifyListeners();
          window.dispatchEvent(new CustomEvent(UNIFIED_SYNC_EVENT, { detail: memoryWorkspace }));
        }
      };
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

function saveWorkspaceToLocalStorage(state: UnifiedWorkspaceState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UNIFIED_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
}

function loadWorkspaceFromLocalStorage(): UnifiedWorkspaceState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(UNIFIED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UnifiedWorkspaceState>;
    if (!parsed || parsed.version !== '13B.1.4') return null;
    const base = createCanonicalWorkspaceSeed();
    return {
      ...base,
      ...parsed,
      devices: { ...base.devices, ...(parsed.devices ?? {}) },
      catalogOverrides: { ...base.catalogOverrides, ...(parsed.catalogOverrides ?? {}) },
      storeConfig: { ...base.storeConfig, ...(parsed.storeConfig ?? {}) },
      erp: {
        ...base.erp,
        ...(parsed.erp ?? {}),
        deviceStates: {
          ...base.erp.deviceStates,
          ...(parsed.erp?.deviceStates ?? {}),
        },
      },
    };
  } catch {
    return null;
  }
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(memoryWorkspace);
  }
}

async function pushPatchToBackend(
  patch: Partial<UnifiedWorkspaceState>,
  action: 'patch' | 'reset' = 'patch'
): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await fetch('/api/workspace', {
      method: action === 'reset' ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: action === 'reset' ? undefined : JSON.stringify({ action: 'patch', patch }),
    });
  } catch {
    // Offline or preview fallback — localStorage + BroadcastChannel already updated
  }

  // Non-blocking best-effort Firestore sync
  try {
    if (db && patch.storeConfig) {
      await setDoc(doc(db, 'store_config', 'main'), patch.storeConfig, { merge: true });
    }
  } catch {
    // Ignore when demo user is unauthenticated in Firebase Auth
  }
}

export function getUnifiedWorkspaceState(): UnifiedWorkspaceState {
  if (typeof window !== 'undefined' && !hydratedFromStorage) {
    hydratedFromStorage = true;
    const stored = loadWorkspaceFromLocalStorage();
    if (stored) {
      memoryWorkspace = stored;
    } else {
      saveWorkspaceToLocalStorage(memoryWorkspace);
    }
    getBroadcastChannel();
    attachSimIncidentListener();

    if (!initialServerSyncTriggered) {
      initialServerSyncTriggered = true;
      void fetch('/api/workspace', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((payload: { ok?: boolean; workspace?: UnifiedWorkspaceState } | null) => {
          if (payload?.ok && payload.workspace && !stored) {
            memoryWorkspace = payload.workspace;
            saveWorkspaceToLocalStorage(memoryWorkspace);
            notifyListeners();
          }
        })
        .catch(() => {
          // ignore network errors in offline mode
        });
    }
  }
  return memoryWorkspace;
}

export function mutateUnifiedWorkspace(
  updater: (prev: UnifiedWorkspaceState) => UnifiedWorkspaceState,
  patchForServer?: Partial<UnifiedWorkspaceState>
): UnifiedWorkspaceState {
  const current = getUnifiedWorkspaceState();
  const next = updater(current);
  memoryWorkspace = next;

  if (typeof window !== 'undefined') {
    saveWorkspaceToLocalStorage(next);
    notifyListeners();
    window.dispatchEvent(new CustomEvent(UNIFIED_SYNC_EVENT, { detail: next }));

    const bc = getBroadcastChannel();
    bc?.postMessage({
      type: 'WORKSPACE_PATCH',
      workspace: next,
    });

    void pushPatchToBackend(patchForServer ?? next, 'patch');
  }

  return next;
}

export function subscribeUnifiedWorkspace(listener: UnifiedListener): () => void {
  getUnifiedWorkspaceState();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 1-Tap Reset Demo Workspace utility for `/admin` & `/console/settings`.
 * Resets canonical seed across memory, localStorage, simulatorEngine, BroadcastChannel, and `/api/workspace`.
 */
export async function resetDemoWorkspace(): Promise<UnifiedWorkspaceState> {
  const fresh = createCanonicalWorkspaceSeed();
  memoryWorkspace = fresh;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(UNIFIED_STORAGE_KEY, JSON.stringify(fresh));
      window.localStorage.removeItem('dd_oodle_catalog_overrides_v1');
      window.localStorage.removeItem('dd_oodle_store_config_v1');
      window.localStorage.removeItem('dd_oodle_installer_jobs_v1');
      window.localStorage.removeItem('dd_oodle_erp_store_v1');
      window.localStorage.removeItem('dd_oodle_quotes_v1');
      window.localStorage.removeItem('dd_oodle_layout3d_v1');
    } catch {
      // ignore storage errors
    }

    simulatorEngine.reset();
    notifyListeners();
    window.dispatchEvent(new CustomEvent(UNIFIED_SYNC_EVENT, { detail: fresh }));

    const bc = getBroadcastChannel();
    bc?.postMessage({
      type: 'WORKSPACE_RESET',
      workspace: fresh,
    });

    await pushPatchToBackend({}, 'reset');
  }

  return fresh;
}

export async function appendUnifiedAuditLog(
  input: Omit<AuditLogEntry, 'log_id' | 'createdAtMs'>
): Promise<AuditLogEntry> {
  const entry: AuditLogEntry = {
    ...input,
    log_id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAtMs: Date.now(),
  };

  mutateUnifiedWorkspace((prev) => ({
    ...prev,
    erp: {
      ...prev.erp,
      auditLogs: [entry, ...prev.erp.auditLogs.slice(0, 199)],
    },
  }));

  try {
    if (db) {
      await setDoc(doc(db, 'admin_audit_logs', entry.log_id), entry, { merge: true });
    }
  } catch {
    // Non-blocking in demo mode
  }

  return entry;
}

// ============================================================================
// Typed Selector & Mutation Hooks for All 5 Surfaces
// ============================================================================

export function useUnifiedWorkspace(): UnifiedWorkspaceState {
  const [state, setState] = useState<UnifiedWorkspaceState>(() => getUnifiedWorkspaceState());

  useEffect(() => {
    const unsub = subscribeUnifiedWorkspace((next) => {
      setState(next);
    });
    const onCustomSync = () => {
      setState(getUnifiedWorkspaceState());
    };
    window.addEventListener(UNIFIED_SYNC_EVENT, onCustomSync);
    return () => {
      unsub();
      window.removeEventListener(UNIFIED_SYNC_EVENT, onCustomSync);
    };
  }, []);

  return state;
}

/**
 * 1. `useUnifiedCatalog`: Synchronized 42-module hardware catalog, BOM/MRP overrides, and Storefront WhatsApp config
 */
export function useUnifiedCatalog() {
  const workspace = useUnifiedWorkspace();

  const modules = useMemo<LiveCatalogModule[]>(() => {
    const discountMultiplier =
      workspace.storeConfig.globalDiscountPct > 0
        ? Math.max(0.55, 1 - workspace.storeConfig.globalDiscountPct / 100)
        : 1;

    return HARDWARE_REGISTRY.map((spec: HardwareModuleSpec) => {
      const ov = workspace.catalogOverrides[spec.module_code];
      const baseRetail = ov?.retailInr ?? spec.retailInr;
      const retailInr = Math.round(baseRetail * discountMultiplier);
      const installInr = ov?.installInr ?? spec.installInr;
      const bomInr = ov?.bomInr ?? spec.bomInr;
      const availability = ov?.availability ?? spec.defaultAvailability;
      const grossMarginPct =
        retailInr > 0 ? Math.round(((retailInr - bomInr) / retailInr) * 100) : 0;

      return {
        ...spec,
        retailInr,
        installInr,
        bomInr,
        availability,
        grossMarginPct,
      };
    });
  }, [workspace.catalogOverrides, workspace.storeConfig.globalDiscountPct]);

  const visibleModules = useMemo(
    () => modules.filter((m) => m.availability !== 'HIDDEN'),
    [modules]
  );

  const saveModuleOverride = useCallback(async (override: CatalogModuleOverride) => {
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
  }, []);

  const saveStoreConfig = useCallback(async (nextConfig: StoreConfigDoc) => {
    mutateUnifiedWorkspace((prev) => ({
      ...prev,
      storeConfig: {
        ...nextConfig,
        updatedAtMs: Date.now(),
      },
    }));
  }, []);

  return {
    modules,
    visibleModules,
    overrides: workspace.catalogOverrides,
    storeConfig: workspace.storeConfig,
    config: workspace.storeConfig,
    saveModuleOverride,
    saveStoreConfig,
  };
}

/**
 * Resolve live Home Entitlements from ManagedSubscriptionRecord
 */
export function resolveHomeEntitlementsFromSubscription(sub?: ManagedSubscriptionRecord) {
  const tier: SubscriptionTier = sub?.tier ?? 'core';
  const status = sub?.status ?? 'active';
  const dfy3dPurchased = Boolean(sub?.dfy3dPurchased);
  const nowMs = Date.now();
  return resolveEntitlements(
    {
      tier,
      status: status === 'cancelled' ? 'expired' : status,
      trial_ends_at: status === 'trial' ? nowMs + 76 * 86400 * 1000 : null,
      expires_at: status === 'active' && tier !== 'core' ? nowMs + 180 * 86400 * 1000 : null,
      dfy_3d_purchased: dfy3dPurchased,
    },
    nowMs
  );
}

/**
 * 2. `useUnifiedHome`: Synchronized Homes ("Lamka Smart Residence" & "Imphal Duplex"), subscriptions, live entitlements, and lock logs
 */
export function useUnifiedHome(activeHomeId?: string) {
  const workspace = useUnifiedWorkspace();
  const resolvedHomeId = activeHomeId || workspace.homes[0]?.id || 'home_imphal_001';
  const activeHome =
    workspace.homes.find((h) => h.id === resolvedHomeId) ?? workspace.homes[0];
  const subscription =
    workspace.erp.subscriptions.find((s) => s.homeId === resolvedHomeId) ??
    workspace.erp.subscriptions[0];
  const entitlements = useMemo(
    () => resolveHomeEntitlementsFromSubscription(subscription),
    [subscription]
  );

  return {
    homes: workspace.homes,
    activeHome,
    subscription,
    entitlements,
    users: workspace.users,
    lockAccessLogs: workspace.lockAccessLogs,
  };
}

/**
 * Commission or claim any of the 42 v1.4 hardware modules across `/installer`, `/console/setup`, or `/admin`
 */
export async function commissionHardwareDevice(params: {
  homeId: string;
  deviceId: string;
  moduleCode: ModuleCode;
  roomId: string;
  localPin: string;
  deviceName?: string;
  jobId?: string;
  reason?: string;
  actor?: { uid: string; email: string };
}): Promise<VirtualDeviceInstance> {
  const instance = createDynamicVirtualDeviceInstance({
    homeId: params.homeId,
    deviceId: params.deviceId,
    moduleCode: params.moduleCode,
    roomId: params.roomId,
    name: params.deviceName,
    localPin: params.localPin,
  });

  simulatorEngine.registerOrUpdateDevice(instance);

  mutateUnifiedWorkspace((prev) => {
    const nextJobs = params.jobId
      ? prev.installerJobs.map((j) => {
          if (j.job_id !== params.jobId) return j;
          const nextLinked = j.linked_device_ids.includes(params.deviceId)
            ? j.linked_device_ids
            : [...j.linked_device_ids, params.deviceId];
          return { ...j, linked_device_ids: nextLinked };
        })
      : prev.installerJobs;

    const nextHomes = prev.homes.map((h) =>
      h.id === params.homeId
        ? { ...h, deviceCount: Object.keys({ ...prev.devices, [params.deviceId]: instance }).length }
        : h
    );

    return {
      ...prev,
      homes: nextHomes,
      devices: {
        ...prev.devices,
        [params.deviceId]: instance,
      },
      installerJobs: nextJobs,
      erp: {
        ...prev.erp,
        deviceStates: {
          ...prev.erp.deviceStates,
          [params.deviceId]: {
            device_id: params.deviceId,
            home_id: params.homeId,
            module_code: params.moduleCode,
            name: instance.name,
            activation: 'ACTIVE',
            reason:
              params.reason ||
              (params.jobId
                ? `Commissioned via /installer (${params.jobId}) in ${params.roomId}`
                : `Commissioned in ${params.roomId}`),
            updatedAtMs: Date.now(),
          },
        },
      },
    };
  });

  if (params.actor) {
    await appendUnifiedAuditLog({
      actor_uid: params.actor.uid,
      actor_email: params.actor.email,
      action_category: 'DEVICE_STATE',
      action: 'COMMISSION_HARDWARE_DEVICE',
      target_collection: 'devices',
      target_id: params.deviceId,
      summary: `Commissioned ${params.deviceId} (${params.moduleCode}) into ${params.homeId}/${params.roomId}`,
    });
  }

  return instance;
}

/**
 * 3. `useUnifiedFleet`: Synchronized live simulator devices (all 12 Phase 1/2/3 nodes + dynamic commissioned nodes), vehicle trips, and geofences
 */
export function useUnifiedFleet() {
  const workspace = useUnifiedWorkspace();
  const [simSnap, setSimSnap] = useState<SimulatorSnapshot>(() =>
    simulatorEngine.getSnapshot()
  );

  useEffect(() => {
    simulatorEngine.start(1000);
    simulatorEngine.syncExternalDevices(workspace.devices);
    return simulatorEngine.subscribe((next) => {
      setSimSnap(next);
    });
  }, [workspace.devices]);

  const setVehicleGeofences = useCallback(
    (
      nextOrUpdater:
        | VehicleGeofence[]
        | ((prev: VehicleGeofence[]) => VehicleGeofence[])
    ) => {
      mutateUnifiedWorkspace((prev) => ({
        ...prev,
        vehicleGeofences:
          typeof nextOrUpdater === 'function'
            ? nextOrUpdater(prev.vehicleGeofences)
            : nextOrUpdater,
      }));
    },
    []
  );

  const appendLockAccessLog = useCallback((entry: Omit<CanonicalLockAccessLog, 'id'>) => {
    mutateUnifiedWorkspace((prev) => ({
      ...prev,
      lockAccessLogs: [
        {
          ...entry,
          id: `LOCK-LOG-${Date.now().toString().slice(-4)}`,
        },
        ...prev.lockAccessLogs,
      ],
    }));
  }, []);

  return {
    snapshot: simSnap,
    devices: simSnap.devices,
    deviceList: Object.values(simSnap.devices),
    vehicleTrips: workspace.vehicleTrips,
    vehicleGeofences: workspace.vehicleGeofences,
    lockAccessLogs: workspace.lockAccessLogs,
    setVehicleGeofences,
    appendLockAccessLog,
  };
}

/**
 * 4. `useUnifiedJobs`: Synchronized Field Installer jobs (`INITIAL_SETUP_LINKING`, `FOLLOWUP_3D_SERVICE`, `AMC_SWAP`)
 */
export function useUnifiedJobs(session?: SessionPayload) {
  const workspace = useUnifiedWorkspace();

  const scopedJobs = useMemo(() => {
    if (!session || session.role === 'admin') {
      return workspace.installerJobs;
    }
    return workspace.installerJobs.filter(
      (j) =>
        j.installer_uid === session.uid ||
        session.uid === 'demo_installer_01' ||
        j.installer_uid === 'uid_installer_manipur_01'
    );
  }, [workspace.installerJobs, session]);

  const activeJobs = useMemo(
    () => scopedJobs.filter((j) => j.status === 'ACTIVE'),
    [scopedJobs]
  );

  const inactiveJobs = useMemo(
    () => scopedJobs.filter((j) => j.status !== 'ACTIVE'),
    [scopedJobs]
  );

  const linkDevice = useCallback(
    async (params: {
      job: InstallerJobRecord;
      deviceId: string;
      moduleCode: ModuleCode;
      roomId: string;
      localPin: string;
      deviceName: string;
    }): Promise<{ ok: boolean }> => {
      await commissionHardwareDevice({
        homeId: params.job.home_id,
        deviceId: params.deviceId,
        moduleCode: params.moduleCode,
        roomId: params.roomId,
        localPin: params.localPin,
        deviceName: params.deviceName,
        jobId: params.job.job_id,
      });
      return { ok: true };
    },
    []
  );

  const completeJob = useCallback(async (jobId: string) => {
    mutateUnifiedWorkspace((prev) => ({
      ...prev,
      installerJobs: prev.installerJobs.map((j) =>
        j.job_id === jobId
          ? { ...j, status: 'COMPLETED', completedAtMs: Date.now() }
          : j
      ),
    }));
  }, []);

  return {
    jobs: workspace.installerJobs,
    activeJobs,
    inactiveJobs,
    linkDevice,
    completeJob,
  };
}

/**
 * 5. `useUnifiedFinance`: Synchronized Master Admin ERP, revenue ledger, BOM expenses, AMC tickets, incidents, and audit log
 */
export function useUnifiedFinance() {
  const workspace = useUnifiedWorkspace();

  const recordTx = useCallback(
    async (
      input: Omit<TransactionRecord, 'tx_id' | 'createdAtMs'>,
      actor: { uid: string; email: string }
    ) => {
      const created: TransactionRecord = {
        ...input,
        tx_id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAtMs: Date.now(),
      };
      mutateUnifiedWorkspace((prev) => ({
        ...prev,
        erp: {
          ...prev.erp,
          transactions: [created, ...prev.erp.transactions],
        },
      }));
      await appendUnifiedAuditLog({
        actor_uid: actor.uid,
        actor_email: actor.email,
        action_category: 'FINANCE',
        action: 'RECORD_TRANSACTION',
        target_collection: 'transactions',
        target_id: created.tx_id,
        summary: `${created.category}: ₹${created.amount_inr.toLocaleString('en-IN')} (${created.payment_mode}) from ${created.customer_name}`,
      });
      return created;
    },
    []
  );

  const recordExp = useCallback(
    async (
      input: Omit<ExpenseRecord, 'exp_id' | 'createdAtMs'>,
      actor: { uid: string; email: string }
    ) => {
      const created: ExpenseRecord = {
        ...input,
        exp_id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAtMs: Date.now(),
      };
      mutateUnifiedWorkspace((prev) => ({
        ...prev,
        erp: {
          ...prev.erp,
          expenses: [created, ...prev.erp.expenses],
        },
      }));
      await appendUnifiedAuditLog({
        actor_uid: actor.uid,
        actor_email: actor.email,
        action_category: 'FINANCE',
        action: 'RECORD_EXPENSE',
        target_collection: 'expenses',
        target_id: created.exp_id,
        summary: `${created.category}: ₹${created.amount_inr.toLocaleString('en-IN')} (${created.payment_mode}) to ${created.vendor}`,
      });
      return created;
    },
    []
  );

  const updateSubscriptionPlan = useCallback(
    async (
      homeId: string,
      patch: {
        tier: SubscriptionTier;
        status: ManagedSubscriptionRecord['status'];
        trialStatus: string;
        paymentMode: PaymentMode;
        upiStatus: ManagedSubscriptionRecord['upiStatus'];
        logRenewalInr?: number;
      },
      actor: { uid: string; email: string }
    ) => {
      let customerName = homeId;
      mutateUnifiedWorkspace((prev) => {
        const nextSubs = prev.erp.subscriptions.map((sub) => {
          if (sub.homeId !== homeId) return sub;
          customerName = sub.customer;
          return {
            ...sub,
            tier: patch.tier,
            status: patch.status,
            trialStatus: patch.trialStatus,
            paymentMode: patch.paymentMode,
            upiStatus: patch.upiStatus,
          };
        });

        const nextHomes = prev.homes.map((h) =>
          h.id === homeId ? { ...h, tier: patch.tier } : h
        );

        const nextTxs = [...prev.erp.transactions];
        if (patch.logRenewalInr && patch.logRenewalInr > 0) {
          const todayIso = new Date().toISOString().slice(0, 10);
          nextTxs.unshift({
            tx_id: `tx_sub_${Date.now()}`,
            tx_ref: `SUB-${todayIso.replace(/-/g, '').slice(2)}-${Date.now().toString().slice(-3)}`,
            category: 'SUBSCRIPTION_RENEWAL',
            amount_inr: patch.logRenewalInr,
            payment_mode: patch.paymentMode,
            customer_name: customerName,
            home_id: homeId,
            notes: `Subscription plan updated to ${patch.tier.toUpperCase()}`,
            dateIso: todayIso,
            createdAtMs: Date.now(),
          });
        }

        return {
          ...prev,
          homes: nextHomes,
          erp: {
            ...prev.erp,
            subscriptions: nextSubs,
            transactions: nextTxs,
          },
        };
      });

      await appendUnifiedAuditLog({
        actor_uid: actor.uid,
        actor_email: actor.email,
        action_category: 'SUBSCRIPTION',
        action: patch.tier === 'core' ? 'DOWNGRADE_TO_CORE_FLOOR' : 'ACTIVATE_SUBSCRIPTION_TIER',
        target_collection: 'homes',
        target_id: `${homeId}/subscription`,
        summary: `${customerName} -> ${patch.tier.toUpperCase()} (${patch.trialStatus})`,
      });
    },
    []
  );

  const setHomeDfy3dPurchased = useCallback(
    async (
      homeId: string,
      purchased: boolean,
      actor: { uid: string; email: string },
      options?: { logFeeInr?: number; paymentMode?: PaymentMode }
    ) => {
      let customerName = homeId;
      const now = Date.now();
      const todayIso = new Date().toISOString().slice(0, 10);

      mutateUnifiedWorkspace((prev) => {
        const nextSubs = prev.erp.subscriptions.map((sub) => {
          if (sub.homeId !== homeId) return sub;
          customerName = sub.customer;
          return {
            ...sub,
            dfy3dPurchased: purchased,
          };
        });

        const nextTxs = [...prev.erp.transactions];
        if (purchased && options?.logFeeInr && options.logFeeInr > 0) {
          nextTxs.unshift({
            tx_id: `tx_dfy_${now}`,
            tx_ref: `DFY-${todayIso.replace(/-/g, '').slice(2)}-${now.toString().slice(-3)}`,
            category: 'DFY_3D_TWIN',
            amount_inr: options.logFeeInr,
            payment_mode: options.paymentMode ?? 'UPI',
            customer_name: customerName,
            home_id: homeId,
            notes: `₹${options.logFeeInr} One-Time DFY 3D Home Twin Activated`,
            dateIso: todayIso,
            createdAtMs: now,
          });
        }

        return {
          ...prev,
          erp: {
            ...prev.erp,
            subscriptions: nextSubs,
            transactions: nextTxs,
          },
        };
      });

      await appendUnifiedAuditLog({
        actor_uid: actor.uid,
        actor_email: actor.email,
        action_category: 'SUBSCRIPTION',
        action: purchased ? 'ACTIVATE_DFY_3D_TWIN' : 'REVOKE_DFY_3D_TWIN',
        target_collection: 'homes',
        target_id: `${homeId}/subscription`,
        summary: `${customerName} (${homeId}) DFY 3D Twin -> ${purchased ? 'ENABLED' : 'DISABLED'}`,
      });
    },
    []
  );

  const resolveAmcTicket = useCallback(
    async (ticketId: string, actor: { uid: string; email: string }) => {
      mutateUnifiedWorkspace((prev) => ({
        ...prev,
        erp: {
          ...prev.erp,
          amcTickets: prev.erp.amcTickets.map((t) =>
            t.ticket_id === ticketId ? { ...t, status: 'RESOLVED' } : t
          ),
        },
      }));

      await appendUnifiedAuditLog({
        actor_uid: actor.uid,
        actor_email: actor.email,
        action_category: 'DEVICE_STATE',
        action: 'RESOLVE_AMC_TICKET',
        target_collection: 'amc_tickets',
        target_id: ticketId,
        summary: `Resolved AMC swap ticket ${ticketId}`,
      });
    },
    []
  );

  const setDeviceActivationState = useCallback(
    async (
      input: Omit<ManagedDeviceActivation, 'updatedAtMs'>,
      actor: { uid: string; email: string }
    ) => {
      const record: ManagedDeviceActivation = {
        ...input,
        updatedAtMs: Date.now(),
      };
      mutateUnifiedWorkspace((prev) => ({
        ...prev,
        erp: {
          ...prev.erp,
          deviceStates: {
            ...prev.erp.deviceStates,
            [input.device_id]: record,
          },
        },
      }));

      await appendUnifiedAuditLog({
        actor_uid: actor.uid,
        actor_email: actor.email,
        action_category: 'DEVICE_STATE',
        action: `SET_DEVICE_${input.activation}`,
        target_collection: 'devices',
        target_id: input.device_id,
        summary: `${input.device_id} (${input.module_code}) -> ${input.activation} · Reason: ${input.reason}`,
      });
    },
    []
  );

  const setUserAccountRoleOrStatus = useCallback(
    async (
      uid: string,
      patch: Partial<Pick<UserAccountRecord, 'role' | 'status'>>,
      actor: { uid: string; email: string }
    ) => {
      mutateUnifiedWorkspace((prev) => {
        const nextAccounts = prev.erp.accounts.map((acc) =>
          acc.uid === uid ? { ...acc, ...patch } : acc
        );
        return {
          ...prev,
          users: nextAccounts,
          erp: {
            ...prev.erp,
            accounts: nextAccounts,
          },
        };
      });

      await appendUnifiedAuditLog({
        actor_uid: actor.uid,
        actor_email: actor.email,
        action_category: 'ACCOUNT',
        action: 'UPDATE_USER_ROLE_OR_STATUS',
        target_collection: 'users',
        target_id: uid,
        summary: `Updated account ${uid}: ${JSON.stringify(patch)}`,
      });
    },
    []
  );

  const dispatchInstallerJob = useCallback(
    async (
      params: {
        home_id: string;
        home_name: string;
        customer_name: string;
        customer_phone: string;
        address: string;
        installer_uid: string;
        installer_name: string;
        type: InstallerJobType;
        allow_3d_setup: boolean;
        expiryHours: number;
        notes: string;
      },
      actor: { uid: string; email: string }
    ) => {
      const now = Date.now();
      const job: InstallerJobRecord = {
        job_id: `JOB-2026-${Math.floor(100 + Math.random() * 899)}`,
        home_id: params.home_id,
        home_name: params.home_name,
        customer_name: params.customer_name,
        customer_phone: params.customer_phone,
        address: params.address,
        installer_uid: params.installer_uid,
        installer_name: params.installer_name,
        type: params.type,
        allow_3d_setup: params.allow_3d_setup,
        status: 'ACTIVE',
        notes: params.notes,
        linked_device_ids: [],
        createdAtMs: now,
        expiresAtMs: now + params.expiryHours * 3600 * 1000,
      };

      mutateUnifiedWorkspace((prev) => ({
        ...prev,
        installerJobs: [job, ...prev.installerJobs],
      }));

      await appendUnifiedAuditLog({
        actor_uid: actor.uid,
        actor_email: actor.email,
        action_category: 'INSTALLER_AUTH',
        action: 'DISPATCH_INSTALLER_JOB',
        target_collection: 'installer_jobs',
        target_id: job.job_id,
        summary: `Dispatched ${job.type} to ${job.installer_name} for ${job.home_name} (3D=${job.allow_3d_setup})`,
      });

      return job;
    },
    []
  );

  const revokeInstallerJob = useCallback(
    async (jobId: string, actor: { uid: string; email: string }) => {
      mutateUnifiedWorkspace((prev) => ({
        ...prev,
        installerJobs: prev.installerJobs.map((j) =>
          j.job_id === jobId ? { ...j, status: 'REVOKED' } : j
        ),
      }));

      await appendUnifiedAuditLog({
        actor_uid: actor.uid,
        actor_email: actor.email,
        action_category: 'INSTALLER_AUTH',
        action: 'REVOKE_INSTALLER_JOB',
        target_collection: 'installer_jobs',
        target_id: jobId,
        summary: `Revoked installer authority on job ${jobId}`,
      });
    },
    []
  );

  const setQuoteStatus = useCallback(
    async (
      quoteId: string,
      status: QuoteStatus,
      actor: { uid: string; email: string }
    ) => {
      mutateUnifiedWorkspace((prev) => ({
        ...prev,
        quotes: prev.quotes.map((q) =>
          q.quote_id === quoteId ? { ...q, status, updatedAtMs: Date.now() } : q
        ),
      }));

      await appendUnifiedAuditLog({
        actor_uid: actor.uid,
        actor_email: actor.email,
        action_category: 'QUOTE_CONVERT',
        action: 'UPDATE_QUOTE_STATUS',
        target_collection: 'quotes',
        target_id: quoteId,
        summary: `Quote ${quoteId} marked ${status}`,
      });
    },
    []
  );

  const convertQuoteToOrderAndJob = useCallback(
    async (
      quote: QuoteRecord,
      options: {
        installerUid: string;
        installerName: string;
        paymentMode: PaymentMode;
        targetHomeId?: string;
      },
      actor: { uid: string; email: string }
    ): Promise<{ homeId: string; jobId: string }> => {
      const homeId =
        options.targetHomeId ||
        quote.homeId ||
        `home_${quote.city.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 10)}_${Date.now().toString().slice(-3)}`;
      const now = Date.now();
      const todayIso = new Date().toISOString().slice(0, 10);

      const newJob: InstallerJobRecord = {
        job_id: `JOB-2026-${Math.floor(100 + Math.random() * 899)}`,
        home_id: homeId,
        home_name: `${quote.buyerName} (${quote.homeType})`,
        customer_name: quote.buyerName,
        customer_phone: quote.buyerPhone,
        address: `${quote.city} · ${quote.homeType}`,
        installer_uid: options.installerUid,
        installer_name: options.installerName,
        type: 'INITIAL_SETUP_LINKING',
        allow_3d_setup: quote.includeDfy3d,
        status: 'ACTIVE',
        notes: quote.notes || `Converted from quote ${quote.quote_ref}`,
        linked_device_ids: [],
        createdAtMs: now,
        expiresAtMs: now + 72 * 3600 * 1000,
      };

      const hwTx: TransactionRecord = {
        tx_id: `tx_hw_${now}`,
        tx_ref: `ORD-${quote.quote_ref}`,
        category: 'HARDWARE_SALE',
        amount_inr: quote.hardwareSubtotalInr + quote.installationTotalInr,
        payment_mode: options.paymentMode,
        customer_name: quote.buyerName,
        home_id: homeId,
        quote_id: quote.quote_ref,
        notes: `Converted Quote ${quote.quote_ref} (${quote.items.length} module lines)`,
        dateIso: todayIso,
        createdAtMs: now,
        module_breakdown: quote.items.map((item) => ({
          module_code: item.module_code,
          qty: item.qty,
          revenue_inr: item.unitRetailInr * item.qty,
          bom_inr: item.unitBomInr,
        })),
      };

      const bomTotal = quote.items.reduce((s, i) => s + i.unitBomInr * i.qty, 0);
      const bomExp: ExpenseRecord = {
        exp_id: `exp_bom_${now}`,
        category: 'HARDWARE_BOM',
        amount_inr: bomTotal,
        vendor: 'DD oodle Assembly BOM Allocation',
        description: `Allocated hardware BOM COGS for ${quote.quote_ref}`,
        payment_mode: 'Bank',
        invoice_ref: quote.quote_ref,
        dateIso: todayIso,
        createdAtMs: now,
      };

      mutateUnifiedWorkspace((prev) => {
        const extraTxs: TransactionRecord[] = [hwTx];
        if (quote.includeDfy3d && quote.dfy3dTotalInr > 0) {
          extraTxs.push({
            tx_id: `tx_dfy_${now}`,
            tx_ref: `DFY-${quote.quote_ref}`,
            category: 'DFY_3D_TWIN',
            amount_inr: quote.dfy3dTotalInr,
            payment_mode: options.paymentMode,
            customer_name: quote.buyerName,
            home_id: homeId,
            quote_id: quote.quote_ref,
            notes: `₹${quote.dfy3dTotalInr} DFY 3D Twin add-on (${newJob.job_id})`,
            dateIso: todayIso,
            createdAtMs: now,
          });
        }

        const existingSub = prev.erp.subscriptions.find((s) => s.homeId === homeId);
        const nextSubs = existingSub
          ? prev.erp.subscriptions.map((s) =>
              s.homeId === homeId
                ? {
                    ...s,
                    tier: quote.subscriptionTier || s.tier,
                    status: 'active' as const,
                    paymentMode: options.paymentMode,
                    upiStatus: 'PAID' as const,
                    dfy3dPurchased: s.dfy3dPurchased || quote.includeDfy3d,
                  }
                : s
            )
          : [
              {
                homeId,
                customer: quote.buyerName,
                phone: quote.buyerPhone,
                tier: quote.subscriptionTier || 'plus',
                status: 'active' as const,
                trialStatus: 'Active Plan (Converted Quote)',
                simRenewal: 'N/A',
                upiStatus: 'PAID' as const,
                paymentMode: options.paymentMode,
                dfy3dPurchased: quote.includeDfy3d,
              },
              ...prev.erp.subscriptions,
            ];

        return {
          ...prev,
          quotes: prev.quotes.map((q) =>
            q.quote_id === quote.quote_id
              ? { ...q, status: 'CONVERTED', homeId, updatedAtMs: now }
              : q
          ),
          installerJobs: [newJob, ...prev.installerJobs],
          erp: {
            ...prev.erp,
            subscriptions: nextSubs,
            transactions: [...extraTxs, ...prev.erp.transactions],
            expenses: [bomExp, ...prev.erp.expenses],
          },
        };
      });

      await appendUnifiedAuditLog({
        actor_uid: actor.uid,
        actor_email: actor.email,
        action_category: 'QUOTE_CONVERT',
        action: 'CONVERT_QUOTE_TO_ORDER_AND_JOB',
        target_collection: 'quotes',
        target_id: quote.quote_ref,
        summary: `Converted ${quote.quote_ref} (₹${quote.grandTotalInr.toLocaleString('en-IN')}) -> Home ${homeId} & Job ${newJob.job_id}`,
      });

      return { homeId, jobId: newJob.job_id };
    },
    []
  );

  return {
    erp: workspace.erp,
    transactions: workspace.erp.transactions,
    expenses: workspace.erp.expenses,
    subscriptions: workspace.erp.subscriptions,
    deviceStates: workspace.erp.deviceStates,
    accounts: workspace.erp.accounts,
    auditLogs: workspace.erp.auditLogs,
    incidents: workspace.erp.incidents,
    amcTickets: workspace.erp.amcTickets,
    jobs: workspace.installerJobs,
    quotes: workspace.quotes,
    recordTx,
    recordExp,
    updateSubscriptionPlan,
    setHomeDfy3dPurchased,
    resolveAmcTicket,
    setDeviceActivationState,
    setUserAccountRoleOrStatus,
    dispatchInstallerJob,
    revokeInstallerJob,
    setQuoteStatus,
    convertQuoteToOrderAndJob,
  };
}

export type {
  AmcTicketRecord,
  AuditActionCategory,
  AuditLogEntry,
  CanonicalLockAccessLog,
  CanonicalVehicleTrip,
  CatalogModuleOverride,
  ErpSnapshot,
  ExpenseCategory,
  ExpenseRecord,
  IncidentRecord,
  InstallerJobRecord,
  InstallerJobStatus,
  InstallerJobType,
  ManagedDeviceActivation,
  ManagedSubscriptionRecord,
  PaymentMode,
  QuoteRecord,
  QuoteStatus,
  StoreConfigDoc,
  TransactionCategory,
  TransactionModuleBreakdownItem,
  TransactionRecord,
  UnifiedWorkspaceState,
  UserAccountRecord,
} from './canonicalSeed';

