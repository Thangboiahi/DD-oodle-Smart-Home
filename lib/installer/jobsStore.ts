'use client';

/**
 * DD oodle Smart Home — Field Installer Jobs & DFY 3D Twin Dispatch Store
 *
 * Routed directly through the Phase 13B Unified Full-Stack Data Spine (`lib/data/unifiedStore.ts`).
 */

import type { SessionPayload } from '../auth/session';
import {
  getUnifiedWorkspaceState,
  useUnifiedJobs,
  type InstallerJobRecord,
  type InstallerJobStatus,
  type InstallerJobType,
} from '../data/unifiedStore';

export type {
  InstallerJobRecord,
  InstallerJobStatus,
  InstallerJobType,
};

export function canJobAccess3DStudio(job: InstallerJobRecord | null | undefined): boolean {
  if (!job) return false;
  if (job.status !== 'ACTIVE') return false;
  if (job.type === 'AMC_SWAP') return false;
  return Boolean(job.allow_3d_setup);
}

export function loadInstallerJobs(): InstallerJobRecord[] {
  return getUnifiedWorkspaceState().installerJobs;
}

export function useScopedInstallerJobs(session?: SessionPayload) {
  return useUnifiedJobs(session);
}

export function useInstallerJobs(session?: SessionPayload) {
  return useUnifiedJobs(session);
}

export { useUnifiedJobs };
