/**
 * DD oodle Smart Home — Phase 13B Canonical All-Module Sample Dataset
 *
 * Single canonical source of truth for:
 *  - Homes: "Lamka Smart Residence" (Churachandpur/Imphal) + "Imphal Duplex" (secondary pilot home)
 *  - All 6 Phase 1 Flagship Modules (`PWR-01`, `PWR-02`, `PWR-03`, `WAT-01`, `VEH-01`, `HUB-01`)
 *  - Representative Phase 2 & 3 Module Archetypes (`PWR-04`, `ENV-01`, `SAF-01`, `SEC-01`, `SEC-04`, `HLT-01`)
 *    proving 42-module capability-driven scalability across every capability type
 *  - 42 catalog_modules synced with HARDWARE_REGISTRY BOMs & launch MRPs
 *  - store_config (WhatsApp number, subscription tiers, ₹999 DFY 3D Twin)
 *  - users (Customer Owner, Family Member, Field Installer, Master Admin)
 *  - quotes, installer_jobs (1 active linking + DFY 3D, 1 follow-up 3D service, 1 completed)
 *  - incidents, amc_tickets, transactions, expenses, subscriptions, device_activations, admin_audit_logs
 */

import rawFixtures from '../../contract/contract_v1.4_fixtures.json';
import {
  HARDWARE_REGISTRY,
  type HardwareModuleSpec,
  type ModuleAvailability,
} from '../catalog/hardwareRegistry';
import type {
  AlertPayload,
  ModuleCode,
  PowerTelemetryPayload,
  SubscriptionTier,
  VehicleGeofence,
  VehicleTelemetryPayload,
  WaterTelemetryPayload,
} from '../protocol/contract';
import type { VirtualDeviceInstance } from '../simulator/types';
import type { HomeSummary } from '@/components/workspace/WorkspaceProvider';
import type { SessionRole } from '../auth/session';

export interface CatalogModuleOverride {
  module_code: string;
  retailInr: number;
  installInr: number;
  bomInr: number;
  availability: ModuleAvailability;
  updatedAtMs: number;
}

export interface StoreConfigDoc {
  whatsappSalesNumber: string;
  dfy3dPriceInr: number;
  plusTrialDays: number;
  globalDiscountPct: number;
  gstPercent: number;
  pricesIncludeGst: boolean;
  tierPrices: Record<SubscriptionTier, number>;
  updatedAtMs: number;
}

export type QuoteHomeType = '1BHK' | '2BHK' | '3BHK' | 'Duplex' | 'Commercial';
export type QuoteStatus = 'NEW' | 'CONTACTED' | 'APPROVED' | 'CONVERTED' | 'ARCHIVED';

export interface QuoteLineItem {
  module_code: string;
  name: string;
  qty: number;
  unitRetailInr: number;
  unitInstallInr: number;
  unitBomInr: number;
}

export interface QuoteRecord {
  quote_id: string;
  quote_ref: string;
  buyerName: string;
  buyerPhone: string;
  city: string;
  homeType: QuoteHomeType;
  notes: string;
  includeInstallation: boolean;
  includeDfy3d: boolean;
  subscriptionTier: SubscriptionTier;
  items: QuoteLineItem[];
  hardwareSubtotalInr: number;
  installationTotalInr: number;
  dfy3dTotalInr: number;
  subscriptionTotalInr: number;
  grandTotalInr: number;
  status: QuoteStatus;
  homeId?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type InstallerJobType = 'INITIAL_SETUP_LINKING' | 'FOLLOWUP_3D_SERVICE' | 'AMC_SWAP';
export type InstallerJobStatus = 'ACTIVE' | 'COMPLETED' | 'REVOKED' | 'EXPIRED';

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
  notes: string;
  linked_device_ids: string[];
  createdAtMs: number;
  expiresAtMs: number;
  completedAtMs?: number;
}

export type PaymentMode = 'UPI' | 'Bank' | 'Card' | 'Cash';

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

export type AuditActionCategory =
  | 'PRICING'
  | 'SUBSCRIPTION'
  | 'DEVICE_STATE'
  | 'ACCOUNT'
  | 'INSTALLER_AUTH'
  | 'QUOTE_CONVERT'
  | 'FINANCE';

export interface TransactionModuleBreakdownItem {
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
  home_id?: string;
  quote_id?: string;
  notes: string;
  dateIso: string;
  createdAtMs: number;
  module_breakdown?: TransactionModuleBreakdownItem[];
}

export interface ExpenseRecord {
  exp_id: string;
  category: ExpenseCategory;
  amount_inr: number;
  vendor: string;
  description: string;
  payment_mode: PaymentMode;
  invoice_ref?: string;
  dateIso: string;
  createdAtMs: number;
}

export interface ManagedSubscriptionRecord {
  homeId: string;
  customer: string;
  phone: string;
  tier: SubscriptionTier;
  status: 'active' | 'trial' | 'past_due' | 'cancelled';
  trialStatus: string;
  simRenewal: string;
  upiStatus: 'PAID' | 'DUE D-7' | 'CORE FLOOR';
  paymentMode: PaymentMode;
  dfy3dPurchased: boolean;
}

export interface ManagedDeviceActivation {
  device_id: string;
  home_id: string;
  module_code: string;
  name: string;
  activation: 'ACTIVE' | 'QUARANTINED' | 'UNCLAIMED';
  reason: string;
  updatedAtMs: number;
}

export interface UserAccountRecord {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: SessionRole;
  status: 'ACTIVE' | 'SUSPENDED';
  homeId?: string;
}

