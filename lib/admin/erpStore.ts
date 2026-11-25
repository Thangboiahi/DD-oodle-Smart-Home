'use client';

/**
 * DD oodle Smart Home — Admin Command ERP, Subscription Lifecycle, Device Activation,
 * Installer Authority Dispatch, Financial Ledger & Immutable Audit Log Store.
 */

import { useCallback, useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { SessionRole } from '@/lib/auth/session';
import { ModuleCode, SubscriptionStatus, SubscriptionTier } from '@/lib/protocol/contract';
import { TIER_CATALOG } from '@/lib/entitlements/resolver';
import {
  DEFAULT_DEMO_QUOTES,
  QuoteRecord,
  QuoteStatus,
  readStoredQuotes,
  writeStoredQuotes,
} from '@/lib/quotes/quoteService';
import {
  DEFAULT_INSTALLER_JOBS,
  InstallerJobRecord,
  InstallerJobType,
  readStoredInstallerJobs,
  writeStoredInstallerJobs,
} from '@/lib/installer/jobsStore';

export type PaymentMode = 'UPI' | 'Cash' | 'Bank' | 'Card';

export type TransactionCategory =
  | 'HARDWARE_SALE'
  | 'INSTALLATION_FEE'
  | 'DFY_3D_TWIN'
  | 'SUBSCRIPTION_RENEWAL'
  | 'SIM_RENEWAL'
  | 'REFUND'
  | 'OTHER_INCOME';

export type ExpenseCategory =
  | 'HARDWARE_BOM'
  | 'ENCLOSURE_FAB'
  | 'SHIPPING_GST'
  | 'INSTALLER_PAYOUT'
  | 'CLOUD_MQTT_SIM'
  | 'OPERATIONS';

export interface ModuleSaleBreakdown {
  module_code: string;
  qty: number;
  revenue_inr: number;
  bom_inr: number;
}

export interface TransactionRecord {
  tx_id: string;
  tx_ref: string;
  category: TransactionCategory;
  amount_inr: number;
  payment_mode: PaymentMode;
  customer_name: string;
  quote_id?: string;
  home_id?: string;
  invoice_ref?: string;
  notes: string;
  module_breakdown?: ModuleSaleBreakdown[];
  dateIso: string; // YYYY-MM-DD
  createdAtMs: number;
}

export interface ExpenseRecord {
  exp_id: string;
  category: ExpenseCategory;
  amount_inr: number;
  vendor: string;
  description: string;
  payment_mode: PaymentMode;
  invoice_ref?: string;
  dateIso: string; // YYYY-MM-DD
  createdAtMs: number;
}

export type AuditActionCategory =
  | 'PRICING'
  | 'SUBSCRIPTION'
  | 'DEVICE_STATE'
  | 'ACCOUNT'
  | 'INSTALLER_AUTH'
  | 'QUOTE_CONVERT'
  | 'FINANCE';

export interface AuditLogRecord {
  log_id: string;
  actor_uid: string;
  actor_email: string;
  action_category: AuditActionCategory;
  action: string;
  target_collection: string;
  target_id: string;
  summary: string;
  createdAtMs: number;
}

export interface ManagedAccountRecord {
  uid: string;
  name: string;
  phone: string;
  email: string;
  role: SessionRole;
  status: 'ACTIVE' | 'SUSPENDED';
  home_id: string;
}

export interface ManagedSubscriptionRecord {
  homeId: string;
  customer: string;
  phone: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialStatus: string;
  simRenewal: string;
  paymentMode: PaymentMode;
  upiStatus: 'PAID' | 'TRIAL' | 'DUE D-7' | 'PAUSED' | 'CORE FLOOR';
  dfy3dPurchased: boolean;
}

export interface ManagedDeviceActivation {
  device_id: string;
  home_id: string;
  module_code: ModuleCode;
  name: string;
  activation: 'ACTIVE' | 'QUARANTINED' | 'UNCLAIMED';
  reason: string;
  updatedAtMs: number;
}

const LS_KEYS = {
  TX: 'dd_oodle_erp_tx_v1',
  EXP: 'dd_oodle_erp_exp_v1',
  AUDIT: 'dd_oodle_erp_audit_v1',
  ACCOUNTS: 'dd_oodle_erp_accounts_v1',
  SUBS: 'dd_oodle_erp_subs_v1',
  DEV_STATES: 'dd_oodle_erp_dev_states_v1',
};

const ERP_SYNC_EVENT = 'ddoodle:erp-sync';

export const DEFAULT_TRANSACTIONS: TransactionRecord[] = [
  {
    tx_id: 'tx_202608_01',
    tx_ref: 'INV-2026-0804',
    category: 'HARDWARE_SALE',
    amount_inr: 25992,
    payment_mode: 'UPI',
    customer_name: 'R. Ningthoujam (Imphal)',
    home_id: 'home_imphal_001',
    invoice_ref: 'GST/26-27/0804',
    notes: '4x PWR-01, 2x PWR-03, 1x WAT-01, 1x HUB-01',
    module_breakdown: [
      { module_code: 'PWR-01', qty: 4, revenue_inr: 7996, bom_inr: 3392 },
      { module_code: 'PWR-03', qty: 2, revenue_inr: 4998, bom_inr: 2182 },
      { module_code: 'WAT-01', qty: 1, revenue_inr: 7999, bom_inr: 4134 },
      { module_code: 'HUB-01', qty: 1, revenue_inr: 3499, bom_inr: 1246 },
    ],
    dateIso: '2026-08-18',
    createdAtMs: 1755500000000,
  },
  {
    tx_id: 'tx_202609_01',
    tx_ref: 'INV-2026-0912',
    category: 'HARDWARE_SALE',
    amount_inr: 22394,
    payment_mode: 'Bank',
    customer_name: 'Nandini Devi (Porompat)',
    home_id: 'home_imphal_014',
    invoice_ref: 'GST/26-27/0912',
    notes: '3x PWR-01, 2x PWR-02, 1x VEH-01, 1x HUB-01',
    module_breakdown: [
      { module_code: 'PWR-01', qty: 3, revenue_inr: 5997, bom_inr: 2544 },
      { module_code: 'PWR-02', qty: 2, revenue_inr: 4398, bom_inr: 1778 },
      { module_code: 'VEH-01', qty: 1, revenue_inr: 7999, bom_inr: 4227 },
      { module_code: 'HUB-01', qty: 1, revenue_inr: 3499, bom_inr: 1246 },
    ],
    dateIso: '2026-09-14',
    createdAtMs: 1757830000000,
  },
  {
    tx_id: 'tx_202609_02',
    tx_ref: 'INV-2026-0919',
    category: 'SUBSCRIPTION_RENEWAL',
    amount_inr: 2499,
    payment_mode: 'UPI',
    customer_name: 'Porompat Villa (Shield Annual)',
    home_id: 'home_imphal_014',
    invoice_ref: 'SUB-SHIELD-0919',
    notes: 'Shield Annual Plan + 24h Swap SLA',
    dateIso: '2026-09-19',
    createdAtMs: 1758260000000,
  },
  {
    tx_id: 'tx_202610_01',
    tx_ref: 'INV-2026-1007',
    category: 'HARDWARE_SALE',
    amount_inr: 31990,
    payment_mode: 'UPI',
    customer_name: 'Laitumkhrah Heights (Shillong)',
    home_id: 'home_shillong_008',
    invoice_ref: 'GST/26-27/1007',
    notes: '4x PWR-01, 2x WAT-01, 1x VEH-01',
    module_breakdown: [
      { module_code: 'PWR-01', qty: 4, revenue_inr: 7996, bom_inr: 3392 },
      { module_code: 'WAT-01', qty: 2, revenue_inr: 15998, bom_inr: 8268 },
      { module_code: 'VEH-01', qty: 1, revenue_inr: 7999, bom_inr: 4227 },
    ],
    dateIso: '2026-10-11',
    createdAtMs: 1760170000000,
  },
  {
    tx_id: 'tx_202610_02',
    tx_ref: 'INV-2026-1015',
    category: 'DFY_3D_TWIN',
    amount_inr: 1998,
    payment_mode: 'Cash',
    customer_name: '2x DFY 3D Home Twin On-Site Packages',
    invoice_ref: 'SRV-3D-1015',
    notes: '2x ₹999 Done-For-You 3D Twin setups completed',
    dateIso: '2026-10-20',
    createdAtMs: 1760940000000,
  },
  {
    tx_id: 'tx_202611_01',
    tx_ref: 'INV-2026-1105',
    category: 'HARDWARE_SALE',
    amount_inr: 18493,
    payment_mode: 'UPI',
    customer_name: 'Guwahati Studio + Expansion',
    home_id: 'home_guwahati_002',
    invoice_ref: 'GST/26-27/1105',
    notes: '3x PWR-01, 2x PWR-02, 2x PWR-03, 1x HUB-01',
    module_breakdown: [
      { module_code: 'PWR-01', qty: 3, revenue_inr: 5997, bom_inr: 2544 },
      { module_code: 'PWR-02', qty: 2, revenue_inr: 4398, bom_inr: 1778 },
      { module_code: 'PWR-03', qty: 2, revenue_inr: 4998, bom_inr: 2182 },
      { module_code: 'HUB-01', qty: 1, revenue_inr: 3499, bom_inr: 1246 },
    ],
    dateIso: '2026-11-08',
    createdAtMs: 1762580000000,
  },
  {
    tx_id: 'tx_202611_02',
    tx_ref: 'INV-2026-1114',
    category: 'SUBSCRIPTION_RENEWAL',
    amount_inr: 4998,
    payment_mode: 'UPI',
    customer_name: 'Drive + All-In Family Renewals',
    invoice_ref: 'SUB-NOV-1114',
    notes: '1x All-In Family (₹3,499) + 1x Drive Yr-2 (₹1,499)',
    dateIso: '2026-11-16',
    createdAtMs: 1763270000000,
  },
];

export const DEFAULT_EXPENSES: ExpenseRecord[] = [
  {
    exp_id: 'exp_202608_01',
    category: 'HARDWARE_BOM',
    amount_inr: 11200,
    vendor: 'Robu / JLCPCB Pilot Lot #1',
    description: 'ESP32-C3 + Relay + HLW8032 PCB assembly batch',
    payment_mode: 'Bank',
    invoice_ref: 'PO-BOM-801',
    dateIso: '2026-08-05',
    createdAtMs: 1754380000000,
  },
  {
    exp_id: 'exp_202609_01',
    category: 'HARDWARE_BOM',
    amount_inr: 10150,
    vendor: 'Shenzhen / Local SMT Batch #2',
    description: 'VEH-01 4G Cat-1 & WAT-01 Ultrasonic sub-assemblies',
    payment_mode: 'Bank',
    invoice_ref: 'PO-BOM-902',
    dateIso: '2026-09-04',
    createdAtMs: 1756970000000,
  },
  {
    exp_id: 'exp_202609_02',
    category: 'INSTALLER_PAYOUT',
    amount_inr: 2800,
    vendor: 'Bikramjit Singh (Field Tech)',
    description: 'Sept on-site commissioning & DB wiring payouts',
    payment_mode: 'UPI',
    invoice_ref: 'PAY-0922',
    dateIso: '2026-09-25',
    createdAtMs: 1758780000000,
  },
  {
    exp_id: 'exp_202610_01',
    category: 'ENCLOSURE_FAB',
    amount_inr: 6400,
    vendor: 'Imphal UL94 V-0 Tooling Works',
    description: '3D-printed & injection DIN / gang-box enclosures',
    payment_mode: 'Cash',
    invoice_ref: 'ENC-1003',
    dateIso: '2026-10-08',
    createdAtMs: 1759910000000,
  },
  {
    exp_id: 'exp_202610_02',
    category: 'HARDWARE_BOM',
    amount_inr: 15887,
    vendor: 'Core Component Restock',
    description: 'Phase 1 Pilot Stock Lot #3 (PWR/WAT/VEH)',
    payment_mode: 'Bank',
    invoice_ref: 'PO-BOM-1012',
    dateIso: '2026-10-14',
    createdAtMs: 1760430000000,
  },
  {
    exp_id: 'exp_202611_01',
    category: 'CLOUD_MQTT_SIM',
    amount_inr: 2650,
    vendor: 'GCP Cloud Run + EMQX + Airtel IoT M2M',
    description: 'Monthly MQTT bridge compute, MSG91 SOS & 4G M2M SIM pool',
    payment_mode: 'Card',
    invoice_ref: 'CLD-202611',
    dateIso: '2026-11-10',
    createdAtMs: 1762760000000,
  },
  {
    exp_id: 'exp_202611_02',
    category: 'HARDWARE_BOM',
    amount_inr: 7750,
    vendor: 'Nov BOM Allocation',
    description: 'Nov assembly BOM cost for Guwahati & Imphal orders',
    payment_mode: 'Bank',
    invoice_ref: 'PO-BOM-1102',
    dateIso: '2026-11-12',
    createdAtMs: 1762930000000,
  },
];

export const DEFAULT_MANAGED_ACCOUNTS: ManagedAccountRecord[] = [
  {
    uid: 'uid_customer_imphal_01',
    name: 'Thangboi Haokip',
    phone: '+919862011114',
    email: 'owner@ddoodle.in',
    role: 'customer',
    status: 'ACTIVE',
    home_id: 'home_imphal_001',
  },
  {
    uid: 'uid_family_imphal_02',
    name: 'Priya Sharma',
    phone: '+919862022282',
    email: 'family@ddoodle.in',
    role: 'family_member',
    status: 'ACTIVE',
    home_id: 'home_imphal_001',
  },
  {
    uid: 'uid_installer_manipur_01',
    name: 'Bikramjit Singh (Field Tech)',
    phone: '+919862055501',
    email: 'installer@ddoodle.in',
    role: 'installer',
    status: 'ACTIVE',
    home_id: 'home_imphal_001',
  },
  {
    uid: 'uid_installer_guwahati_02',
    name: 'Debajit Kalita',
    phone: '+919435011904',
    email: 'debajit@ddoodle.in',
    role: 'installer',
    status: 'ACTIVE',
    home_id: 'home_guwahati_002',
  },
  {
    uid: 'uid_admin_ddoodle_01',
    name: 'DD oodle Master Admin',
    phone: '+919862099900',
    email: 'thangboiahi@gmail.com',
    role: 'admin',
    status: 'ACTIVE',
    home_id: 'home_imphal_001',
  },
];

export const DEFAULT_MANAGED_SUBSCRIPTIONS: ManagedSubscriptionRecord[] = [
  {
    homeId: 'home_imphal_001',
    customer: 'Imphal Residence',
    phone: '+919862011114',
    tier: 'all_in_family',
    status: 'active',
    trialStatus: '89d Trial Active',
    simRenewal: '2027-08-15 (4G M2M Active)',
    paymentMode: 'UPI',
    upiStatus: 'TRIAL',
    dfy3dPurchased: true,
  },
  {
    homeId: 'home_imphal_014',
    customer: 'Porompat Villa',
    phone: '+919862077301',
    tier: 'shield',
    status: 'active',
    trialStatus: 'Annual Active',
    simRenewal: 'N/A (No VEH-01)',
    paymentMode: 'UPI',
    upiStatus: 'PAID',
    dfy3dPurchased: false,
  },
  {
    homeId: 'home_shillong_008',
    customer: 'Laitumkhrah Heights',
    phone: '+919436100421',
    tier: 'drive',
    status: 'active',
    trialStatus: 'Yr-2 Renewal Due',
    simRenewal: '2026-11-29 (D-7 Alert)',
    paymentMode: 'UPI',
    upiStatus: 'DUE D-7',
    dfy3dPurchased: false,
  },
  {
    homeId: 'home_guwahati_002',
    customer: 'Guwahati Studio',
    phone: '+919435088219',
    tier: 'core',
    status: 'active',
    trialStatus: 'Core Free Forever',
    simRenewal: 'N/A',
    paymentMode: 'Cash',
    upiStatus: 'CORE FLOOR',
    dfy3dPurchased: false,
  },
];

export const DEFAULT_AUDIT_LOGS: AuditLogRecord[] = [
  {
    log_id: 'aud_001',
    actor_uid: 'uid_admin_ddoodle_01',
    actor_email: 'thangboiahi@gmail.com',
    action_category: 'INSTALLER_AUTH',
    action: 'DISPATCH_INSTALLER_JOB',
    target_collection: 'installer_jobs',
    target_id: 'home_imphal_001_uid_installer_manipur_01',
    summary: 'Authorized Bikramjit Singh for INITIAL_SETUP_LINKING + DFY 3D Builder (48h TTL).',
    createdAtMs: 1764040000000,
  },
  {
    log_id: 'aud_002',
    actor_uid: 'uid_admin_ddoodle_01',
    actor_email: 'thangboiahi@gmail.com',
    action_category: 'PRICING',
    action: 'PUBLISH_V14_CATALOG',
    target_collection: 'store_config',
    target_id: 'main',
    summary: 'Verified v1.4 launch MRPs & BOM baselines across all 42 hardware modules.',
    createdAtMs: 1764020000000,
  },
];

function readLs<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLs<T>(key: string, val: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
    window.dispatchEvent(new CustomEvent(ERP_SYNC_EVENT));
  } catch {
    // Ignore quota errors
  }
}

