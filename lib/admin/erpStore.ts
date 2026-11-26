'use client';

/**
 * DD oodle Smart Home — Master Admin ERP, Finance, Support & Inventory Store
 *
 * Routed directly through the Phase 13B Unified Full-Stack Data Spine (`lib/data/unifiedStore.ts`).
 */

import {
  appendUnifiedAuditLog,
  getUnifiedWorkspaceState,
  useUnifiedFinance,
  type AmcTicketRecord,
  type AuditActionCategory,
  type AuditLogEntry,
  type ErpSnapshot,
  type ExpenseCategory,
  type ExpenseRecord,
  type IncidentRecord,
  type ManagedDeviceActivation,
  type ManagedSubscriptionRecord,
  type PaymentMode,
  type TransactionCategory,
  type TransactionModuleBreakdownItem,
  type TransactionRecord,
  type UserAccountRecord,
} from '../data/unifiedStore';

export type {
  AmcTicketRecord,
  AuditActionCategory,
  AuditLogEntry,
  ErpSnapshot,
  ExpenseCategory,
  ExpenseRecord,
  IncidentRecord,
  ManagedDeviceActivation,
  ManagedSubscriptionRecord,
  PaymentMode,
  TransactionCategory,
  TransactionModuleBreakdownItem,
  TransactionRecord,
  UserAccountRecord,
};


export function loadErpStore(): ErpSnapshot {
  return getUnifiedWorkspaceState().erp;
}

export async function appendAuditLog(
  input: Omit<AuditLogEntry, 'log_id' | 'createdAtMs'>
): Promise<AuditLogEntry> {
  return appendUnifiedAuditLog(input);
}

export function useAdminErpStore() {
  return useUnifiedFinance();
}

export { useUnifiedFinance };
