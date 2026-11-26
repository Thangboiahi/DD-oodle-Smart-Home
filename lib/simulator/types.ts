/**
 * DD oodle Smart Home — Dev-Mode Virtual Device Simulator Types
 * Mirrors exact Protocol Contract v1.4 topics and payloads across all 6 Phase 1 modules.
 */

import {
  AlertPayload,
  CommandPayload,
  ConfigPayload,
  DeviceAlertPayload,
  DeviceInfoPayload,
  DeviceLwtStatus,
  ModuleCode,
  MqttTopicChannel,
  OperationMode,
  OtaPayload,
  Phase1ModuleCode,
  RulesPayload,
  StatePayload,
  TelemetryPayload,
} from '../protocol/contract';
import { ActiveTransportTier } from '../protocol/transports';

export interface VirtualDeviceInstance {
  device_id: string;
  module_code: ModuleCode;
  room_id: string;
  name: string;
  local_pin: string;
  status: DeviceLwtStatus;
  info: DeviceInfoPayload;
  state: StatePayload;
  telemetry: TelemetryPayload;
  config: ConfigPayload;
  rules: RulesPayload;
  ota: OtaPayload;
  last_alert: AlertPayload | null;
}

export interface SimulatorFaultInjection {
  cloudOutage: boolean;
  wifiRouterDown: boolean;
  bleInRange: boolean;
  dryRunNoWaterFlow: boolean;
  mainsPowerCut: boolean;
  tankLinkLost: boolean; // G11 fault injection
  overloadTrip: boolean; // G8 fault injection
  timeScaleMultiplier: number; // e.g., 1x normal or 60x to test PWR-03 45-min cutoff quickly
}

export interface ActiveCrashSosSession {
  incident_id: string;
  device_id: string;
  alert: DeviceAlertPayload;
  started_at_ms: number;
  remaining_sec: number;
  status: 'countdown' | 'cancelled_by_user' | 'escalated';
  escalated_channels: ('SMS' | 'WHATSAPP' | 'VOICE_CALL' | 'FCM_FAMILY' | 'ADMIN_TICKET')[];
}

export interface SimulatorPacketLog {
  id: string;
  ts: number;
  direction: 'TX_CMD' | 'RX_STATE' | 'RX_TELEMETRY' | 'RX_ALERT' | 'TX_CONFIG' | 'TX_RULES' | 'SYSTEM';
  transport: ActiveTransportTier;
  topic: string;
  channel: MqttTopicChannel | 'transport';
  payload: unknown;
}

export interface SimulatorSnapshot {
  home_id: string;
  activeTransport: ActiveTransportTier;
  devices: Record<string, VirtualDeviceInstance>;
  faults: SimulatorFaultInjection;
  activeCrashSos: ActiveCrashSosSession | null;
  packetLog: SimulatorPacketLog[];
  running: boolean;
}