export async function appendAuditLog(entry: Omit<AuditLogRecord, 'log_id' | 'createdAtMs'>) {
  const full: AuditLogRecord = {
    ...entry,
    log_id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAtMs: Date.now(),
  };
  const current = readLs<AuditLogRecord[]>(LS_KEYS.AUDIT, DEFAULT_AUDIT_LOGS);
  writeLs(LS_KEYS.AUDIT, [full, ...current].slice(0, 200));

  try {
    await setDoc(doc(db, 'admin_audit_logs', full.log_id), {
      actor_uid: full.actor_uid,
      actor_email: full.actor_email,
      action: full.action,
      target_collection: full.target_collection,
      target_id: full.target_id,
      summary: full.summary,
      metadata: { category: full.action_category },
      createdAt: serverTimestamp(),
    });
  } catch {
    // Expected in local demo preview without verified Firebase Admin credentials
  }
  return full;
}

export async function recordTransaction(
  tx: Omit<TransactionRecord, 'tx_id' | 'createdAtMs'>,
  actor: { uid: string; email: string }
): Promise<TransactionRecord> {
  const full: TransactionRecord = {
    ...tx,
    tx_id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAtMs: Date.now(),
  };
  const current = readLs<TransactionRecord[]>(LS_KEYS.TX, DEFAULT_TRANSACTIONS);
  writeLs(LS_KEYS.TX, [full, ...current]);

  try {
    await setDoc(doc(db, 'transactions', full.tx_id), {
      tx_ref: full.tx_ref,
      category: full.category,
      amount_inr: full.amount_inr,
      payment_mode: full.payment_mode,
      customer_name: full.customer_name,
      quote_id: full.quote_id ?? null,
      home_id: full.home_id ?? null,
      invoice_ref: full.invoice_ref ?? null,
      notes: full.notes,
      recorded_by: actor.uid,
      tx_date: full.dateIso,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Demo fallback stored locally
  }

  await appendAuditLog({
    actor_uid: actor.uid,
    actor_email: actor.email,
    action_category: 'FINANCE',
    action: 'RECORD_TRANSACTION',
    target_collection: 'transactions',
    target_id: full.tx_id,
    summary: `${full.category}: ₹${full.amount_inr.toLocaleString('en-IN')} (${full.payment_mode}) — ${full.customer_name}`,
  });

  return full;
}

export async function recordExpense(
  exp: Omit<ExpenseRecord, 'exp_id' | 'createdAtMs'>,
  actor: { uid: string; email: string }
): Promise<ExpenseRecord> {
  const full: ExpenseRecord = {
    ...exp,
    exp_id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAtMs: Date.now(),
  };
  const current = readLs<ExpenseRecord[]>(LS_KEYS.EXP, DEFAULT_EXPENSES);
  writeLs(LS_KEYS.EXP, [full, ...current]);

  try {
    await setDoc(doc(db, 'expenses', full.exp_id), {
      category: full.category,
      amount_inr: full.amount_inr,
      vendor: full.vendor,
      description: full.description,
      payment_mode: full.payment_mode,
      invoice_ref: full.invoice_ref ?? null,
      recorded_by: actor.uid,
      expense_date: full.dateIso,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Demo fallback stored locally
  }

  await appendAuditLog({
    actor_uid: actor.uid,
    actor_email: actor.email,
    action_category: 'FINANCE',
    action: 'RECORD_EXPENSE',
    target_collection: 'expenses',
    target_id: full.exp_id,
    summary: `${full.category}: ₹${full.amount_inr.toLocaleString('en-IN')} to ${full.vendor}`,
  });

  return full;
}

export function useAdminErpStore() {
  const [quotes, setQuotes] = useState<QuoteRecord[]>(DEFAULT_DEMO_QUOTES);
  const [jobs, setJobs] = useState<InstallerJobRecord[]>(DEFAULT_INSTALLER_JOBS);
  const [transactions, setTransactions] = useState<TransactionRecord[]>(DEFAULT_TRANSACTIONS);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(DEFAULT_EXPENSES);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>(DEFAULT_AUDIT_LOGS);
  const [accounts, setAccounts] = useState<ManagedAccountRecord[]>(DEFAULT_MANAGED_ACCOUNTS);
  const [subscriptions, setSubscriptions] = useState<ManagedSubscriptionRecord[]>(
    DEFAULT_MANAGED_SUBSCRIPTIONS
  );
  const [deviceStates, setDeviceStates] = useState<Record<string, ManagedDeviceActivation>>({});

  const syncAll = useCallback(() => {
    setQuotes(readStoredQuotes());
    setJobs(readStoredInstallerJobs());
    setTransactions(readLs<TransactionRecord[]>(LS_KEYS.TX, DEFAULT_TRANSACTIONS));
    setExpenses(readLs<ExpenseRecord[]>(LS_KEYS.EXP, DEFAULT_EXPENSES));
    setAuditLogs(readLs<AuditLogRecord[]>(LS_KEYS.AUDIT, DEFAULT_AUDIT_LOGS));
    setAccounts(readLs<ManagedAccountRecord[]>(LS_KEYS.ACCOUNTS, DEFAULT_MANAGED_ACCOUNTS));
    setSubscriptions(readLs<ManagedSubscriptionRecord[]>(LS_KEYS.SUBS, DEFAULT_MANAGED_SUBSCRIPTIONS));
    setDeviceStates(readLs<Record<string, ManagedDeviceActivation>>(LS_KEYS.DEV_STATES, {}));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => syncAll(), 0);
    window.addEventListener(ERP_SYNC_EVENT, syncAll);
    window.addEventListener('ddoodle:quotes-sync', syncAll);
    window.addEventListener('ddoodle:installer-jobs-sync', syncAll);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(ERP_SYNC_EVENT, syncAll);
      window.removeEventListener('ddoodle:quotes-sync', syncAll);
      window.removeEventListener('ddoodle:installer-jobs-sync', syncAll);
    };
  }, [syncAll]);

  const setQuoteStatus = async (
    quoteId: string,
    status: QuoteStatus,
    actor: { uid: string; email: string }
  ) => {
    const next = quotes.map((q) =>
      q.quote_id === quoteId ? { ...q, status, updatedAtMs: Date.now() } : q
    );
    writeStoredQuotes(next);
    try {
      await updateDoc(doc(db, 'quotes', quoteId), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Demo mode persisted locally
    }
    await appendAuditLog({
      actor_uid: actor.uid,
      actor_email: actor.email,
      action_category: 'QUOTE_CONVERT',
      action: `QUOTE_STATUS_${status}`,
      target_collection: 'quotes',
      target_id: quoteId,
      summary: `Updated quote ${quoteId} status to ${status}.`,
    });
  };

  const dispatchInstallerJob = async (
    input: {
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
    const jobId = `${input.home_id}_${input.installer_uid}`;
    const expiresAtMs = now + input.expiryHours * 60 * 60 * 1000;
    const newJob: InstallerJobRecord = {
      job_id: jobId,
      home_id: input.home_id,
      home_name: input.home_name,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone,
      address: input.address,
      installer_uid: input.installer_uid,
      installer_name: input.installer_name,
      type: input.type,
      allow_3d_setup: input.allow_3d_setup,
      status: 'ACTIVE',
      expiresAtMs,
      linked_device_ids: [],
      linked_devices_detail: [],
      notes: input.notes,
      assigned_by: actor.uid,
      createdAtMs: now,
      updatedAtMs: now,
    };

    const nextJobs = [newJob, ...jobs.filter((j) => j.job_id !== jobId)];
    writeStoredInstallerJobs(nextJobs);

    try {
      await setDoc(doc(db, 'installer_jobs', jobId), {
        home_id: input.home_id,
        home_name: input.home_name,
        installer_uid: input.installer_uid,
        installer_name: input.installer_name,
        type: input.type,
        allow_3d_setup: input.allow_3d_setup,
        status: 'ACTIVE',
        expires_at: Timestamp.fromMillis(expiresAtMs),
        linked_device_ids: [],
        notes: input.notes,
        assigned_by: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Offline/demo sync fallback
    }

    await appendAuditLog({
      actor_uid: actor.uid,
      actor_email: actor.email,
      action_category: 'INSTALLER_AUTH',
      action: 'DISPATCH_INSTALLER_JOB',
      target_collection: 'installer_jobs',
      target_id: jobId,
      summary: `Assigned ${input.installer_name} -> ${input.home_name} (${input.type}, allow_3d_setup=${input.allow_3d_setup}, ${input.expiryHours}h).`,
    });

    return newJob;
  };

  const revokeInstallerJob = async (
    jobId: string,
    actor: { uid: string; email: string }
  ) => {
    const nextJobs = jobs.map((j) =>
      j.job_id === jobId
        ? { ...j, status: 'REVOKED' as const, allow_3d_setup: false, updatedAtMs: Date.now() }
        : j
    );
    writeStoredInstallerJobs(nextJobs);

    try {
      await updateDoc(doc(db, 'installer_jobs', jobId), {
        status: 'REVOKED',
        allow_3d_setup: false,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Demo fallback
    }

    await appendAuditLog({
      actor_uid: actor.uid,
      actor_email: actor.email,
      action_category: 'INSTALLER_AUTH',
      action: 'REVOKE_INSTALLER_AUTHORITY',
      target_collection: 'installer_jobs',
      target_id: jobId,
      summary: `Immediately revoked installer job ${jobId} & locked home/3D access.`,
    });
  };

  /**
   * 1-Tap "Convert Quote to Order & Job"
   * Creates Income transactions, BOM COGS expense, Customer subscription, & Installer Job.
   */
  const convertQuoteToOrderAndJob = async (
    quote: QuoteRecord,
    params: {
      installerUid: string;
      installerName: string;
      paymentMode: PaymentMode;
    },
    actor: { uid: string; email: string }
  ) => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const homeId = quote.homeId || `home_${quote.quote_ref.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    // 1. Record Hardware Income + module breakdown
    if (quote.hardwareSubtotalInr > 0) {
      await recordTransaction(
        {
          tx_ref: `${quote.quote_ref}-HW`,
          category: 'HARDWARE_SALE',
          amount_inr: quote.hardwareSubtotalInr,
          payment_mode: params.paymentMode,
          customer_name: `${quote.buyerName} (${quote.city})`,
          quote_id: quote.quote_id,
          home_id: homeId,
          invoice_ref: quote.quote_ref,
          notes: quote.items.map((i) => `${i.qty}x ${i.module_code}`).join(', '),
          module_breakdown: quote.items.map((i) => ({
            module_code: i.module_code,
            qty: i.qty,
            revenue_inr: i.unitRetailInr * i.qty,
            bom_inr: i.unitBomInr * i.qty,
          })),
          dateIso: todayIso,
        },
        actor
      );
    }

    // 2. Record Installation Fee + DFY 3D + Subscription if non-zero
    if (quote.installationTotalInr > 0) {
      await recordTransaction(
        {
          tx_ref: `${quote.quote_ref}-INST`,
          category: 'INSTALLATION_FEE',
          amount_inr: quote.installationTotalInr,
          payment_mode: params.paymentMode,
          customer_name: quote.buyerName,
          quote_id: quote.quote_id,
          home_id: homeId,
          notes: `Local on-site installation (${quote.homeType})`,
          dateIso: todayIso,
        },
        actor
      );
    }
    if (quote.includeDfy3d && quote.dfy3dTotalInr > 0) {
      await recordTransaction(
        {
          tx_ref: `${quote.quote_ref}-3D`,
          category: 'DFY_3D_TWIN',
          amount_inr: quote.dfy3dTotalInr,
          payment_mode: params.paymentMode,
          customer_name: quote.buyerName,
          quote_id: quote.quote_id,
          home_id: homeId,
          notes: 'Done-For-You 3D Home Twin add-on',
          dateIso: todayIso,
        },
        actor
      );
    }
    if (quote.subscriptionTotalInr > 0) {
      await recordTransaction(
        {
          tx_ref: `${quote.quote_ref}-SUB`,
          category: 'SUBSCRIPTION_RENEWAL',
          amount_inr: quote.subscriptionTotalInr,
          payment_mode: params.paymentMode,
          customer_name: quote.buyerName,
          quote_id: quote.quote_id,
          home_id: homeId,
          notes: `${TIER_CATALOG[quote.subscriptionTier].displayName} Annual Plan`,
          dateIso: todayIso,
        },
        actor
      );
    }

    // 3. Automatically record Hardware BOM COGS Expense
    const totalBomInr = quote.items.reduce((sum, i) => sum + i.unitBomInr * i.qty, 0);
    if (totalBomInr > 0) {
      await recordExpense(
        {
          category: 'HARDWARE_BOM',
          amount_inr: totalBomInr,
          vendor: 'DD oodle BOM Inventory Issue',
          description: `Hardware COGS for ${quote.quote_ref} (${quote.items.map((i) => `${i.qty}x ${i.module_code}`).join(', ')})`,
          payment_mode: 'Bank',
          invoice_ref: `COGS-${quote.quote_ref}`,
          dateIso: todayIso,
        },
        actor
      );
    }

    // 4. Activate / upsert Customer Subscription record
    const nextSubs: ManagedSubscriptionRecord[] = [
      {
        homeId,
        customer: `${quote.buyerName} (${quote.homeType})`,
        phone: quote.buyerPhone,
        tier: quote.subscriptionTier,
        status: 'active',
        trialStatus: quote.subscriptionTier === 'core' ? 'Core Free Forever' : 'Annual Active',
        simRenewal: quote.items.some((i) => i.module_code === 'VEH-01')
          ? 'Yr-1 M2M Included'
          : 'N/A',
        paymentMode: params.paymentMode,
        upiStatus: quote.subscriptionTier === 'core' ? 'CORE FLOOR' : 'PAID',
        dfy3dPurchased: quote.includeDfy3d,
      },
      ...subscriptions.filter((s) => s.homeId !== homeId),
    ];
    writeLs(LS_KEYS.SUBS, nextSubs);

    // 5. Dispatch Prefilled Installer Job (authorizes 3D builder if quote included DFY 3D)
    const job = await dispatchInstallerJob(
      {
        home_id: homeId,
        home_name: `${quote.buyerName} · ${quote.city}`,
        customer_name: quote.buyerName,
        customer_phone: quote.buyerPhone,
        address: `${quote.city} (${quote.homeType})`,
        installer_uid: params.installerUid,
        installer_name: params.installerName,
        type: 'INITIAL_SETUP_LINKING',
        allow_3d_setup: quote.includeDfy3d,
        expiryHours: 72,
        notes: `From Quote ${quote.quote_ref}: Install ${quote.items
          .map((i) => `${i.qty}x ${i.module_code}`)
          .join(', ')}`,
      },
      actor
    );

    // 6. Mark quote CONVERTED & audit
    const updatedQuotes = quotes.map((q) =>
      q.quote_id === quote.quote_id
        ? {
            ...q,
            status: 'CONVERTED' as const,
            homeId,
            assignedInstallerUid: params.installerUid,
            updatedAtMs: Date.now(),
          }
        : q
    );
    writeStoredQuotes(updatedQuotes);

    await appendAuditLog({
      actor_uid: actor.uid,
      actor_email: actor.email,
      action_category: 'QUOTE_CONVERT',
      action: 'CONVERT_QUOTE_TO_ORDER_AND_JOB',
      target_collection: 'quotes',
      target_id: quote.quote_id,
      summary: `Converted ${quote.quote_ref} (₹${quote.grandTotalInr.toLocaleString('en-IN')}) -> TX + COGS (₹${totalBomInr.toLocaleString('en-IN')}) + Installer Job ${job.job_id}`,
    });

    return { homeId, job };
  };

  /**
   * Subscription Lifecycle Control (Hard Anti-Bricking Lock on Deactivate -> Core Free Forever)
   */
  const updateSubscriptionPlan = async (
    homeId: string,
    patch: {
      tier: SubscriptionTier;
      status: SubscriptionStatus;
      trialStatus: string;
      paymentMode: PaymentMode;
      upiStatus: ManagedSubscriptionRecord['upiStatus'];
      dfy3dPurchased?: boolean;
      logRenewalInr?: number;
      simRenewal?: string;
    },
    actor: { uid: string; email: string }
  ) => {
    const target = subscriptions.find((s) => s.homeId === homeId);
    const next = subscriptions.map((s) =>
      s.homeId === homeId
        ? {
            ...s,
            tier: patch.tier,
            status: patch.status,
            trialStatus: patch.trialStatus,
            paymentMode: patch.paymentMode,
            upiStatus: patch.upiStatus,
            dfy3dPurchased: patch.dfy3dPurchased ?? s.dfy3dPurchased,
            simRenewal: patch.simRenewal ?? s.simRenewal,
          }
        : s
    );
    writeLs(LS_KEYS.SUBS, next);

    if (patch.logRenewalInr && patch.logRenewalInr > 0) {
      await recordTransaction(
        {
          tx_ref: `SUB-${homeId.slice(-4).toUpperCase()}-${Date.now().toString().slice(-4)}`,
          category: 'SUBSCRIPTION_RENEWAL',
          amount_inr: patch.logRenewalInr,
          payment_mode: patch.paymentMode,
          customer_name: target?.customer || homeId,
          home_id: homeId,
          notes: `Subscription updated to ${TIER_CATALOG[patch.tier].displayName} (${patch.status})`,
          dateIso: new Date().toISOString().slice(0, 10),
        },
        actor
      );
    }

    await appendAuditLog({
      actor_uid: actor.uid,
      actor_email: actor.email,
      action_category: 'SUBSCRIPTION',
      action:
        patch.tier === 'core' ? 'DOWNGRADE_TO_CORE_FLOOR' : 'UPDATE_SUBSCRIPTION',
      target_collection: 'homes',
      target_id: homeId,
      summary: `Subscription for ${homeId} set to ${patch.tier.toUpperCase()} (${patch.status}); Core Free Forever & safety cutoffs remain guaranteed.`,
    });
  };

  const setUserAccountRoleOrStatus = async (
    uid: string,
    patch: { role?: SessionRole; status?: 'ACTIVE' | 'SUSPENDED' },
    actor: { uid: string; email: string }
  ) => {
    const target = accounts.find((a) => a.uid === uid);
    const next = accounts.map((a) => (a.uid === uid ? { ...a, ...patch } : a));
    writeLs(LS_KEYS.ACCOUNTS, next);

    await appendAuditLog({
      actor_uid: actor.uid,
      actor_email: actor.email,
      action_category: 'ACCOUNT',
      action: 'UPDATE_USER_ACCOUNT',
      target_collection: 'users',
      target_id: uid,
      summary: `Updated ${target?.name || uid}: role=${patch.role ?? target?.role}, status=${patch.status ?? target?.status}`,
    });
  };

  const setDeviceActivationState = async (
    entry: Omit<ManagedDeviceActivation, 'updatedAtMs'>,
    actor: { uid: string; email: string }
  ) => {
    const full: ManagedDeviceActivation = { ...entry, updatedAtMs: Date.now() };
    const next = { ...deviceStates, [entry.device_id]: full };
    writeLs(LS_KEYS.DEV_STATES, next);

    await appendAuditLog({
      actor_uid: actor.uid,
      actor_email: actor.email,
      action_category: 'DEVICE_STATE',
      action: `DEVICE_${entry.activation}`,
      target_collection: 'devices',
      target_id: entry.device_id,
      summary: `${entry.device_id} (${entry.module_code}) marked ${entry.activation}: ${entry.reason}`,
    });
  };

  return {
    quotes,
    jobs,
    transactions,
    expenses,
    auditLogs,
    accounts,
    subscriptions,
    deviceStates,
    setQuoteStatus,
    dispatchInstallerJob,
    revokeInstallerJob,
    convertQuoteToOrderAndJob,
    updateSubscriptionPlan,
    setUserAccountRoleOrStatus,
    setDeviceActivationState,
    recordTx: recordTransaction,
    recordExp: recordExpense,
  };
}