export interface AuditLogEntry {
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

export interface IncidentRecord {
  id: string;
  createdAt: string;
  homeId: string;
  deviceId: string;
  moduleCode: string;
  alertType: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  summary: string;
  assignedTo: string;
}

export interface AmcTicketRecord {
  ticket_id: string;
  customer: string;
  tier: SubscriptionTier;
  device: string;
  issue: string;
  sla24h: boolean;
  status: 'OPEN' | 'SCHEDULED' | 'RESOLVED';
}

export interface CanonicalVehicleTrip {
  trip_id: string;
  label: string;
  date: string;
  distanceKm: number;
  durationMin: number;
  maxSpeedKmh: number;
  waypoints: Array<{ label: string; lat: number; lng: number }>;
}

export interface CanonicalLockAccessLog {
  id: string;
  device_id: string;
  actor: string;
  method: 'PIN' | 'NFC_CARD' | 'PWA_BLE' | 'FINGERPRINT';
  action: 'UNLOCKED' | 'LOCKED';
  ts: string;
}

export interface ErpSnapshot {
  transactions: TransactionRecord[];
  expenses: ExpenseRecord[];
  subscriptions: ManagedSubscriptionRecord[];
  deviceStates: Record<string, ManagedDeviceActivation>;
  accounts: UserAccountRecord[];
  auditLogs: AuditLogEntry[];
  incidents: IncidentRecord[];
  amcTickets: AmcTicketRecord[];
}

export interface UnifiedWorkspaceState {
  version: string;
  seededAt: number;
  homes: HomeSummary[];
  users: UserAccountRecord[];
  devices: Record<string, VirtualDeviceInstance>;
  catalogOverrides: Record<string, CatalogModuleOverride>;
  storeConfig: StoreConfigDoc;
  quotes: QuoteRecord[];
  installerJobs: InstallerJobRecord[];
  erp: ErpSnapshot;
  vehicleTrips: CanonicalVehicleTrip[];
  vehicleGeofences: VehicleGeofence[];
  lockAccessLogs: CanonicalLockAccessLog[];
}

export const CANONICAL_HOMES: HomeSummary[] = [
  {
    id: 'home_imphal_001',
    name: 'Lamka Smart Residence',
    location: 'Churachandpur / Imphal · Manipur',
    hubStatus: 'online',
  },
  {
    id: 'home_guwahati_002',
    name: 'Imphal Duplex',
    location: 'Lamphelpat, Imphal · Pilot Home',
    hubStatus: 'local',
  },
];

export const CANONICAL_USERS: UserAccountRecord[] = [
  {
    uid: 'demo_owner_01',
    name: 'Thanglian Zou (Owner · Lamka Smart Residence)',
    email: 'owner@ddoodle.in',
    phone: '+919862011114',
    role: 'customer',
    status: 'ACTIVE',
    homeId: 'home_imphal_001',
  },
  {
    uid: 'demo_family_01',
    name: 'Kimneih Zou (Family Member · Lamka Smart Residence)',
    email: 'family@ddoodle.in',
    phone: '+919862022282',
    role: 'family_member',
    status: 'ACTIVE',
    homeId: 'home_imphal_001',
  },
  {
    uid: 'uid_installer_manipur_01',
    name: 'R.K. Sanatomba (Field Tech · Churachandpur & Imphal)',
    email: 'installer@ddoodle.in',
    phone: '+917005588910',
    role: 'installer',
    status: 'ACTIVE',
    homeId: 'home_imphal_001',
  },
  {
    uid: 'demo_installer_01',
    name: 'Bikramjit Singh (Field Installer · Imphal West)',
    email: 'bikramjit.field@ddoodle.in',
    phone: '+919862044551',
    role: 'installer',
    status: 'ACTIVE',
    homeId: 'home_guwahati_002',
  },
  {
    uid: 'demo_admin_01',
    name: 'DD oodle Master Admin (NE HQ)',
    email: 'admin@ddoodle.in',
    phone: '+919862099000',
    role: 'admin',
    status: 'ACTIVE',
    homeId: 'home_imphal_001',
  },
];

export const CANONICAL_STORE_CONFIG: StoreConfigDoc = {
  whatsappSalesNumber: '919862011114',
  dfy3dPriceInr: 999,
  plusTrialDays: 90,
  globalDiscountPct: 0,
  gstPercent: 18,
  pricesIncludeGst: true,
  tierPrices: {
    core: 0,
    plus: 1499,
    drive: 1499,
    shield: 2499,
    all_in_family: 3499,
  },
  updatedAtMs: 1763805600000,
};

export function buildCanonicalCatalogOverrides(): Record<string, CatalogModuleOverride> {
  const map: Record<string, CatalogModuleOverride> = {};
  for (const mod of HARDWARE_REGISTRY) {
    map[mod.module_code] = {
      module_code: mod.module_code,
      retailInr: mod.retailInr,
      installInr: mod.installInr,
      bomInr: mod.bomInr,
      availability: mod.defaultAvailability,
      updatedAtMs: 1763805600000,
    };
  }
  return map;
}

export const CANONICAL_VEHICLE_TRIPS: CanonicalVehicleTrip[] = [
  {
    trip_id: 'trip_lamka_imphal_01',
    label: 'Lamka Smart Residence → Imphal Tulihal Airport',
    date: 'Today · 09:15 IST',
    distanceKm: 58.4,
    durationMin: 92,
    maxSpeedKmh: 62,
    waypoints: [
      { label: 'Start · Lamka Smart Residence (Churachandpur)', lat: 24.333, lng: 93.683 },
      { label: 'Mid · Moirang Bazar (NH-2)', lat: 24.4994, lng: 93.7764 },
      { label: 'Mid · Bishnupur Junction', lat: 24.6285, lng: 93.7605 },
      { label: 'End · Tulihal Airport, Imphal', lat: 24.7601, lng: 93.8967 },
    ],
  },
  {
    trip_id: 'trip_imphal_city_02',
    label: 'Imphal Duplex (Lamphelpat) → Kangla Fort Corridor',
    date: 'Yesterday · 18:40 IST',
    distanceKm: 6.4,
    durationMin: 18,
    maxSpeedKmh: 48,
    waypoints: [
      { label: 'Start · Lamphelpat Duplex', lat: 24.817, lng: 93.9368 },
      { label: 'Mid · Thangal Bazar', lat: 24.8112, lng: 93.9395 },
      { label: 'End · Kangla Western Gate', lat: 24.8074, lng: 93.9442 },
    ],
  },
];

export const CANONICAL_VEHICLE_GEOFENCES: VehicleGeofence[] = [
  {
    id: 'geo_lamka_home',
    name: 'Lamka Smart Residence (Churachandpur / Imphal)',
    enabled: true,
    lat: 24.333,
    lng: 93.683,
    radius_m: 350,
    trigger: 'both',
    cross_category_action: 'inverter_saver',
  },
  {
    id: 'geo_imphal_duplex',
    name: 'Imphal Duplex (Lamphelpat)',
    enabled: true,
    lat: 24.817,
    lng: 93.9368,
    radius_m: 400,
    trigger: 'both',
    cross_category_action: 'porch_lights',
  },
  {
    id: 'geo_imphal_airport',
    name: 'Imphal Tulihal Airport Corridor',
    enabled: true,
    lat: 24.7601,
    lng: 93.8967,
    radius_m: 600,
    trigger: 'on_enter',
    cross_category_action: 'none',
  },
];

export const CANONICAL_LOCK_ACCESS_LOGS: CanonicalLockAccessLog[] = [
  {
    id: 'LOCK-LOG-01',
    device_id: 'dd_sec01_p2l1',
    actor: 'Thanglian Zou (Owner)',
    method: 'FINGERPRINT',
    action: 'UNLOCKED',
    ts: 'Today · 08:42 IST',
  },
  {
    id: 'LOCK-LOG-02',
    device_id: 'dd_sec01_p2l1',
    actor: 'Auto Relock Guardrail',
    method: 'PIN',
    action: 'LOCKED',
    ts: 'Today · 08:43 IST',
  },
  {
    id: 'LOCK-LOG-03',
    device_id: 'dd_sec01_p2l1',
    actor: 'Kimneih Zou (Family Member)',
    method: 'NFC_CARD',
    action: 'UNLOCKED',
    ts: 'Yesterday · 19:15 IST',
  },
];

interface RawFixtureModule {
  device_id: string;
  room_id: string;
  name: string;
  local_pin: string;
  status: 'online' | 'offline';
  info: VirtualDeviceInstance['info'];
  state: VirtualDeviceInstance['state'];
  telemetry: VirtualDeviceInstance['telemetry'];
  config: VirtualDeviceInstance['config'];
  rules: VirtualDeviceInstance['rules'];
  ota: VirtualDeviceInstance['ota'];
  alert?: AlertPayload;
}

/**
 * Builds the 12 canonical live devices covering:
 * - All 6 Phase 1 flagship modules (hydrated strictly from contract_v1.4_fixtures.json)
 * - Representative Phase 2 & 3 module archetypes (`PWR-04`, `ENV-01`, `SAF-01`, `SEC-01`, `SEC-04`, `HLT-01`)
 */
export function buildCanonicalDevices(): Record<string, VirtualDeviceInstance> {
  const out: Record<string, VirtualDeviceInstance> = {};
  const modulesMap = (rawFixtures as unknown as { modules: Record<string, RawFixtureModule> }).modules;

  const phase1Names: Record<string, { name: string; room_id: string }> = {
    'PWR-01': { name: 'Living Room 4-Gang Switchboard', room_id: 'room_living' },
    'PWR-02': { name: 'Master Bedroom Hum-Free Fan Regulator', room_id: 'room_bedroom' },
    'PWR-03': { name: 'Master Bath 16A Geyser Switch', room_id: 'room_bath' },
    'WAT-01': { name: 'Terrace Auto Water Tank & Pump', room_id: 'room_terrace' },
    'VEH-01': { name: 'Family SUV 4G GPS & Crash Guard', room_id: 'room_garage' },
    'HUB-01': { name: 'Hallway Local Home Hub', room_id: 'room_living' },
  };

  for (const mod of Object.values(modulesMap)) {
    const meta = phase1Names[mod.info.module_code] ?? { name: mod.name, room_id: mod.room_id };
    out[mod.device_id] = {
      device_id: mod.device_id,
      module_code: mod.info.module_code,
      room_id: meta.room_id,
      name: meta.name,
      local_pin: mod.local_pin,
      status: mod.status,
      info: structuredClone(mod.info),
      state: structuredClone(mod.state),
      telemetry: structuredClone(mod.telemetry),
      config: structuredClone(mod.config),
      rules: structuredClone(mod.rules),
      ota: structuredClone(mod.ota),
      last_alert: mod.alert ? structuredClone(mod.alert) : null,
    };
  }

  const nowSec = 1763805600;
  const defaultOta: VirtualDeviceInstance['ota'] = {
    url: 'https://storage.googleapis.com/ddoodle-ota/v1.4.0/esp32s3.bin',
    fw_version: '1.4.0',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    size: 884736,
    sig: 'secure-boot-v2',
  };

  // 7. PWR-04 (Phase 2 Archetype) — Dining Dimmer (ranged level 0-100)
  out['dd_pwr04_p2d1'] = {
    device_id: 'dd_pwr04_p2d1',
    module_code: 'PWR-04',
    room_id: 'room_living',
    name: 'Dining Warm Chandelier Dimmer',
    local_pin: '48291034',
    status: 'online',
    info: {
      schema: 'v1.4',
      device_id: 'dd_pwr04_p2d1',
      module_code: 'PWR-04',
      fw_version: '1.4.0',
      hw_rev: '2.0',
      operation_mode: 'CLOUD_DIRECT',
      capabilities: [
        { type: 'switch', key: 'ch1', label: 'Dining Chandelier Power' },
        {
          type: 'level',
          key: 'dimmer_pct',
          label: 'Warm Dimming Level',
          min: 0,
          max: 100,
          step: 1,
          unit: '%',
        },
        { type: 'sensor', key: 'p', label: 'Active Load', unit: 'W' },
        { type: 'sensor', key: 'v', label: 'Grid Voltage', unit: 'V' },
      ],
    },
    state: {
      ts: nowSec,
      operation_mode: 'CLOUD_DIRECT',
      rssi: -54,
      ack: 'req-pwr04-init',
      manual_override: false,
      fault: null,
      state: {
        ch1: true,
        dimmer_pct: 68,
      },
    },
    telemetry: {
      ts: nowSec,
      v: 231.2,
      i: 0.42,
      p: 94.0,
      pf: 0.97,
      kwh: 4.82,
    } as PowerTelemetryPayload,
    config: {
      schema: 'v1.4',
      operation_mode: 'CLOUD_DIRECT',
      power_restore: 'RESTORE_LAST',
      guardrails: {
        hard_locked: true,
        overpower_w: 600,
      },
    },
    rules: {
      schema: 'v1.4',
      rules: [
        {
          id: 'r_dinner_warm',
          enabled: true,
          type: 'schedule',
          cron: '0 19 * * *',
          action: { ch1: true, dimmer_pct: 65 },
        },
      ],
    },
    ota: structuredClone(defaultOta),
    last_alert: null,
  };

  // 8. ENV-01 (Phase 2 Archetype) — Bedroom Climate Node (G12 read-only sensor: temp, humidity, battery)
  out['dd_env01_p2c1'] = {
    device_id: 'dd_env01_p2c1',
    module_code: 'ENV-01',
    room_id: 'room_bedroom',
    name: 'Bedroom Climate & Dewpoint Node',
    local_pin: '51920411',
    status: 'online',
    info: {
      schema: 'v1.4',
      device_id: 'dd_env01_p2c1',
      module_code: 'ENV-01',
      fw_version: '1.4.0',
      hw_rev: '2.0',
      operation_mode: 'CLOUD_DIRECT',
      capabilities: [
        { type: 'sensor', key: 'temperature_c', label: 'Room Temperature', unit: '°C' },
        { type: 'sensor', key: 'humidity_pct', label: 'Relative Humidity', unit: '%' },
        { type: 'sensor', key: 'battery_pct', label: 'CR2450 Coin Cell', unit: '%' },
      ],
    },
    state: {
      ts: nowSec,
      operation_mode: 'CLOUD_DIRECT',
      rssi: -58,
      ack: null,
      manual_override: false,
      fault: null,
      state: {},
    },
    telemetry: {
      ts: nowSec,
      temperature_c: 22.8,
      humidity_pct: 64,
      battery_pct: 94,
    },
    config: {
      schema: 'v1.4',
      operation_mode: 'CLOUD_DIRECT',
      power_restore: 'RESTORE_LAST',
      guardrails: {
        hard_locked: true,
      },
    },
    rules: {
      schema: 'v1.4',
      rules: [],
    },
    ota: structuredClone(defaultOta),
    last_alert: null,
  };

  // 9. SAF-01 (Phase 2 Archetype) — Kitchen LPG & Smoke Guard (G12 read-only gas_ppm, co_ppm + safety alert rules)
  out['dd_saf01_p2s1'] = {
    device_id: 'dd_saf01_p2s1',
    module_code: 'SAF-01',
    room_id: 'room_kitchen',
    name: 'Kitchen LPG & Smoke Guard',
    local_pin: '60481299',
    status: 'online',
    info: {
      schema: 'v1.4',
      device_id: 'dd_saf01_p2s1',
      module_code: 'SAF-01',
      fw_version: '1.4.0',
      hw_rev: '2.0',
      operation_mode: 'CLOUD_DIRECT',
      capabilities: [
        { type: 'sensor', key: 'gas_ppm', label: 'LPG Concentration', unit: 'ppm' },
        { type: 'sensor', key: 'co_ppm', label: 'Carbon Monoxide (CO)', unit: 'ppm' },
      ],
    },
    state: {
      ts: nowSec,
      operation_mode: 'CLOUD_DIRECT',
      rssi: -51,
      ack: null,
      manual_override: false,
      fault: null,
      state: {},
    },
    telemetry: {
      ts: nowSec,
      gas_ppm: 115,
      co_ppm: 6,
    },
    config: {
      schema: 'v1.4',
      operation_mode: 'CLOUD_DIRECT',
      power_restore: 'ON',
      guardrails: {
        hard_locked: true,
      },
    },
    rules: {
      schema: 'v1.4',
      rules: [
        {
          id: 'r_lpg_self_test',
          enabled: true,
          type: 'schedule',
          cron: '0 9 * * 0',
          action: { self_test: true },
        },
      ],
    },
    ota: structuredClone(defaultOta),
    last_alert: null,
  };

  // 10. SEC-01 (Phase 2 Archetype) — Main Entry Smart Lock (lock_state + access logs)
  out['dd_sec01_p2l1'] = {
    device_id: 'dd_sec01_p2l1',
    module_code: 'SEC-01',
    room_id: 'room_entry',
    name: 'Main Entry Smart Deadbolt Lock',
    local_pin: '73918544',
    status: 'online',
    info: {
      schema: 'v1.4',
      device_id: 'dd_sec01_p2l1',
      module_code: 'SEC-01',
      fw_version: '1.4.0',
      hw_rev: '2.0',
      operation_mode: 'CLOUD_DIRECT',
      capabilities: [
        { type: 'lock_state', key: 'lock_state', label: 'Main Deadbolt Latch' },
        { type: 'sensor', key: 'battery_pct', label: 'AA Alkaline Pack', unit: '%' },
      ],
    },
    state: {
      ts: nowSec,
      operation_mode: 'CLOUD_DIRECT',
      rssi: -49,
      ack: 'req-sec01-lock',
      manual_override: false,
      fault: null,
      state: {
        lock_state: 'LOCKED',
      },
    },
    telemetry: {
      ts: nowSec,
      battery_pct: 88,
    },
    config: {
      schema: 'v1.4',
      operation_mode: 'CLOUD_DIRECT',
      power_restore: 'RESTORE_LAST',
      guardrails: {
        hard_locked: true,
      },
    },
    rules: {
      schema: 'v1.4',
      rules: [
        {
          id: 'r_night_lockdown',
          enabled: true,
          type: 'schedule',
          cron: '30 22 * * *',
          action: { lock_state: 'LOCKED' },
        },
      ],
    },
    ota: structuredClone(defaultOta),
    last_alert: null,
  };

  // 11. SEC-04 (Phase 2 Archetype) — Gate Video Doorbell (video_stream preview state)
  out['dd_sec04_p2v1'] = {
    device_id: 'dd_sec04_p2v1',
    module_code: 'SEC-04',
    room_id: 'room_entry',
    name: 'Gate Video Doorbell & Chime',
    local_pin: '84210977',
    status: 'online',
    info: {
      schema: 'v1.4',
      device_id: 'dd_sec04_p2v1',
      module_code: 'SEC-04',
      fw_version: '1.4.0',
      hw_rev: '2.0',
      operation_mode: 'CLOUD_DIRECT',
      capabilities: [
        { type: 'video_stream', key: 'gate_cam', label: 'Compound Gate 1080p RTSP/WebRTC' },
        { type: 'switch', key: 'ch1', label: 'Night IR Floodlight & Chime Relay' },
      ],
    },
    state: {
      ts: nowSec,
      operation_mode: 'CLOUD_DIRECT',
      rssi: -61,
      ack: 'req-sec04-ir',
      manual_override: false,
      fault: null,
      state: {
        ch1: true,
      },
    },
    telemetry: {
      ts: nowSec,
      v: 12.1,
      i: 0.28,
      p: 3.4,
      pf: 0.98,
      kwh: 0.91,
    } as PowerTelemetryPayload,
    config: {
      schema: 'v1.4',
      operation_mode: 'CLOUD_DIRECT',
      power_restore: 'ON',
      guardrails: {
        hard_locked: true,
      },
    },
    rules: {
      schema: 'v1.4',
      rules: [],
    },
    ota: structuredClone(defaultOta),
    last_alert: null,
  };

  // 12. HLT-01 (Phase 3 Archetype) — Elder Room Wellness Radar (heart_rate, resp_rate, fall_alert + non-medical disclaimer)
  out['dd_hlt01_p3w1'] = {
    device_id: 'dd_hlt01_p3w1',
    module_code: 'HLT-01',
    room_id: 'room_elder',
    name: 'Elder Room 60GHz Wellness & Fall Radar',
    local_pin: '95103488',
    status: 'online',
    info: {
      schema: 'v1.4',
      device_id: 'dd_hlt01_p3w1',
      module_code: 'HLT-01',
      fw_version: '1.4.0',
      hw_rev: '3.0',
      operation_mode: 'CLOUD_DIRECT',
      capabilities: [
        {
          type: 'vitals',
          key: 'vitals_mmwave',
          label: 'Contactless Bedside Vitals (60GHz)',
          non_medical_disclaimer: true,
        },
        { type: 'sensor', key: 'heart_rate', label: 'Resting Heart Rate', unit: 'bpm' },
        { type: 'sensor', key: 'resp_rate', label: 'Respiration Cadence', unit: 'br/m' },
        {
          type: 'fall_alert',
          key: 'fall_alert',
          label: 'Posture & Fall Detection Radar',
          non_medical_disclaimer: true,
        },
      ],
    },
    state: {
      ts: nowSec,
      operation_mode: 'CLOUD_DIRECT',
      rssi: -53,
      ack: null,
      manual_override: false,
      fault: null,
      state: {
        fall_alert: 'CLEAR',
      },
    },
    telemetry: {
      ts: nowSec,
      heart_rate: 72,
      resp_rate: 16,
    },
    config: {
      schema: 'v1.4',
      operation_mode: 'CLOUD_DIRECT',
      power_restore: 'ON',
      guardrails: {
        hard_locked: true,
      },
    },
    rules: {
      schema: 'v1.4',
      rules: [],
    },
    ota: structuredClone(defaultOta),
    last_alert: null,
  };

  return out;
}

export const CANONICAL_QUOTES: QuoteRecord[] = [
  {
    quote_id: 'qt_20261125_941',
    quote_ref: 'DD-20261125-941',
    buyerName: 'Thanglian Zou',
    buyerPhone: '+919862011114',
    city: 'Churachandpur / Imphal, Manipur',
    homeType: '3BHK',
    notes: 'Full Phase 1 6-module installation + Dining Dimmer + Kitchen LPG Guard + ₹999 DFY 3D Home Twin (Lamka Smart Residence)',
    includeInstallation: true,
    includeDfy3d: true,
    subscriptionTier: 'all_in_family',
    items: [
      { module_code: 'PWR-01', name: '4-Channel Smart Switchboard + 1 Fan Node', qty: 2, unitRetailInr: 2299, unitInstallInr: 350, unitBomInr: 675 },
      { module_code: 'PWR-02', name: 'Hum-Free Capacitive 4-Step Fan Regulator', qty: 2, unitRetailInr: 1699, unitInstallInr: 250, unitBomInr: 475 },
      { module_code: 'PWR-03', name: '16A Heavy Load Energy Node (Geyser / AC)', qty: 1, unitRetailInr: 1899, unitInstallInr: 300, unitBomInr: 550 },
      { module_code: 'WAT-01', name: 'Smart Water Tank & Pump Automation Kit', qty: 1, unitRetailInr: 4299, unitInstallInr: 600, unitBomInr: 1275 },
      { module_code: 'VEH-01', name: '4G GPS + Crash SOS + Safe Starter Cut', qty: 1, unitRetailInr: 4799, unitInstallInr: 500, unitBomInr: 1650 },
      { module_code: 'HUB-01', name: 'DD oodle Local Home Hub', qty: 1, unitRetailInr: 4499, unitInstallInr: 400, unitBomInr: 1350 },
    ],
    hardwareSubtotalInr: 23492,
    installationTotalInr: 3000,
    dfy3dTotalInr: 999,
    subscriptionTotalInr: 3499,
    grandTotalInr: 30990,
    status: 'CONVERTED',
    homeId: 'home_imphal_001',
    createdAtMs: 1763800000000,
    updatedAtMs: 1763805600000,
  },
  {
    quote_id: 'qt_20261125_884',
    quote_ref: 'DD-20261125-884',
    buyerName: 'Dr. L. Ibobi Singh',
    buyerPhone: '+919862077123',
    city: 'Lamphelpat, Imphal West',
    homeType: 'Duplex',
    notes: 'Imphal Duplex pilot expansion: follow-up ₹999 DFY 3D Architectural Twin modeling & Elder Room HLT-01 calibration',
    includeInstallation: true,
    includeDfy3d: true,
    subscriptionTier: 'plus',
    items: [
      { module_code: 'HUB-01', name: 'DD oodle Local Home Hub', qty: 1, unitRetailInr: 4499, unitInstallInr: 400, unitBomInr: 1350 },
      { module_code: 'PWR-01', name: '4-Channel Smart Switchboard + 1 Fan Node', qty: 3, unitRetailInr: 2299, unitInstallInr: 350, unitBomInr: 675 },
      { module_code: 'HLT-01', name: 'Elder Room 60GHz Wellness & Fall Radar', qty: 1, unitRetailInr: 5499, unitInstallInr: 500, unitBomInr: 1850 },
    ],
    hardwareSubtotalInr: 16895,
    installationTotalInr: 1950,
    dfy3dTotalInr: 999,
    subscriptionTotalInr: 1499,
    grandTotalInr: 21343,
    status: 'APPROVED',
    homeId: 'home_guwahati_002',
    createdAtMs: 1763790000000,
    updatedAtMs: 1763802000000,
  },
  {
    quote_id: 'qt_20261125_912',
    quote_ref: 'DD-20261125-912',
    buyerName: 'Pauzagin Tonsing',
    buyerPhone: '+919862055410',
    city: 'Hiangtam Lamka, Churachandpur',
    homeType: '2BHK',
    notes: 'Looking for WAT-01 auto tank pump controller + 2 switchboards + Kitchen LPG Guard SAF-01.',
    includeInstallation: true,
    includeDfy3d: true,
    subscriptionTier: 'plus',
    items: [
      { module_code: 'PWR-01', name: '4-Channel Smart Switchboard + 1 Fan Node', qty: 2, unitRetailInr: 2299, unitInstallInr: 350, unitBomInr: 675 },
      { module_code: 'WAT-01', name: 'Smart Water Tank & Pump Automation Kit', qty: 1, unitRetailInr: 4299, unitInstallInr: 600, unitBomInr: 1275 },
      { module_code: 'SAF-01', name: 'Kitchen LPG & Smoke Guard', qty: 1, unitRetailInr: 2199, unitInstallInr: 250, unitBomInr: 720 },
    ],
    hardwareSubtotalInr: 11096,
    installationTotalInr: 1550,
    dfy3dTotalInr: 999,
    subscriptionTotalInr: 1499,
    grandTotalInr: 15144,
    status: 'NEW',
    createdAtMs: 1763804000000,
    updatedAtMs: 1763804000000,
  },
];

// 3 Canonical Installer Jobs:
// 1. Active INITIAL_SETUP_LINKING + DFY 3D job (Lamka Smart Residence)
// 2. Active FOLLOWUP_3D_SERVICE job (Imphal Duplex)
// 3. Completed job
const FUTURE_48H_MS = 1800000000000; // Far-future expiry so active jobs remain active in demo

export const CANONICAL_INSTALLER_JOBS: InstallerJobRecord[] = [
  {
    job_id: 'JOB-2026-881',
    home_id: 'home_imphal_001',
    home_name: 'Lamka Smart Residence',
    customer_name: 'Thanglian Zou',
    customer_phone: '+919862011114',
    address: 'Plot 14, Hiangtam Lamka / Airport Corridor, Churachandpur & Imphal',
    installer_uid: 'uid_installer_manipur_01',
    installer_name: 'R.K. Sanatomba (Field Tech · Churachandpur & Imphal)',
    type: 'INITIAL_SETUP_LINKING',
    allow_3d_setup: true,
    status: 'ACTIVE',
    notes: 'Link all 6 Phase 1 modules + Dining Dimmer & Kitchen LPG Guard, verify G10 safety cutoffs, and publish ₹999 DFY 3D Home Twin.',
    linked_device_ids: [
      'dd_hub01_u7v8w9',
      'dd_pwr01_a1b2c3',
      'dd_pwr02_d4e5f6',
      'dd_pwr03_g7h8i9',
      'dd_wat01_j1k2l3',
      'dd_veh01_m4n5p6',
    ],
    createdAtMs: 1763800000000,
    expiresAtMs: FUTURE_48H_MS,
  },
  {
    job_id: 'JOB-2026-882',
    home_id: 'home_guwahati_002',
    home_name: 'Imphal Duplex',
    customer_name: 'Dr. L. Ibobi Singh',
    customer_phone: '+919862077123',
    address: 'House 28, RIMS Road, Lamphelpat, Imphal West',
    installer_uid: 'uid_installer_manipur_01',
    installer_name: 'R.K. Sanatomba (Field Tech · Churachandpur & Imphal)',
    type: 'FOLLOWUP_3D_SERVICE',
    allow_3d_setup: true,
    status: 'ACTIVE',
    notes: 'Post-install ₹999 DFY 3D Architectural Twin floor/wall/roof modeling & Elder Room HLT-01 radar alignment.',
    linked_device_ids: ['dd_hub01_u7v8w9', 'dd_pwr01_a1b2c3', 'dd_hlt01_p3w1'],
    createdAtMs: 1763795000000,
    expiresAtMs: FUTURE_48H_MS,
  },
  {
    job_id: 'JOB-2026-875',
    home_id: 'home_imphal_001',
    home_name: 'Lamka Smart Residence (Core Pre-Wire)',
    customer_name: 'Thanglian Zou',
    customer_phone: '+919862011114',
    address: 'Plot 14, Hiangtam Lamka / Airport Corridor, Churachandpur & Imphal',
    installer_uid: 'uid_installer_manipur_01',
    installer_name: 'R.K. Sanatomba (Field Tech · Churachandpur & Imphal)',
    type: 'INITIAL_SETUP_LINKING',
    allow_3d_setup: true,
    status: 'COMPLETED',
    notes: 'Initial MCB box assessment, Ethernet Cat6 backhaul for HUB-01, and ultrasonic WAT-01 terrace conduit install completed.',
    linked_device_ids: ['dd_hub01_u7v8w9', 'dd_wat01_j1k2l3'],
    createdAtMs: 1763600000000,
    expiresAtMs: 1763772800000,
    completedAtMs: 1763710000000,
  },
];

export const CANONICAL_TRANSACTIONS: TransactionRecord[] = [
  {
    tx_id: 'tx_2026_901',
    tx_ref: 'TX-261125-901',
    category: 'HARDWARE_SALE',
    amount_inr: 23492,
    payment_mode: 'UPI',
    customer_name: 'Thanglian Zou (Lamka Smart Residence)',
    home_id: 'home_imphal_001',
    quote_id: 'DD-20261125-941',
    notes: 'Whole-Home Phase 1 Flagship Kit (PWR-01×2, PWR-02×2, PWR-03, WAT-01, VEH-01, HUB-01)',
    dateIso: '2026-11-25',
    createdAtMs: 1763801000000,
    module_breakdown: [
      { module_code: 'PWR-01', qty: 2, revenue_inr: 4598, bom_inr: 675 },
      { module_code: 'PWR-02', qty: 2, revenue_inr: 3398, bom_inr: 475 },
      { module_code: 'PWR-03', qty: 1, revenue_inr: 1899, bom_inr: 550 },
      { module_code: 'WAT-01', qty: 1, revenue_inr: 4299, bom_inr: 1275 },
      { module_code: 'VEH-01', qty: 1, revenue_inr: 4799, bom_inr: 1650 },
      { module_code: 'HUB-01', qty: 1, revenue_inr: 4499, bom_inr: 1350 },
    ],
  },
  {
    tx_id: 'tx_2026_902',
    tx_ref: 'TX-261125-902',
    category: 'DFY_3D_TWIN',
    amount_inr: 999,
    payment_mode: 'UPI',
    customer_name: 'Thanglian Zou (Lamka Smart Residence)',
    home_id: 'home_imphal_001',
    quote_id: 'DD-20261125-941',
    notes: 'Done-For-You 3D Architectural Home Twin Setup Add-On (JOB-2026-881)',
    dateIso: '2026-11-25',
    createdAtMs: 1763801200000,
  },
  {
    tx_id: 'tx_2026_903',
    tx_ref: 'TX-261125-903',
    category: 'SUBSCRIPTION_RENEWAL',
    amount_inr: 3499,
    payment_mode: 'UPI',
    customer_name: 'Thanglian Zou (Lamka Smart Residence)',
    home_id: 'home_imphal_001',
    notes: 'All-In Family Annual Plan (Pro Logic + 4G eSIM + WhatsApp Alerts + 24h Swap AMC)',
    dateIso: '2026-11-25',
    createdAtMs: 1763801500000,
  },
  {
    tx_id: 'tx_2026_904',
    tx_ref: 'TX-261124-884',
    category: 'HARDWARE_SALE',
    amount_inr: 17894,
    payment_mode: 'Bank',
    customer_name: 'Dr. L. Ibobi Singh (Imphal Duplex)',
    home_id: 'home_guwahati_002',
    quote_id: 'DD-20261125-884',
    notes: 'Imphal Duplex Starter + Elder Wellness Radar (HUB-01, PWR-01×3, HLT-01) + ₹999 DFY 3D Twin',
    dateIso: '2026-11-24',
    createdAtMs: 1763720000000,
    module_breakdown: [
      { module_code: 'HUB-01', qty: 1, revenue_inr: 4499, bom_inr: 1350 },
      { module_code: 'PWR-01', qty: 3, revenue_inr: 6897, bom_inr: 675 },
      { module_code: 'HLT-01', qty: 1, revenue_inr: 5499, bom_inr: 1850 },
    ],
  },
];

export const CANONICAL_EXPENSES: ExpenseRecord[] = [
  {
    exp_id: 'exp_2026_301',
    category: 'HARDWARE_BOM',
    amount_inr: 12350,
    vendor: 'Robu / LCSC PCB Assembly Batch #14',
    description: 'ESP32-C3/S3 + HLW8032 + BTA16 snubber PCBA run (Lamka & Imphal pilot batch)',
    payment_mode: 'Bank',
    invoice_ref: 'INV-LCSC-2026-114',
    dateIso: '2026-11-24',
    createdAtMs: 1763710000000,
  },
  {
    exp_id: 'exp_2026_302',
    category: 'CLOUD_MQTT_SIM',
    amount_inr: 3250,
    vendor: 'Airtel IoT M2M eSIM Pool (NE Circle)',
    description: 'Pooled 4G LTE Cat-1 SIM telemetry & SMS fallback pack (50 vehicles)',
    payment_mode: 'Card',
    invoice_ref: 'INV-AIRTEL-M2M-89',
    dateIso: '2026-11-23',
    createdAtMs: 1763620000000,
  },
  {
    exp_id: 'exp_2026_303',
    category: 'INSTALLER_PAYOUT',
    amount_inr: 2400,
    vendor: 'R.K. Sanatomba (Field Ops · Churachandpur & Imphal)',
    description: 'Field commission for JOB-2026-875 + DFY 3D Twin laser floor measurement',
    payment_mode: 'UPI',
    invoice_ref: 'PAY-INS-875',
    dateIso: '2026-11-22',
    createdAtMs: 1763540000000,
  },
];

export const CANONICAL_SUBSCRIPTIONS: ManagedSubscriptionRecord[] = [
  {
    homeId: 'home_imphal_001',
    customer: 'Thanglian Zou · Lamka Smart Residence',
    phone: '+919862011114',
    tier: 'all_in_family',
    status: 'active',
    trialStatus: 'Annual Active (+365d)',
    simRenewal: '4G eSIM Active · Nov 2027',
    upiStatus: 'PAID',
    paymentMode: 'UPI',
    dfy3dPurchased: true,
  },
  {
    homeId: 'home_guwahati_002',
    customer: 'Dr. L. Ibobi Singh · Imphal Duplex',
    phone: '+919862077123',
    tier: 'plus',
    status: 'trial',
    trialStatus: '90-Day Pro Logic Trial (78d left)',
    simRenewal: 'No Vehicle SIM',
    upiStatus: 'PAID',
    paymentMode: 'Bank',
    dfy3dPurchased: true,
  },
];

export function buildCanonicalDeviceActivations(
  devices: Record<string, VirtualDeviceInstance>
): Record<string, ManagedDeviceActivation> {
  const out: Record<string, ManagedDeviceActivation> = {};
  for (const dev of Object.values(devices)) {
    out[dev.device_id] = {
      device_id: dev.device_id,
      home_id: 'home_imphal_001',
      module_code: dev.module_code,
      name: dev.name,
      activation: 'ACTIVE',
      reason: 'Factory QA & G1/G10 safety guardrail verification passed (Lamka Smart Residence)',
      updatedAtMs: 1763805600000,
    };
  }
  return out;
}

export const CANONICAL_INCIDENTS: IncidentRecord[] = [
  {
    id: 'INC-2026-101',
    createdAt: '2026-11-25T08:40:00.000Z',
    homeId: 'home_imphal_001',
    deviceId: 'dd_pwr03_g7h8i9',
    moduleCode: 'PWR-03',
    alertType: 'RUNTIME_LIMIT',
    severity: 'WARNING',
    status: 'RESOLVED',
    summary: 'Master Bath 16A Geyser auto-cutoff after 45m hard-locked guardrail ceiling (2700s).',
    assignedTo: 'Auto Guardrail Engine (G8/G10)',
  },
  {
    id: 'INC-2026-102',
    createdAt: '2026-11-25T09:12:00.000Z',
    homeId: 'home_imphal_001',
    deviceId: 'dd_saf01_p2s1',
    moduleCode: 'SAF-01',
    alertType: 'LPG_SELF_TEST_OK',
    severity: 'INFO',
    status: 'RESOLVED',
    summary: 'Kitchen LPG & Smoke Guard completed weekly sensor baseline verification (115 ppm nominal).',
    assignedTo: 'Local Hub HUB-01',
  },
];

export const CANONICAL_AMC_TICKETS: AmcTicketRecord[] = [
  {
    ticket_id: 'amc_2026_001',
    customer: 'Lamka Smart Residence (home_imphal_001)',
    tier: 'all_in_family',
    device: 'WAT-01 Terrace Auto Water Tank & Pump',
    issue: 'ESP-NOW terrace RF path check & ultrasonic probe calibration after tank cleaning',
    sla24h: true,
    status: 'SCHEDULED',
  },
  {
    ticket_id: 'amc_2026_002',
    customer: 'Imphal Duplex (home_guwahati_002)',
    tier: 'plus',
    device: 'HLT-01 Elder Room 60GHz Wellness Radar',
    issue: 'Position 60GHz bedside radar at 1.6m tilt during DFY 3D service visit',
    sla24h: true,
    status: 'OPEN',
  },
  {
    ticket_id: 'amc_2026_003',
    customer: 'Lamka Smart Residence (home_imphal_001)',
    tier: 'all_in_family',
    device: 'PWR-03 Master Bath 16A Geyser Switch',
    issue: 'Annual thermal cutout & 16A relay contact inspection',
    sla24h: false,
    status: 'RESOLVED',
  },
];

export const CANONICAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    log_id: 'aud_20261125_01',
    actor_uid: 'demo_admin_01',
    actor_email: 'admin@ddoodle.in',
    action_category: 'DEVICE_STATE',
    action: 'PROVISION_CANONICAL_HOME',
    target_collection: 'homes',
    target_id: 'home_imphal_001',
    summary: 'Provisioned Lamka Smart Residence (Churachandpur/Imphal) with 12 live Phase 1–3 modules.',
    createdAtMs: 1763805000000,
  },
  {
    log_id: 'aud_20261125_02',
    actor_uid: 'demo_admin_01',
    actor_email: 'admin@ddoodle.in',
    action_category: 'INSTALLER_AUTH',
    action: 'DISPATCH_INSTALLER_JOB',
    target_collection: 'installer_jobs',
    target_id: 'JOB-2026-881',
    summary: 'Authorized R.K. Sanatomba (uid_installer_manipur_01) for INITIAL_SETUP_LINKING + DFY 3D Twin on Lamka Smart Residence.',
    createdAtMs: 1763805300000,
  },
  {
    log_id: 'aud_20261125_03',
    actor_uid: 'demo_admin_01',
    actor_email: 'admin@ddoodle.in',
    action_category: 'PRICING',
    action: 'SYNC_42_MODULE_CATALOG',
    target_collection: 'catalog_modules',
    target_id: 'HARDWARE_REGISTRY_V1.4',
    summary: 'Verified all 42 v1.4 modules, Indian gang-box BOM baselines, and ₹999 DFY 3D Twin add-on.',
    createdAtMs: 1763805600000,
  },
];

