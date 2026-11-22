/**
 * DD oodle Smart Home — Protocol Contract v1.4 (Shared TypeScript Definitions)
 * Source of Truth: Frozen Protocol Contract v1.4 (G1–G18)
 * Code-complete against all 8 ESP32 firmware images and golden test fixtures.
 */

export const PROTOCOL_SCHEMA_VERSION = 'v1.4' as const;
export type ProtocolSchemaVersion = typeof PROTOCOL_SCHEMA_VERSION;

// ============================================================================
// Core Enums (Frozen in Protocol Contract v1.4)
// ============================================================================

export type OperationMode =
  | 'CLOUD_DIRECT'
  | 'LOCAL_HUB'
  | 'LAN_ONLY'
  | 'BLE_ONLY'
  | 'FAILSAFE_MANUAL';

export type PowerRestoreMode = 'OFF' | 'ON' | 'RESTORE_LAST';

/** G4: Strict CommandSource union */
export type CommandSource =
  | 'pwa_cloud'
  | 'pwa_lan'
  | 'pwa_ble'
  | 'hub'
  | 'rule'
  | 'wall_switch'
  | 'voice';

export type DeviceLwtStatus = 'online' | 'offline';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

/**
 * G8: Protocol Contract v1.4 Active Phase 1 Alert Types
 * Active Phase 1 alerts + Phase 2/3 reserved life-safety alert codes
 */
export type Phase1ActiveAlertType =
  | 'OVERLOAD'
  | 'OVERPOWER'
  | 'RUNTIME_LIMIT'
  | 'OVERTEMP'
  | 'METER_FAULT'
  | 'DRY_RUN_FAULT'
  | 'TANK_LINK_LOST'
  | 'SENSOR_FAULT'
  | 'LOW_BATTERY'
  | 'CRASH_DETECTED'
  | 'SOS_MANUAL'
  | 'EXT_POWER_LOST'
  | 'RULE_REJECTED';

export type Phase2ReservedAlertType =
  | 'GAS_LEAK'
  | 'SMOKE_FIRE'
  | 'FLAME_DETECTED'
  | 'WATER_LEAK'
  | 'FALL_DETECTED'
  | 'PANIC_SOS';

export type AlertType = Phase1ActiveAlertType | Phase2ReservedAlertType;

/** G15c: VEH-01 Starter Interlock State */
export type ImmobilizeState = 'PENDING' | 'ENGAGED' | 'RELEASED';

export type Phase1ModuleCode =
  | 'PWR-01'
  | 'PWR-02'
  | 'PWR-03'
  | 'WAT-01'
  | 'VEH-01'
  | 'HUB-01';

/** Extensible to all 42 DD oodle modules without hardcoding static pages */
export type ModuleCode = Phase1ModuleCode | (string & {});

export type MqttTopicChannel =
  | 'state'
  | 'cmd'
  | 'telemetry'
  | 'alert'
  | 'status'
  | 'config'
  | 'rules'
  | 'ota'
  | 'info'
  | 'members';

// ============================================================================
// Safety Constants (Non-Negotiable Life-Safety & Hardware Guardrail Ceilings)
// ============================================================================

export const SAFETY_CONSTANTS = {
  CRASH_SOS_CANCEL_WINDOW_SEC: 20,
  IMMOBILIZER_MAX_SAFE_SPEED_KMH: 5,
  PWR03_MAX_RUNTIME_CEILING_MIN: 90,
  PWR03_DEFAULT_RUNTIME_MIN: 45,
  WAT01_DRY_RUN_CEILING_SEC: 60,
  WAT01_DEFAULT_DRY_RUN_SEC: 30,
  OTA_ROLLBACK_WATCHDOG_SEC: 60,
  CORE_MAX_LOCAL_SCHEDULES: 5,
  HUB_PERMIT_JOIN_TIMEOUT_SEC: 180,
  HUB_MAX_LOCAL_RULES: 64,
  HUB_MAX_MEMBERS: 64,
  LATCHED_FAULT_CLEAR_HOLD_SEC: 3,
} as const;

// ============================================================================
// MQTT Topic Helpers (ddoodle/{home_id}/{device_id}/{channel})
// ============================================================================

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function isSafeProtocolId(id: string): boolean {
  return SAFE_ID_REGEX.test(id);
}

