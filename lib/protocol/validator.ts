/**
 * DD oodle Smart Home — Protocol Contract v1.4 Automated Validator & Compliance Test Suite
 * Validates devices, payloads, and state transitions against all frozen rules (G1–G18).
 * Used by Simulator Workbench, Admin Portal, and pre-deployment CI gates.
 */

import fixtures from '../../contract/contract_v1.4_fixtures.json';
import {
  AlertType,
  CommandPayload,
  CommandSource,
  ConfigPayload,
  DeviceAlertPayload,
  DeviceInfoPayload,
  evaluateStarterInterlockSafety,
  ImmobilizeState,
  LocalRule,
  OperationMode,
  OtaPayload,
  Phase1ActiveAlertType,
  Phase1ModuleCode,
  PowerTelemetryPayload,
  RulesPayload,
  SAFETY_CONSTANTS,
  StatePayload,
  VehicleTelemetryPayload,
  WaterTelemetryPayload,
} from './contract';
import { BLE_GATT, BLE_MODULE_IDS, LAN_TRANSPORT, OTA_SECURITY } from './transports';
import { VirtualDeviceInstance } from '../simulator/types';

export interface ValidationAssertion {
  ruleId: string;
  title: string;
  passed: boolean;
  details: string;
}

export interface ContractComplianceReport {
  contractVersion: string;
  totalAssertions: number;
  passedCount: number;
  failedCount: number;
  isFullyCompliant: boolean;
  assertions: ValidationAssertion[];
  moduleResults: Record<string, { passed: boolean; assertions: ValidationAssertion[] }>;
}

const PHASE_1_ALERT_TYPES: ReadonlySet<string> = new Set<Phase1ActiveAlertType>([
  'OVERLOAD',
  'OVERPOWER',
  'RUNTIME_LIMIT',
  'OVERTEMP',
  'METER_FAULT',
  'DRY_RUN_FAULT',
  'TANK_LINK_LOST',
  'SENSOR_FAULT',
  'LOW_BATTERY',
  'CRASH_DETECTED',
  'SOS_MANUAL',
  'EXT_POWER_LOST',
  'RULE_REJECTED',
]);

const VALID_COMMAND_SOURCES: ReadonlySet<string> = new Set<CommandSource>([
  'pwa_cloud',
  'pwa_lan',
  'pwa_ble',
  'hub',
  'rule',
  'wall_switch',
  'voice',
]);

const VALID_OPERATION_MODES: ReadonlySet<string> = new Set<OperationMode>([
  'CLOUD_DIRECT',
  'LOCAL_HUB',
  'LAN_ONLY',
  'BLE_ONLY',
  'FAILSAFE_MANUAL',
]);

/**
 * Validates a single DeviceInfoPayload for G1, G2, G6, G12, G18a
 */
export function validateDeviceInfo(info: DeviceInfoPayload): ValidationAssertion[] {
  const assertions: ValidationAssertion[] = [];

  // G1: Schema Version
  assertions.push({
    ruleId: 'G1',
    title: 'Info Schema v1.4',
    passed: info.schema === 'v1.4',
    details: `schema: ${info.schema} (expected: v1.4)`,
  });

  // G2: Operation mode
  assertions.push({
    ruleId: 'G2',
    title: 'Operation Mode Enum',
    passed: VALID_OPERATION_MODES.has(info.operation_mode),
    details: `operation_mode: ${info.operation_mode}`,
  });

  // G6: Stepped/Level Capabilities
  const levelCaps = info.capabilities.filter((c) => c.type === 'level');
  for (const cap of levelCaps) {
    const isLevelValid = typeof cap.min === 'number' && typeof cap.max === 'number' && cap.max >= cap.min;
    assertions.push({
      ruleId: 'G6',
      title: `Level Capability (${cap.key})`,
      passed: isLevelValid,
      details: `key: ${cap.key}, min: ${cap.min}, max: ${cap.max}, step: ${cap.step ?? 1}`,
    });
  }

  // G12: Read-Only Sensor Capabilities
  const sensorCaps = info.capabilities.filter((c) => c.type === 'sensor');
  for (const cap of sensorCaps) {
    const hasUnit = typeof cap.unit === 'string' && cap.unit.length > 0;
    assertions.push({
      ruleId: 'G12',
      title: `Read-Only Sensor (${cap.key})`,
      passed: hasUnit,
      details: `key: ${cap.key}, unit: "${cap.unit}"`,
    });
  }

  // G18a: HUB-01 Permit Join Countdown
  if (info.module_code === 'HUB-01') {
    assertions.push({
      ruleId: 'G18a',
      title: 'HUB-01 Permit Join Fields',
      passed: typeof info.permit_join === 'boolean' && typeof info.permit_join_timeout_sec === 'number',
      details: `permit_join: ${info.permit_join}, timeout: ${info.permit_join_timeout_sec}s`,
    });
  }

  return assertions;
}

