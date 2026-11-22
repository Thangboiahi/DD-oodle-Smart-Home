/**
 * DD oodle Smart Home — Frozen Shared Transports Reference (v1.4)
 * Matches ESP32 firmware contract (BLE GATT, Local LAN HTTP/WS, SoftAP, OTA, HUB-01 Broker).
 * DO NOT alter UUIDs, routes, or header names without Master Planner sync.
 */

import { OperationMode, isSafeProtocolId } from './contract';

// ============================================================================
// 1. BLE GATT DD_OODLE_CTRL UUID Table & Manufacturer Metadata
// ============================================================================

/**
 * G18c: Frozen BLE Manufacturer Payload Metadata
 * Manufacturer ID / Protocol: 0x12
 * Module ID byte: 1..6 for Phase 1 hardware
 */
export const BLE_MODULE_IDS: Record<string, number> = {
  'PWR-01': 0x01,
  'PWR-02': 0x02,
  'PWR-03': 0x03,
  'WAT-01': 0x04,
  'VEH-01': 0x05,
  'HUB-01': 0x06,
} as const;

export const BLE_MODULE_BY_ID: Record<number, string> = {
  0x01: 'PWR-01',
  0x02: 'PWR-02',
  0x03: 'PWR-03',
  0x04: 'WAT-01',
  0x05: 'VEH-01',
  0x06: 'HUB-01',
} as const;

export const BLE_GATT = {
  DEVICE_NAME_PREFIX: 'DD_OODLE_',
  SERVICE_NAME: 'DD_OODLE_CTRL',
  BASE_UUID_PATTERN: 'dd00xxxx-0d1e-4f5a-8b6c-3e9f2a7c1b40',
  SERVICE_UUID: 'dd000001-0d1e-4f5a-8b6c-3e9f2a7c1b40',
  MANUFACTURER_PROTOCOL_ID: 0x12,
  MODULE_IDS: BLE_MODULE_IDS,
  CHARACTERISTICS: {
    /** G1: Capability Announcement */
    INFO: 'dd000002-0d1e-4f5a-8b6c-3e9f2a7c1b40',
    /** Write nonce challenge, read HMAC-SHA256(local_key, nonce) */
    AUTH: 'dd000003-0d1e-4f5a-8b6c-3e9f2a7c1b40',
    /** G2/G3/G10 State payload with ack, fault, and operation_mode */
    STATE: 'dd000004-0d1e-4f5a-8b6c-3e9f2a7c1b40',
    /** G4 Command payload with req_id */
    CMD: 'dd000005-0d1e-4f5a-8b6c-3e9f2a7c1b40',
    /** Config & Guardrails */
    CONFIG: 'dd000006-0d1e-4f5a-8b6c-3e9f2a7c1b40',
    /** Local Rules */
    RULES: 'dd000007-0d1e-4f5a-8b6c-3e9f2a7c1b40',
    /** G8 Critical Alerts (latched) */
    ALERT: 'dd000008-0d1e-4f5a-8b6c-3e9f2a7c1b40',
    /** Telemetry frames */
    TELEMETRY: 'dd000009-0d1e-4f5a-8b6c-3e9f2a7c1b40',
  },
} as const;

/**
 * Encodes a BLE manufacturer advertisement payload: [0x12, moduleId, stateSummaryByte, faultByte]
 */
export function buildBleManufacturerData(moduleCode: string, isOnline: boolean, hasFault: boolean): Uint8Array {
  const modId = BLE_MODULE_IDS[moduleCode] ?? 0x00;
  return new Uint8Array([
    BLE_GATT.MANUFACTURER_PROTOCOL_ID,
    modId,
    isOnline ? 0x01 : 0x00,
    hasFault ? 0x01 : 0x00,
  ]);
}

// ============================================================================
// 2. Local LAN HTTP / WebSocket API (Port 80 — Zero Mixed-Content Architecture)
// ============================================================================

/**
 * G7 / G18c: Frozen LAN HTTP Status Codes & Error Reason Taxonomy
 */
export const LAN_HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
} as const;

export const LAN_ERROR_CODES = {
  400: {
    code: 'INVALID_JSON_OR_PARAMETERS',
    message: 'Malformed request JSON, invalid command syntax, or missing req_id/source.',
  },
  401: {
    code: 'INVALID_OR_MISSING_LOCAL_PIN',
    message: 'G7 8-digit device PIN is incorrect or missing DD-HMAC challenge signature.',
  },
  403: {
    code: 'LATCHED_FAULT_OR_READONLY_SENSOR',
    message: 'G10 Hardware latched fault active (3s physical hold required) OR G12 attempt to write to read-only sensor.',
  },
  409: {
    code: 'IMMOBILIZER_SAFETY_INTERLOCK_CONFLICT',
    message: 'G15 Starter cut rejected: vehicle is moving >= 5 km/h or ignition is active.',
  },
  413: {
    code: 'RULES_OR_PAYLOAD_BUFFER_OVERFLOW',
    message: 'G17 Rules payload exceeds local ESP32 NVS/RAM buffer ceiling.',
  },
  429: {
    code: 'LOCAL_API_RATE_LIMIT_EXCEEDED',
    message: 'Exceeded 20 requests/second local rate limit.',
  },
} as const;