export function buildMqttTopic(
  homeId: string,
  deviceId: string,
  channel: MqttTopicChannel
): string {
  if (!isSafeProtocolId(homeId) || !isSafeProtocolId(deviceId)) {
    throw new Error(`Invalid MQTT topic identifier: home_id="${homeId}", device_id="${deviceId}"`);
  }
  return `ddoodle/${homeId}/${deviceId}/${channel}`;
}

export function buildAllDeviceTopics(homeId: string, deviceId: string): Record<MqttTopicChannel, string> {
  return {
    state: buildMqttTopic(homeId, deviceId, 'state'),
    cmd: buildMqttTopic(homeId, deviceId, 'cmd'),
    telemetry: buildMqttTopic(homeId, deviceId, 'telemetry'),
    alert: buildMqttTopic(homeId, deviceId, 'alert'),
    status: buildMqttTopic(homeId, deviceId, 'status'),
    config: buildMqttTopic(homeId, deviceId, 'config'),
    rules: buildMqttTopic(homeId, deviceId, 'rules'),
    ota: buildMqttTopic(homeId, deviceId, 'ota'),
    info: buildMqttTopic(homeId, deviceId, 'info'),
    members: buildMqttTopic(homeId, deviceId, 'members'),
  };
}

// ============================================================================
// Capability Registry Schema (Scales Dynamically to All 42 Modules)
// ============================================================================

export type CapabilityType =
  | 'switch'
  | 'level'
  | 'sensor' // G12: Strictly read-only sensor capability
  | 'power_meter'
  | 'voltage'
  | 'current'
  | 'kwh'
  | 'water_level_pct'
  | 'pump_switch'
  | 'flow_dry_run'
  | 'gps_track'
  | 'crash_sos'
  | 'immobilizer'
  | 'sensor_gauge'
  | 'lock_state'
  | 'video_stream'
  | 'vitals'
  | 'fall_alert'
  | 'pill_dispenser'
  | 'hub_status';

export interface BaseCapability {
  key: string;
  type: CapabilityType;
  label: string;
  unit?: string;
}

export interface SwitchCapability extends BaseCapability {
  type: 'switch' | 'pump_switch';
}

/** G6: Standardized stepped / ranged controls */
export interface LevelCapability extends BaseCapability {
  type: 'level';
  min: number;
  max: number;
  step?: number;
}

/** G12: Read-only sensor capability — NEVER emit .../cmd for a sensor key */
export interface ReadOnlySensorCapability extends BaseCapability {
  type: 'sensor';
  unit: string;
  min?: number; // Display hint for gauges/charts
  max?: number; // Display hint for gauges/charts
}

export interface MeterCapability extends BaseCapability {
  type: 'power_meter' | 'voltage' | 'current' | 'kwh' | 'water_level_pct';
  min?: number;
  max?: number;
}

export interface DryRunCapability extends BaseCapability {
  type: 'flow_dry_run';
}

export interface VehicleCapability extends BaseCapability {
  type: 'gps_track' | 'crash_sos' | 'immobilizer';
}

export interface SensorGaugeCapability extends BaseCapability {
  type: 'sensor_gauge';
  unit: string;
  min?: number;
  max?: number;
  warn_low?: number;
  warn_high?: number;
  crit_low?: number;
  crit_high?: number;
}

export interface SecurityAssistedCapability extends BaseCapability {
  type: 'lock_state' | 'video_stream' | 'vitals' | 'fall_alert' | 'pill_dispenser' | 'hub_status';
  non_medical_disclaimer?: boolean;
}

export type DeviceCapability =
  | SwitchCapability
  | LevelCapability
  | ReadOnlySensorCapability
  | MeterCapability
  | DryRunCapability
  | VehicleCapability
  | SensorGaugeCapability
  | SecurityAssistedCapability;

// ============================================================================
// Protocol Payloads (Exact v1.4 Wire Formats)
// ============================================================================

export type PrimitiveStateValue = boolean | number | string;
export type DeviceStateMap = Record<string, PrimitiveStateValue>;