export function createCanonicalWorkspaceSeed(): UnifiedWorkspaceState {
  const clone = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj)) as T;
  const devices = buildCanonicalDevices();

  return {
    version: '13B.1.4',
    seededAt: Date.now(),
    homes: clone(CANONICAL_HOMES),
    users: clone(CANONICAL_USERS),
    devices,
    catalogOverrides: buildCanonicalCatalogOverrides(),
    storeConfig: clone(CANONICAL_STORE_CONFIG),
    quotes: clone(CANONICAL_QUOTES),
    installerJobs: clone(CANONICAL_INSTALLER_JOBS),
    erp: {
      transactions: clone(CANONICAL_TRANSACTIONS),
      expenses: clone(CANONICAL_EXPENSES),
      subscriptions: clone(CANONICAL_SUBSCRIPTIONS),
      deviceStates: buildCanonicalDeviceActivations(devices),
      accounts: clone(CANONICAL_USERS),
      auditLogs: clone(CANONICAL_AUDIT_LOGS),
      incidents: clone(CANONICAL_INCIDENTS),
      amcTickets: clone(CANONICAL_AMC_TICKETS),
    },
    vehicleTrips: clone(CANONICAL_VEHICLE_TRIPS),
    vehicleGeofences: clone(CANONICAL_VEHICLE_GEOFENCES),
    lockAccessLogs: clone(CANONICAL_LOCK_ACCESS_LOGS),
  };
}