export const LAN_TRANSPORT = {
  MDNS_SERVICE: '_ddoodle._tcp',
  PORT: 80,
  HUB_LOCAL_URL: 'http://ddoodle-hub.local/',
  HUB_MQTT_PORT: 1883,
  HUB_SNTP_PORT: 123,
  HMAC_HEADER: 'DD-HMAC',
  HMAC_TIMESTAMP_WINDOW_SEC: 60,
  LOCAL_PIN_DIGITS: 8, // G7 8-digit local device PIN
  RATE_LIMIT_RPS: 20,
  ENDPOINTS: {
    INFO: '/api/v1/info',
    STATE: '/api/v1/state',
    CMD: '/api/v1/cmd',
    CONFIG: '/api/v1/config',
    DEVICES: '/api/v1/devices', // G18d
    LOGIN: '/api/v1/login', // G7
    WS: '/api/v1/ws',
  },
  STATUS: LAN_HTTP_STATUS,
  ERRORS: LAN_ERROR_CODES,
} as const;

/**
 * Generates the v1.2 Zero-Mixed-Content top-level navigation URL for
 * offline LAN / iOS Safari control (loads device's ~15KB gzipped local UI).
 */
export function buildLocalDevicePortalUrl(deviceId: string): string {
  if (!isSafeProtocolId(deviceId)) {
    throw new Error(`Invalid device_id for mDNS local portal URL: "${deviceId}"`);
  }
  const slug = deviceId.toLowerCase().replace(/_/g, '-');
  return `http://ddoodle-${slug}.local/`;
}

// ============================================================================
// 3. SoftAP Provisioning Flow (192.168.4.1)
// ============================================================================

export const SOFTAP_TRANSPORT = {
  SSID_PREFIX: 'DDoodle-Setup-',
  GATEWAY_IP: '192.168.4.1',
  BASE_URL: 'http://192.168.4.1',
  PROVISION_ENDPOINT: '/api/v1/prov',
} as const;

export interface SoftApProvisionPayload {
  ssid: string;
  pass: string;
  home_id: string;
  claim_token: string;
  local_key: string;
  operation_mode?: OperationMode;
}

// ============================================================================
// 4. OTA Firmware Security & Cloud Prerequisites
// ============================================================================

export const OTA_SECURITY = {
  HEADERS: {
    SHA256: 'X-DD-SHA256',
    FW_VERSION: 'X-DD-FW',
  },
  SIGNATURE_SCHEME: 'secure-boot-v2',
  ROLLBACK_WATCHDOG_SEC: 60,
  PREREQUISITES: {
    /** HTTP 206 Partial Content / Range requests are mandatory for resilient ESP32 OTA */
    HTTP_206_RANGE: true,
    /** Common-CA root certificates in ESP32 mbedTLS trust store */
    COMMON_CA_CHAIN: true,
    /** Dual-partition A/B flash with auto-rollback on boot-loop */
    A_B_PARTITIONING: true,
    MAX_BIN_SIZE_BYTES: 1572864, // 1.5 MB flash ceiling
  },
} as const;

// ============================================================================
// 5. Hub Cloud Bridge ACL Prerequisites
// ============================================================================

export const HUB_CLOUD_BRIDGE_ACLS = {
  /** Topics published by HUB-01 to Google Cloud MQTT/PubSub bridge on behalf of members */
  UPLINK_FORWARD_PATTERNS: [
    'ddoodle/{home_id}/+/state',
    'ddoodle/{home_id}/+/telemetry',
    'ddoodle/{home_id}/+/alert',
    'ddoodle/{home_id}/+/status',
    'ddoodle/{home_id}/+/info',
  ],
  /** Topics subscribed by HUB-01 from Cloud for downstream member dispatch */
  DOWNLINK_DISPATCH_PATTERNS: [
    'ddoodle/{home_id}/+/cmd',
    'ddoodle/{home_id}/+/config',
    'ddoodle/{home_id}/+/rules',
    'ddoodle/{home_id}/+/ota',
    'ddoodle/{home_id}/{hub_id}/members',
  ],
} as const;

// ============================================================================
// 6. 4-Tier Connectivity Status Pill Mapping
// ============================================================================

export type ActiveTransportTier =
  | 'CLOUD'
  | 'LOCAL_HUB'
  | 'DIRECT_LAN'
  | 'DIRECT_BLE'
  | 'MANUAL_FAILSAFE';

export interface ConnectivityPillMeta {
  tier: ActiveTransportTier;
  operationMode: OperationMode;
  label: string;
  shortLabel: string;
  offlineCapable: boolean;
  requiresTopLevelLanLink: boolean;
}

export const CONNECTIVITY_PILL_MAP: Record<OperationMode, ConnectivityPillMeta> = {
  CLOUD_DIRECT: {
    tier: 'CLOUD',
    operationMode: 'CLOUD_DIRECT',
    label: 'Cloud (4G/Wi-Fi)',
    shortLabel: 'Cloud',
    offlineCapable: false,
    requiresTopLevelLanLink: false,
  },
  LOCAL_HUB: {
    tier: 'LOCAL_HUB',
    operationMode: 'LOCAL_HUB',
    label: 'Local Hub (Offline LAN)',
    shortLabel: 'Local Hub',
    offlineCapable: true,
    requiresTopLevelLanLink: true,
  },
  LAN_ONLY: {
    tier: 'DIRECT_LAN',
    operationMode: 'LAN_ONLY',
    label: 'Direct LAN',
    shortLabel: 'Direct LAN',
    offlineCapable: true,
    requiresTopLevelLanLink: true,
  },
  BLE_ONLY: {
    tier: 'DIRECT_BLE',
    operationMode: 'BLE_ONLY',
    label: 'Direct Bluetooth (BLE)',
    shortLabel: 'Direct BLE',
    offlineCapable: true,
    requiresTopLevelLanLink: false,
  },
  FAILSAFE_MANUAL: {
    tier: 'MANUAL_FAILSAFE',
    operationMode: 'FAILSAFE_MANUAL',
    label: 'Manual Failsafe',
    shortLabel: 'Manual Failsafe',
    offlineCapable: true,
    requiresTopLevelLanLink: false,
  },
};