/** G1: ddoodle/{home_id}/{device_id}/info (Retained, QoS 1) */
export interface DeviceInfoPayload {
  schema: ProtocolSchemaVersion;
  device_id: string;
  module_code: ModuleCode;
  fw_version: string;
  hw_rev: string;
  operation_mode: OperationMode;
  capabilities: DeviceCapability[];
  /** G18a: HUB-01 permit_join and local client count */
  permit_join?: boolean;
  permit_join_timeout_sec?: number;
  local_clients?: number;
}

/** G4: ddoodle/{home_id}/{device_id}/cmd (QoS 1) */
export interface CommandPayload {
  req_id: string;
  source: CommandSource;
  set: DeviceStateMap;
}

/**
 * G10: ddoodle/{home_id}/{device_id}/state (Retained, QoS 1)
 * Includes fault: AlertType | null. When fault !== null, load controls are locked.
 */
export interface StatePayload {
  ts: number;
  operation_mode: OperationMode;
  rssi: number;
  ack: string | null;
  state: DeviceStateMap;
  fault: AlertType | null; // G10: Latched fault indicator
  manual_override?: boolean;
  /** G15c: VEH-01 Starter Interlock State */
  immobilize?: ImmobilizeState;
  immobilize_reason?: string;
  ignition?: boolean;
  /** G18c: BLE Proxy tracking */
  via?: 'ble_proxy' | 'cloud' | 'lan';
}

/** Non-overridable hardware safety guardrails */
export interface GuardrailsConfig {
  max_runtime_min?: number;
  dry_run_timeout_sec?: number;
  hard_locked: boolean;
  min_voltage_v?: number;
  max_voltage_v?: number;
  max_current_a?: number;
  overpower_w?: number;
  overtemp_c?: number;
}

/** G14: VEH-01 SOS Config */
export interface VehicleSosConfig {
  contacts: string[]; // 0-3 E.164 phone numbers
  sms_fallback: boolean;
}

/** ddoodle/{home_id}/{device_id}/config (Retained, QoS 1) */
export interface ConfigPayload {
  schema: ProtocolSchemaVersion;
  operation_mode: OperationMode;
  power_restore: PowerRestoreMode;
  guardrails: GuardrailsConfig;
  sos?: VehicleSosConfig; // G14
}

/** G17: Local Rule with up to 3 'and', 4 'then', window, cooldown_sec */
export interface LocalRuleCondition {
  key: string;
  op: '<' | '<=' | '>' | '>=' | '==' | '!=';
  value: PrimitiveStateValue;
}

export interface LocalRule {
  id: string;
  enabled: boolean;
  type: 'schedule' | 'threshold' | 'interlock';
  cron?: string;
  window?: { start_time: string; end_time: string };
  cooldown_sec?: number;
  and?: LocalRuleCondition[]; // Up to 3 'and' conditions
  condition?: LocalRuleCondition;
  action: DeviceStateMap; // Up to 4 'then' actions
}

/** ddoodle/{home_id}/{device_id}/rules (Retained, QoS 1) */
export interface RulesPayload {
  schema: ProtocolSchemaVersion;
  rules: LocalRule[];
}

/** G16b: HUB-01 Wrapped Key Member */
export interface HubMemberKeyPayload {
  device_id: string;
  module_code: ModuleCode;
  wrapped_key: string; // AES-256-GCM + HKDF wrapped
  iv: string;
  tag: string;
  revoked: boolean;
}

/** G16b: ddoodle/{home_id}/{hub_id}/members (QoS 1, NOT retained, max 64 members) */
export interface HubMembersPayload {
  schema: ProtocolSchemaVersion;
  hub_id: string;
  ts: number;
  members: HubMemberKeyPayload[];
}

/** G5: ddoodle/{home_id}/{device_id}/ota (QoS 1) */
export interface OtaPayload {
  url: string;
  fw_version: string;
  sha256: string;
  size: number;
  sig: string; // 'secure-boot-v2'
}

/**
 * G9: PWR-03 (and PWR-01/02) Telemetry Payload
 * Published every 10 s ON / 60 s OFF. kwh is cumulative in NVS (never auto-resets).
 */