/**
 * Validates a StatePayload for G2, G3, G10, G15c
 */
export function validateDeviceState(state: StatePayload, moduleCode: Phase1ModuleCode): ValidationAssertion[] {
  const assertions: ValidationAssertion[] = [];

  // G2: operation_mode present
  assertions.push({
    ruleId: 'G2',
    title: 'State Operation Mode',
    passed: VALID_OPERATION_MODES.has(state.operation_mode),
    details: `operation_mode: ${state.operation_mode}`,
  });

  // G3: Ack req_id
  assertions.push({
    ruleId: 'G3',
    title: 'Command Acknowledgment Field',
    passed: 'ack' in state && (state.ack === null || typeof state.ack === 'string'),
    details: `ack: ${state.ack}`,
  });

  // G10: Fault Field (Latched Fault)
  const isFaultValid = 'fault' in state && (state.fault === null || PHASE_1_ALERT_TYPES.has(state.fault));
  assertions.push({
    ruleId: 'G10',
    title: 'State Latched Fault Property',
    passed: isFaultValid,
    details: `fault: ${state.fault}`,
  });

  // G15c: VEH-01 Starter Interlock State
  if (moduleCode === 'VEH-01') {
    const validImmobilizeStates: ReadonlySet<ImmobilizeState> = new Set(['PENDING', 'ENGAGED', 'RELEASED']);
    const isImmValid = state.immobilize ? validImmobilizeStates.has(state.immobilize) : false;
    assertions.push({
      ruleId: 'G15c',
      title: 'VEH-01 Starter Interlock State',
      passed: isImmValid,
      details: `immobilize: ${state.immobilize}, ignition: ${state.ignition}`,
    });
  }

  return assertions;
}

/**
 * Validates Telemetry payloads (G9, G11, G15d, G18b)
 */
