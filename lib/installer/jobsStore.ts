'use client';

/**
 * DD oodle Smart Home — Scoped Field Installer Jobs Store
 * Isolated strictly to active Admin-authorized installer jobs and device linking state.
 * Contains ZERO pricing, BOM, profit, expense, or user-management logic.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { SessionPayload } from '@/lib/auth/session';
import { ModuleCode } from '@/lib/protocol/contract';
import { getHardwareModule } from '@/lib/catalog/hardwareRegistry';

export type InstallerJobType =
  | 'INITIAL_SETUP_LINKING'
  | 'FOLLOWUP_3D_SERVICE'
  | 'AMC_SWAP';

export type InstallerJobStatus = 'ACTIVE' | 'COMPLETED' | 'REVOKED' | 'EXPIRED';

export interface LinkedDeviceRecord {
  device_id: string;
  module_code: ModuleCode;
  room_id: string;
  local_pin: string;
  linkedAtMs: number;
}

export interface InstallerJobRecord {
  job_id: string;
  home_id: string;
  home_name: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  installer_uid: string;
  installer_name: string;
  type: InstallerJobType;
  allow_3d_setup: boolean;
  status: InstallerJobStatus;
  expiresAtMs: number;
  linked_device_ids: string[];
  linked_devices_detail: LinkedDeviceRecord[];
  notes: string;
  assigned_by?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export const INSTALLER_JOBS_STORAGE_KEY = 'dd_oodle_installer_jobs_v1';
export const INSTALLER_JOBS_SYNC_EVENT = 'ddoodle:installer-jobs-sync';

const HOUR_MS = 60 * 60 * 1000;
const BASE_DEMO_TS = Date.now();

export const DEFAULT_INSTALLER_JOBS: InstallerJobRecord[] = [
  {
    job_id: 'home_imphal_001_uid_installer_manipur_01',
    home_id: 'home_imphal_001',
    home_name: 'Imphal Residence',
    customer_name: 'Thangboi Haokip',
    customer_phone: '+919862011114',
    address: 'Lamphelpat, Imphal West, Manipur 795004',
    installer_uid: 'uid_installer_manipur_01',
    installer_name: 'Bikramjit Singh (Field Tech)',
    type: 'INITIAL_SETUP_LINKING',
    allow_3d_setup: true,
    status: 'ACTIVE',
    expiresAtMs: BASE_DEMO_TS + 48 * HOUR_MS,
    linked_device_ids: ['dd_pwr01_a1b2c3', 'dd_wat01_j1k2l3'],
    linked_devices_detail: [
      {
        device_id: 'dd_pwr01_a1b2c3',
        module_code: 'PWR-01',
        room_id: 'room_living',
        local_pin: '48291034',
        linkedAtMs: BASE_DEMO_TS - 2 * HOUR_MS,
      },
      {
        device_id: 'dd_wat01_j1k2l3',
        module_code: 'WAT-01',
        room_id: 'room_terrace',
        local_pin: '90418275',
        linkedAtMs: BASE_DEMO_TS - 1 * HOUR_MS,
      },
    ],
    notes: 'Link Living Switchboard, Terrace WAT-01, and deliver ₹999 DFY 3D Home Twin.',
    assigned_by: 'uid_admin_ddoodle_01',
    createdAtMs: BASE_DEMO_TS - 4 * HOUR_MS,
    updatedAtMs: BASE_DEMO_TS - 1 * HOUR_MS,
  },
  {
    job_id: 'home_imphal_014_uid_installer_manipur_01',
    home_id: 'home_imphal_014',
    home_name: 'Porompat Villa',
    customer_name: 'Nandini Devi',
    customer_phone: '+919862077301',
    address: 'Porompat, Imphal East, Manipur 795005',
    installer_uid: 'uid_installer_manipur_01',
    installer_name: 'Bikramjit Singh (Field Tech)',
    type: 'AMC_SWAP',
    allow_3d_setup: false,
    status: 'ACTIVE',
    expiresAtMs: BASE_DEMO_TS + 24 * HOUR_MS,
    linked_device_ids: [],
    linked_devices_detail: [],
    notes: 'Shield 24h Priority Swap: Replace bathroom PWR-03 geyser contactor only (3D not authorized).',
    assigned_by: 'uid_admin_ddoodle_01',
    createdAtMs: BASE_DEMO_TS - 3 * HOUR_MS,
    updatedAtMs: BASE_DEMO_TS - 3 * HOUR_MS,
  },
];

export function isJobActiveAndValid(job: InstallerJobRecord, nowMs: number = Date.now()): boolean {
  return job.status === 'ACTIVE' && job.expiresAtMs > nowMs;
}

export function canJobAccess3DStudio(job: InstallerJobRecord, nowMs: number = Date.now()): boolean {
  return (
    isJobActiveAndValid(job, nowMs) &&
    job.allow_3d_setup &&
    (job.type === 'INITIAL_SETUP_LINKING' || job.type === 'FOLLOWUP_3D_SERVICE')
  );
}

export function readStoredInstallerJobs(): InstallerJobRecord[] {
  if (typeof window === 'undefined') return DEFAULT_INSTALLER_JOBS;
  try {
    const raw = window.localStorage.getItem(INSTALLER_JOBS_STORAGE_KEY);
    if (!raw) return DEFAULT_INSTALLER_JOBS;
    const parsed = JSON.parse(raw) as InstallerJobRecord[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_INSTALLER_JOBS;
  } catch {
    return DEFAULT_INSTALLER_JOBS;
  }
}

export function writeStoredInstallerJobs(jobs: InstallerJobRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(INSTALLER_JOBS_STORAGE_KEY, JSON.stringify(jobs));
    window.dispatchEvent(new CustomEvent(INSTALLER_JOBS_SYNC_EVENT));
  } catch {
    // Ignore storage quota errors
  }
}

export async function linkDeviceOnInstallerJob(params: {
  job: InstallerJobRecord;
  deviceId: string;
  moduleCode: ModuleCode;
  roomId: string;
  localPin: string;
  deviceName: string;
}): Promise<{ ok: boolean; syncedCloud: boolean; updatedJob: InstallerJobRecord }> {
  const { job, deviceId, moduleCode, roomId, localPin, deviceName } = params;
  const now = Date.now();
  const nextLinkedIds = job.linked_device_ids.includes(deviceId)
    ? job.linked_device_ids
    : [...job.linked_device_ids, deviceId];

  const detailEntry: LinkedDeviceRecord = {
    device_id: deviceId,
    module_code: moduleCode,
    room_id: roomId,
    local_pin: localPin,
    linkedAtMs: now,
  };

  const nextDetails = [
    ...job.linked_devices_detail.filter((d) => d.device_id !== deviceId),
    detailEntry,
  ];

  const updatedJob: InstallerJobRecord = {
    ...job,
    linked_device_ids: nextLinkedIds,
    linked_devices_detail: nextDetails,
    updatedAtMs: now,
  };

  const allJobs = readStoredInstallerJobs();
  writeStoredInstallerJobs(
    allJobs.map((j) => (j.job_id === job.job_id ? updatedJob : j))
  );

  let syncedCloud = false;
  try {
    const spec = getHardwareModule(moduleCode);
    await setDoc(
      doc(db, 'homes', job.home_id, 'devices', deviceId),
      {
        module_code: moduleCode,
        name: deviceName || spec?.shortName || moduleCode,
        room_id: roomId,
        fw_version: '1.4.0',
        operation_mode: 'CLOUD_DIRECT',
        power_restore: moduleCode === 'PWR-03' || moduleCode === 'WAT-01' ? 'OFF' : 'RESTORE_LAST',
        local_pin: localPin,
        guardrails: spec?.guardrails ?? { hard_locked: false },
        capabilities: spec?.capabilities ?? [{ key: 'ch1', type: 'switch', label: 'Primary Switch' }],
        settings: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await updateDoc(doc(db, 'installer_jobs', job.job_id), {
      linked_device_ids: nextLinkedIds,
      status: 'ACTIVE',
      updatedAt: serverTimestamp(),
    });
    syncedCloud = true;
  } catch {
    // Demo/offline mode still persists cleanly in local jobs store
  }

  return { ok: true, syncedCloud, updatedJob };
}

export async function completeInstallerJob(
  jobId: string
): Promise<{ ok: boolean; syncedCloud: boolean }> {
  const now = Date.now();
  const allJobs = readStoredInstallerJobs();
  writeStoredInstallerJobs(
    allJobs.map((j) =>
      j.job_id === jobId ? { ...j, status: 'COMPLETED', updatedAtMs: now } : j
    )
  );

  let syncedCloud = false;
  try {
    await updateDoc(doc(db, 'installer_jobs', jobId), {
      status: 'COMPLETED',
      updatedAt: serverTimestamp(),
    });
    syncedCloud = true;
  } catch {
    // Offline/demo fallback handled cleanly
  }

  return { ok: true, syncedCloud };
}

export function useScopedInstallerJobs(session: SessionPayload | null) {
  const [jobs, setJobs] = useState<InstallerJobRecord[]>(DEFAULT_INSTALLER_JOBS);
  const [hydrated, setHydrated] = useState(false);

  const syncLocal = useCallback(() => {
    setJobs(readStoredInstallerJobs());
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      syncLocal();
      setHydrated(true);
    }, 0);

    const onSync = () => syncLocal();
    const onStorage = (e: StorageEvent) => {
      if (e.key === INSTALLER_JOBS_STORAGE_KEY) syncLocal();
    };
    window.addEventListener(INSTALLER_JOBS_SYNC_EVENT, onSync);
    window.addEventListener('storage', onStorage);

    // Best-effort Firestore query for assigned active jobs when Firebase Auth session is active
    let cancelled = false;
    if (session?.mode === 'firebase') {
      (async () => {
        try {
          const q =
            session.role === 'admin'
              ? collection(db, 'installer_jobs')
              : query(
                  collection(db, 'installer_jobs'),
                  where('installer_uid', '==', session.uid)
                );
          const snap = await getDocs(q);
          if (cancelled || snap.empty) return;
          const remote: InstallerJobRecord[] = [];
          snap.forEach((docSnap) => {
            const d = docSnap.data() as {
              home_id?: string;
              home_name?: string;
              installer_uid?: string;
              installer_name?: string;
              type?: InstallerJobType;
              allow_3d_setup?: boolean;
              status?: InstallerJobStatus;
              expires_at?: Timestamp;
              linked_device_ids?: string[];
              notes?: string;
            };
            if (!d.home_id || !d.installer_uid) return;
            remote.push({
              job_id: docSnap.id,
              home_id: d.home_id,
              home_name: d.home_name || d.home_id,
              customer_name: d.home_name || 'Customer Home',
              customer_phone: '',
              address: 'Verified Home',
              installer_uid: d.installer_uid,
              installer_name: d.installer_name || 'Assigned Installer',
              type: d.type || 'INITIAL_SETUP_LINKING',
              allow_3d_setup: Boolean(d.allow_3d_setup),
              status: d.status || 'ACTIVE',
              expiresAtMs: d.expires_at?.toMillis ? d.expires_at.toMillis() : Date.now() + 24 * HOUR_MS,
              linked_device_ids: d.linked_device_ids || [],
              linked_devices_detail: [],
              notes: d.notes || '',
              createdAtMs: Date.now(),
              updatedAtMs: Date.now(),
            });
          });
          if (remote.length > 0) setJobs(remote);
        } catch {
          // Offline / demo fallback
        }
      })();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.removeEventListener(INSTALLER_JOBS_SYNC_EVENT, onSync);
      window.removeEventListener('storage', onStorage);
    };
  }, [session, syncLocal]);

  const scopedJobs = jobs.filter((job) => {
    if (!session) return false;
    if (session.role === 'admin') return true;
    return job.installer_uid === session.uid;
  });

  const activeJobs = scopedJobs.filter((j) => isJobActiveAndValid(j));
  const inactiveJobs = scopedJobs.filter((j) => !isJobActiveAndValid(j));

  return {
    scopedJobs,
    activeJobs,
    inactiveJobs,
    hydrated,
    linkDevice: linkDeviceOnInstallerJob,
    completeJob: completeInstallerJob,
  };
}