export interface PowerTelemetryPayload {
  ts: number;
  v: number; // Voltage (RMS V)
  i: number; // Current (RMS A)
  p: number; // Active Power (W)
  pf: number; // Power Factor (0.00..1.00)
  kwh: number; // Cumulative Energy in NVS (never auto-resets)
  runtime_min?: number;
}

/**
 * G11: WAT-01 Telemetry Payload (QoS 0, NOT retained)
 * Published every 10 s pumping / 300 s idle.
 */
export interface WaterTelemetryPayload {
  ts: number;
  level_pct: number;
  level_cm: number;
  flow_lpm: number;
  pump: boolean;
  tank_batt_pct: number | null; // null when AC/mains powered
  tank_rssi: number;
  tank_link: boolean; // false indicates sub-GHz wireless link lost
}

/**
 * G15d: VEH-01 Telemetry Payload
 * Published every 10 s moving / 60 s parked ignition ON / 900 s parked ignition OFF.
 */
export interface VehicleTelemetryPayload {
  ts: number;
  lat: number;
  lng: number;
  speed_kmh: number;
  heading: number;
  ignition: boolean;
  ext_v: number;
  bat_pct: number;
  immobilize_status: ImmobilizeState;
}

/** G18b: HUB-01 Telemetry Payload (published every 60 s) */
export interface HubTelemetryPayload {
  ts: number;
  connected_devices: number;
  lan_clients: number;
  cloud_uplink: boolean;
  uptime_sec: number;
  cpu_temp_c: number;
  local_ip: string;
  broker_rx_rate?: number;
  broker_tx_rate?: number;
}

export type TelemetryPayload =
  | VehicleTelemetryPayload
  | PowerTelemetryPayload
  | WaterTelemetryPayload
  | HubTelemetryPayload
  | ({ ts: number } & Record<string, PrimitiveStateValue | null>);

/**
 * G8: Alert Payload (ddoodle/{home_id}/{device_id}/alert, QoS 1, NOT retained)
 */
export interface DeviceAlertPayload {
  ts: number;
  type: AlertType;
  severity: AlertSeverity;
  latched: boolean; // G8: Latched fault indicator
  value?: number;
  limit?: number;
  message?: string;
  // Vehicle Crash / SOS specific fields (G13)
  g_force?: number;
  tilt_deg?: number;
  lat?: number;
  lng?: number;
  cancel_window_sec?: number;
  cancelled?: boolean;
}

export type AlertPayload = DeviceAlertPayload;

// ============================================================================
// Firebase RTDB Live Mirror Schema (/live/{home_id}/{device_id})
// ============================================================================

export interface RtdbLiveDeviceNode {
  online: boolean;
  ts: number;
  operation_mode: OperationMode;
  rssi: number;
  ack: string | null;
  state: DeviceStateMap;
  fault: AlertType | null; // G10
  telemetry: TelemetryPayload;
}

// ============================================================================
// Firestore Domain Models (Spec Section 11)
// ============================================================================

export type UserRole = 'customer' | 'family' | 'installer' | 'admin';
export type HomeMemberRole = 'owner' | 'family';

export type SubscriptionTier = 'core' | 'plus' | 'drive' | 'shield' | 'all_in_family';
export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'cancelled' | 'past_due';

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
  whatsapp_enabled: boolean;
  voice_call_enabled: boolean;
}

export interface HomeSubscriptionDoc {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trial_ends_at: number | null;
  expires_at: number | null;
  dfy_3d_purchased: boolean;
}

export type HomeTemplateId = '1bhk' | '2bhk' | '3bhk' | 'duplex' | 'compact';

export interface Layout3DPin {
  device_id: string;
  room_id: string;
  x: number;
  y: number;
  z: number;
  fixture_type: 'light' | 'fan' | 'geyser' | 'socket' | 'tank' | 'hub' | 'sensor';
}

export interface HomeLayout3D {
  template_id: HomeTemplateId;
  eco_fallback: boolean;
  pins: Layout3DPin[];
}

export interface VehicleGeofence {
  id: string;
  name: string;
  enabled: boolean;
  lat: number;
  lng: number;
  radius_m: number;
  trigger: 'on_enter' | 'on_exit' | 'both';
  cross_category_action?: 'porch_lights' | 'inverter_saver' | 'none';
}