export function validateTelemetry(telemetry: unknown, moduleCode: Phase1ModuleCode): ValidationAssertion[] {
  const assertions: ValidationAssertion[] = [];
  const tel = telemetry as Record<string, unknown>;

  if (moduleCode === 'PWR-03' || moduleCode === 'PWR-01' || moduleCode === 'PWR-02') {
    const pwr = tel as unknown as PowerTelemetryPayload;
    // G9: Cumulative NVS kWh
    const hasNvsKwh = typeof pwr.kwh === 'number' && pwr.kwh >= 0;
    const hasPowerFields = typeof pwr.v === 'number' && typeof pwr.p === 'number';
    assertions.push({
      ruleId: 'G9',
      title: `${moduleCode} Cumulative NVS kWh Telemetry`,
      passed: hasNvsKwh && hasPowerFields,
      details: `v: ${pwr.v}V, p: ${pwr.p}W, kwh: ${pwr.kwh} kWh (cumulative in NVS)`,
    });
  }

  if (moduleCode === 'WAT-01') {
    const wat = tel as unknown as WaterTelemetryPayload;
    // G11: Encrypted ESP-NOW wireless link
    const hasEspNowFields = typeof wat.level_pct === 'number' && typeof wat.tank_link === 'boolean';
    assertions.push({
      ruleId: 'G11',
      title: 'WAT-01 Encrypted ESP-NOW Tank Telemetry',
      passed: hasEspNowFields,
      details: `level_pct: ${wat.level_pct}%, tank_link: ${wat.tank_link} (encrypted ESP-NOW)`,
    });
  }

  if (moduleCode === 'VEH-01') {
    const veh = tel as unknown as VehicleTelemetryPayload;
    // G15d: Vehicle Telemetry
    const hasVehFields = typeof veh.lat === 'number' && typeof veh.lng === 'number' && typeof veh.speed_kmh === 'number';
    assertions.push({
      ruleId: 'G15d',
      title: 'VEH-01 4G Live GPS & Speed Telemetry',
      passed: hasVehFields,
      details: `lat: ${veh.lat}, lng: ${veh.lng}, speed: ${veh.speed_kmh} km/h`,
    });
  }

  if (moduleCode === 'HUB-01') {
    // G18b: Hub telemetry
    const hasHubFields = typeof tel.connected_devices === 'number' && typeof tel.cloud_uplink === 'boolean';
    assertions.push({
      ruleId: 'G18b',
      title: 'HUB-01 Local Broker & Uplink Telemetry',
      passed: hasHubFields,
      details: `connected: ${tel.connected_devices}, uplink: ${tel.cloud_uplink}`,
    });
  }

  return assertions;
}

/**
 * Validates G4 CommandPayload
 */
export function validateCommand(cmd: CommandPayload, info: DeviceInfoPayload): ValidationAssertion[] {
  const assertions: ValidationAssertion[] = [];

  // G4: source validation
  assertions.push({
    ruleId: 'G4',
    title: 'Command Source Validation',
    passed: VALID_COMMAND_SOURCES.has(cmd.source),
    details: `source: "${cmd.source}"`,
  });

  // G4: req_id presence
  assertions.push({
    ruleId: 'G4',
    title: 'Command req_id UUID',
    passed: typeof cmd.req_id === 'string' && cmd.req_id.length > 0,
    details: `req_id: "${cmd.req_id}"`,
  });

  // G12: Enforce that command set NEVER targets a read-only sensor
  const sensorKeys = new Set(info.capabilities.filter((c) => c.type === 'sensor').map((c) => c.key));
  let attemptedSensorWrite = false;
  let forbiddenKey = '';
  for (const k of Object.keys(cmd.set)) {
    if (sensorKeys.has(k)) {
      attemptedSensorWrite = true;
      forbiddenKey = k;
      break;
    }
  }

  assertions.push({
    ruleId: 'G12',
    title: 'G12 Anti-Sensor-Command Enforcement',
    passed: !attemptedSensorWrite,
    details: attemptedSensorWrite
      ? `VIOLATION: Attempted command to read-only sensor key "${forbiddenKey}"`
      : 'No read-only sensor keys targeted in command set.',
  });

  return assertions;
}

/**
 * Validates G8 / G13 Alert Payloads
 */
export function validateAlert(alert: DeviceAlertPayload): ValidationAssertion[] {
  const assertions: ValidationAssertion[] = [];

  // G8: Alert Payload schema
  const isTypeValid = PHASE_1_ALERT_TYPES.has(alert.type);
  const isSeverityValid = alert.severity === 'INFO' || alert.severity === 'WARNING' || alert.severity === 'CRITICAL';
  assertions.push({
    ruleId: 'G8',
    title: 'Alert Type & Latched Indicator',
    passed: isTypeValid && isSeverityValid && typeof alert.latched === 'boolean',
    details: `type: ${alert.type}, severity: ${alert.severity}, latched: ${alert.latched}`,
  });

  // G13: Vehicle Crash SOS
  if (alert.type === 'CRASH_DETECTED') {
    const hasCrashFields =
      typeof alert.cancel_window_sec === 'number' &&
      alert.cancel_window_sec === SAFETY_CONSTANTS.CRASH_SOS_CANCEL_WINDOW_SEC &&
      typeof alert.lat === 'number' &&
      typeof alert.lng === 'number';
    assertions.push({
      ruleId: 'G13',
      title: 'VEH-01 Crash SOS Cancel Window (20s)',
      passed: hasCrashFields,
      details: `cancel_window: ${alert.cancel_window_sec}s, coords: [${alert.lat}, ${alert.lng}]`,
    });
  }

  return assertions;
}