export function getCanonicalCatalogSpecs(): HardwareModuleSpec[] {
  return HARDWARE_REGISTRY;
}

/**
 * Generates a complete, Protocol Contract v1.4-valid VirtualDeviceInstance
 * for any of the 42 hardware modules commissioned via `/installer`, `/console/setup`, or `/admin`.
 */
export function createDynamicVirtualDeviceInstance(params: {
  homeId?: string;
  deviceId: string;
  moduleCode: ModuleCode;
  roomId: string;
  name?: string;
  localPin?: string;
}): VirtualDeviceInstance {
  const spec =
    HARDWARE_REGISTRY.find((m) => m.module_code === params.moduleCode) ??
    HARDWARE_REGISTRY[0];
  const nowSec = Math.floor(Date.now() / 1000);
  const capabilities = structuredClone(spec.capabilities);
  const initialStateMap: Record<string, boolean | number | string> = {};

  for (const cap of capabilities) {
    if (cap.type === 'switch' || cap.type === 'pump_switch') {
      initialStateMap[cap.key] = false;
    } else if (cap.type === 'level') {
      initialStateMap[cap.key] = cap.min ?? 0;
    }
  }

  const telemetry = params.moduleCode.startsWith('PWR')
    ? ({
        ts: nowSec,
        v: 231.0,
        i: 0,
        p: 0,
        pf: 0.98,
        kwh: 0.12,
      } as PowerTelemetryPayload)
    : params.moduleCode === 'WAT-01'
      ? ({
          ts: nowSec,
          level_pct: 68,
          level_cm: 136,
          flow_lpm: 0,
          pump: false,
          tank_batt_pct: null,
          tank_rssi: -61,
          tank_link: true,
        } as WaterTelemetryPayload)
      : params.moduleCode === 'VEH-01'
        ? ({
            ts: nowSec,
            lat: 24.3334,
            lng: 93.6795,
            speed_kmh: 0,
            heading: 180,
            ignition: false,
            ext_v: 12.6,
            bat_pct: 96,
            gsm_rssi: -69,
            immobilize_status: 'RELEASED',
          } as VehicleTelemetryPayload)
        : ({
            ts: nowSec,
            v: 230.5,
            i: 0.02,
            p: 4.5,
            pf: 0.95,
            kwh: 0.05,
          } as PowerTelemetryPayload);

  return {
    device_id: params.deviceId,
    module_code: params.moduleCode,
    room_id: params.roomId || 'room_living',
    name: params.name?.trim() || `${spec.module_code} ${spec.name}`,
    local_pin: params.localPin || '48291034',
    status: 'online',
    info: {
      schema: 'v1.4',
      device_id: params.deviceId,
      module_code: params.moduleCode,
      fw_version: '1.4.0',
      hw_rev: '2.0',
      operation_mode: 'CLOUD_DIRECT',
      capabilities,
    },
    state: {
      ts: nowSec,
      operation_mode: 'CLOUD_DIRECT',
      rssi: -56,
      ack: `req-commission-${nowSec}`,
      manual_override: false,
      fault: null,
      state: initialStateMap,
    },
    telemetry,
    config: {
      schema: 'v1.4',
      operation_mode: 'CLOUD_DIRECT',
      power_restore: 'RESTORE_LAST',
      guardrails: {
        hard_locked: true,
        ...(params.moduleCode === 'PWR-03' ? { max_runtime_min: 45, overpower_w: 3600 } : {}),
        ...(params.moduleCode === 'WAT-01' ? { dry_run_timeout_sec: 45 } : {}),
      },
    },
    rules: {
      schema: 'v1.4',
      rules: [],
    },
    ota: {
      url: 'https://storage.googleapis.com/ddoodle-ota/v1.4.0/esp32s3.bin',
      fw_version: '1.4.0',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      size: 884736,
      sig: 'secure-boot-v2',
    },
    last_alert: null,
  };
}