export interface FirestoreHomeDoc {
  ownerId: string;
  name: string;
  address: string;
  tariff_inr: number;
  hub_enabled: boolean;
  hub_ip: string | null;
  members: Record<string, HomeMemberRole>;
  subscription: HomeSubscriptionDoc;
  layout_3d: HomeLayout3D;
}

export interface FirestoreDeviceDoc {
  module_code: ModuleCode;
  name: string;
  room_id: string;
  fw_version: string;
  operation_mode: OperationMode;
  power_restore: PowerRestoreMode;
  local_key?: string;
  local_pin: string; // G7 8-digit local device PIN
  guardrails: GuardrailsConfig;
  capabilities: DeviceCapability[];
  settings: Record<string, PrimitiveStateValue>;
}

// ============================================================================
// Runtime Safety Guardrail & Contract Validators
// ============================================================================

export interface GuardrailValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Enforces non-overridable UI & backend safety ceilings for WAT-01 dry-run
 * and PWR-03 max-runtime when guardrails.hard_locked is true.
 */
export function validateGuardrailUpdate(
  moduleCode: ModuleCode,
  current: GuardrailsConfig,
  proposed: GuardrailsConfig
): GuardrailValidationResult {
  if (current.hard_locked && !proposed.hard_locked) {
    return {
      valid: false,
      reason: 'Safety guardrails are hard-locked and cannot be unlocked.',
    };
  }

  if (moduleCode === 'PWR-03') {
    if (
      typeof proposed.max_runtime_min !== 'number' ||
      proposed.max_runtime_min < 5 ||
      proposed.max_runtime_min > SAFETY_CONSTANTS.PWR03_MAX_RUNTIME_CEILING_MIN
    ) {
      return {
        valid: false,
        reason: `PWR-03 max_runtime_min must be between 5 and ${SAFETY_CONSTANTS.PWR03_MAX_RUNTIME_CEILING_MIN} minutes.`,
      };
    }
  }

  if (moduleCode === 'WAT-01') {
    if (
      typeof proposed.dry_run_timeout_sec !== 'number' ||
      proposed.dry_run_timeout_sec < 10 ||
      proposed.dry_run_timeout_sec > SAFETY_CONSTANTS.WAT01_DRY_RUN_CEILING_SEC
    ) {
      return {
        valid: false,
        reason: `WAT-01 dry_run_timeout_sec must be between 10 and ${SAFETY_CONSTANTS.WAT01_DRY_RUN_CEILING_SEC} seconds.`,
      };
    }
  }

  return { valid: true };
}

/**
 * G15b: Checks whether starter-solenoid cut can be engaged immediately.
 * ENGAGED only when ignition === false && speed < 5 km/h.
 * Otherwise transitions to PENDING.
 */
export function evaluateStarterInterlockSafety(
  speedKmh: number,
  ignition: boolean
): {
  targetState: ImmobilizeState;
  reason: string;
} {
  if (ignition) {
    return {
      targetState: 'PENDING',
      reason: 'Ignition is currently ON. Immobilizer will engage starter cut once engine is turned off.',
    };
  }

  if (speedKmh >= SAFETY_CONSTANTS.IMMOBILIZER_MAX_SAFE_SPEED_KMH) {
    return {
      targetState: 'PENDING',
      reason: `Vehicle moving at ${speedKmh.toFixed(1)} km/h. Starter cut will engage safely when stopped (<5 km/h).`,
    };
  }

  return {
    targetState: 'ENGAGED',
    reason: 'Vehicle is stationary and ignition is OFF. Starter solenoid cut engaged.',
  };
}

/** Backwards-compatible helper */
export function evaluateImmobilizerSafety(speedKmh: number): {
  canImmobilizeImmediately: boolean;
  movingWarningRequired: boolean;
  warningMessage: string | null;
} {
  const result = evaluateStarterInterlockSafety(speedKmh, false);
  return {
    canImmobilizeImmediately: result.targetState === 'ENGAGED',
    movingWarningRequired: result.targetState === 'PENDING',
    warningMessage: result.targetState === 'PENDING' ? result.reason : null,
  };
}