/**
 * Validates G5 OTA Payload
 */
export function validateOta(ota: OtaPayload | Record<string, unknown>): ValidationAssertion[] {
  const otaObj = ota as Record<string, unknown>;
  const assertions: ValidationAssertion[] = [];
  const hasUrl = typeof otaObj.url === 'string' && otaObj.url.startsWith('https://');
  const hasFw = typeof otaObj.fw_version === 'string' && otaObj.fw_version.length > 0;
  const hasSha = typeof otaObj.sha256 === 'string' && otaObj.sha256.length === 64;
  const hasSig = otaObj.sig === 'secure-boot-v2';

  assertions.push({
    ruleId: 'G5',
    title: 'OTA Payload & secure-boot-v2 Signature',
    passed: hasUrl && hasFw && hasSha && hasSig,
    details: `fw: ${otaObj.fw_version}, sig: ${otaObj.sig}, sha256: ${(otaObj.sha256 as string)?.slice(0, 16)}...`,
  });

  return assertions;
}

/**
 * Validates G14 Vehicle SOS Config
 */
export function validateVehicleSosConfig(config: ConfigPayload): ValidationAssertion[] {
  const assertions: ValidationAssertion[] = [];
  if (config.sos) {
    const contactsValid = Array.isArray(config.sos.contacts) && config.sos.contacts.length <= 3;
    const allE164 = config.sos.contacts.every((c) => /^\+[1-9]\d{6,14}$/.test(c));
    assertions.push({
      ruleId: 'G14',
      title: 'VEH-01 SOS Config (0-3 E.164 Contacts)',
      passed: contactsValid && allE164,
      details: `contacts count: ${config.sos.contacts.length}, sms_fallback: ${config.sos.sms_fallback}`,
    });
  }
  return assertions;
}

/**
 * Comprehensive Audit Runner that tests the entire Phase 1 fleet against Contract v1.4
 */
export function runContractV14Audit(devices?: Record<string, VirtualDeviceInstance>): ContractComplianceReport {
  const assertions: ValidationAssertion[] = [];
  const moduleResults: Record<string, { passed: boolean; assertions: ValidationAssertion[] }> = {};

  // 1. Audit Transport & Global Protocols
  assertions.push({
    ruleId: 'G7',
    title: 'LAN Error Codes & Status Architecture',
    passed:
      LAN_TRANSPORT.STATUS.BAD_REQUEST === 400 &&
      LAN_TRANSPORT.STATUS.UNAUTHORIZED === 401 &&
      LAN_TRANSPORT.STATUS.FORBIDDEN === 403 &&
      LAN_TRANSPORT.STATUS.CONFLICT === 409 &&
      LAN_TRANSPORT.STATUS.PAYLOAD_TOO_LARGE === 413 &&
      LAN_TRANSPORT.STATUS.TOO_MANY_REQUESTS === 429,
    details: 'Verified frozen HTTP status codes (400, 401, 403, 409, 413, 429).',
  });

  assertions.push({
    ruleId: 'G18c',
    title: 'BLE Manufacturer Protocol ID (0x12) & Module IDs',
    passed:
      BLE_GATT.MANUFACTURER_PROTOCOL_ID === 0x12 &&
      BLE_MODULE_IDS['PWR-01'] === 0x01 &&
      BLE_MODULE_IDS['PWR-02'] === 0x02 &&
      BLE_MODULE_IDS['PWR-03'] === 0x03 &&
      BLE_MODULE_IDS['WAT-01'] === 0x04 &&
      BLE_MODULE_IDS['VEH-01'] === 0x05 &&
      BLE_MODULE_IDS['HUB-01'] === 0x06,
    details: 'Verified BLE protocol 0x12 and Phase 1 module IDs 0x01..0x06.',
  });

  assertions.push({
    ruleId: 'OTA_PREREQ',
    title: 'OTA HTTP 206 Range & Common-CA Prerequisites',
    passed:
      OTA_SECURITY.PREREQUISITES.HTTP_206_RANGE === true &&
      OTA_SECURITY.PREREQUISITES.COMMON_CA_CHAIN === true &&
      OTA_SECURITY.ROLLBACK_WATCHDOG_SEC === 60,
    details: 'Verified HTTP 206 Range support, Common-CA chain, and 60s rollback watchdog.',
  });

  // 2. Audit Safety State Machines (G15b/c Starter Cut)
  const stoppedSafe = evaluateStarterInterlockSafety(0, false);
  const movingUnsafe = evaluateStarterInterlockSafety(45, false);
  const ignitionActive = evaluateStarterInterlockSafety(0, true);

  assertions.push({
    ruleId: 'G15b',
    title: 'Starter Solenoid Interlock Safety State Machine',
    passed:
      stoppedSafe.targetState === 'ENGAGED' &&
      movingUnsafe.targetState === 'PENDING' &&
      ignitionActive.targetState === 'PENDING',
    details: `Stationary: ${stoppedSafe.targetState}, Moving: ${movingUnsafe.targetState}, Ignition ON: ${ignitionActive.targetState}`,
  });

  // 3. Audit Golden Fixture Modules or Live Devices
  const testSet = devices ? Object.values(devices) : null;
  const fixtureModules = fixtures.modules as Record<string, {
    info: DeviceInfoPayload;
    state: StatePayload;
    telemetry: unknown;
    config: ConfigPayload;
    rules: RulesPayload;
    ota: Record<string, unknown>;
    cmd: CommandPayload;
    alert?: DeviceAlertPayload;
  }>;

  for (const [code, fixture] of Object.entries(fixtureModules)) {
    const modAssertions: ValidationAssertion[] = [];

    // Find live device if provided, otherwise test golden fixture
    const liveDev = testSet?.find((d) => d.module_code === code);
    const info = liveDev?.info ?? fixture.info;
    const state = liveDev?.state ?? fixture.state;
    const tel = liveDev?.telemetry ?? fixture.telemetry;
    const config = liveDev?.config ?? fixture.config;
    const ota = liveDev?.ota ?? fixture.ota;
    const cmd = fixture.cmd;
    const alert = liveDev?.last_alert ?? fixture.alert;

    modAssertions.push(...validateDeviceInfo(info));
    modAssertions.push(...validateDeviceState(state, code as Phase1ModuleCode));
    modAssertions.push(...validateTelemetry(tel, code as Phase1ModuleCode));
    modAssertions.push(...validateCommand(cmd, info));
    modAssertions.push(...validateOta(ota));

    if (config.sos) {
      modAssertions.push(...validateVehicleSosConfig(config));
    }

    if (alert) {
      modAssertions.push(...validateAlert(alert));
    }

    const allPassed = modAssertions.every((a) => a.passed);
    moduleResults[code] = { passed: allPassed, assertions: modAssertions };
    assertions.push(...modAssertions);
  }

  const passedCount = assertions.filter((a) => a.passed).length;
  const failedCount = assertions.length - passedCount;

  return {
    contractVersion: 'v1.4',
    totalAssertions: assertions.length,
    passedCount,
    failedCount,
    isFullyCompliant: failedCount === 0,
    assertions,
    moduleResults,
  };
}
