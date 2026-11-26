/**
 * DD oodle Smart Home — Headless Dev-Mode Virtual Device Simulator Engine (v1.4)
 *
 * Implements frozen Protocol Contract v1.4 rules (G8–G18):
 * - G8: Alert payload { ts, type, severity, value?, limit?, latched }
 * - G9: PWR-03 telemetry { ts, v, i, p, pf, kwh } (cumulative NVS kWh)
 * - G10: State fault: AlertType | null + latched fault locking + 3s physical button clear
 * - G11: WAT-01 telemetry { ts, level_pct, level_cm, flow_lpm, pump, tank_batt_pct, tank_rssi, tank_link }
 * - G12: Read-only sensor capabilities (never emit .../cmd for sensor keys)
 * - G13-G15: VEH-01 starter interlock { immobilize: boolean }, PENDING/ENGAGED/RELEASED state machine
 * - G16-G18: HUB-01 members topic, permit_join 180s auto-off, and RULE_REJECTED enforcement
 */

import fixtures from '../../contract/contract_v1.4_fixtures.json';
import { buildCanonicalDevices } from '../data/canonicalSeed';
import {
  AlertType,
  buildMqttTopic,
  CommandPayload,
  CommandSource,
  ConfigPayload,
  DeviceAlertPayload,
  DeviceStateMap,
  evaluateStarterInterlockSafety,
  ImmobilizeState,
  HubTelemetryPayload,
  ModuleCode,
  OperationMode,
  Phase1ActiveAlertType,
  Phase1ModuleCode,
  PowerTelemetryPayload,
  RulesPayload,
  SAFETY_CONSTANTS,
  validateGuardrailUpdate,
  VehicleTelemetryPayload,
  WaterTelemetryPayload,
} from '../protocol/contract';
import { ActiveTransportTier, CONNECTIVITY_PILL_MAP } from '../protocol/transports';
import {
  ActiveCrashSosSession,
  SimulatorFaultInjection,
  SimulatorPacketLog,
  SimulatorSnapshot,
  VirtualDeviceInstance,
} from './types';

type SimulatorListener = (snapshot: SimulatorSnapshot) => void;

const MAX_PACKET_LOG_ENTRIES = 120;

/** Sample NH-2 / Imphal loop coordinates for realistic MapLibre vehicle movement */
const VEH01_ROUTE_WAYPOINTS: ReadonlyArray<{ lat: number; lng: number; heading: number }> = [
  { lat: 24.3334, lng: 93.6795, heading: 180 },
  { lat: 24.3318, lng: 93.6799, heading: 168 },
  { lat: 24.3301, lng: 93.6808, heading: 152 },
  { lat: 24.3289, lng: 93.6825, heading: 118 },
  { lat: 24.3292, lng: 93.6844, heading: 82 },
  { lat: 24.3310, lng: 93.6851, heading: 18 },
  { lat: 24.3330, lng: 93.6842, heading: 335 },
  { lat: 24.3342, lng: 93.6819, heading: 290 },
];

export class VirtualDeviceSimulatorEngine {
  private homeId: string;
  private devices: Record<string, VirtualDeviceInstance>;
  private faults: SimulatorFaultInjection;
  private activeTransport: ActiveTransportTier = 'CLOUD';
  private activeCrashSos: ActiveCrashSosSession | null = null;
  private packetLog: SimulatorPacketLog[] = [];
  private listeners = new Set<SimulatorListener>();
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private routeIdx = 0;
  private dryRunElapsedSec = 0;
  private geyserElapsedSec = 0;
  private pendingImmobilize = false;
  private hubPermitJoinSec = 0;

  constructor() {
    this.homeId = fixtures.home_id;
    this.devices = this.hydrateFromFixtures();
    this.faults = {
      cloudOutage: false,
      wifiRouterDown: false,
      bleInRange: true,
      dryRunNoWaterFlow: false,
      mainsPowerCut: false,
      tankLinkLost: false,
      overloadTrip: false,
      timeScaleMultiplier: 1,
    };
  }

  private hydrateFromFixtures(): Record<string, VirtualDeviceInstance> {
    return buildCanonicalDevices();
  }

  public subscribe(listener: SimulatorListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): SimulatorSnapshot {
    return {
      home_id: this.homeId,
      activeTransport: this.activeTransport,
      devices: structuredClone(this.devices),
      faults: { ...this.faults },
      activeCrashSos: this.activeCrashSos ? structuredClone(this.activeCrashSos) : null,
      packetLog: [...this.packetLog],
      running: this.tickHandle !== null,
    };
  }

  public start(intervalMs: number = 1000): void {
    if (this.tickHandle !== null) return;
    this.tickHandle = setInterval(() => this.tick(), intervalMs);
    this.emit();
  }

  public stop(): void {
    if (this.tickHandle !== null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
      this.emit();
    }
  }

  public reset(): void {
    this.stop();
    this.devices = this.hydrateFromFixtures();
    this.activeCrashSos = null;
    this.packetLog = [];
    this.routeIdx = 0;
    this.dryRunElapsedSec = 0;
    this.geyserElapsedSec = 0;
    this.pendingImmobilize = false;
    this.hubPermitJoinSec = 0;
    this.faults = {
      cloudOutage: false,
      wifiRouterDown: false,
      bleInRange: true,
      dryRunNoWaterFlow: false,
      mainsPowerCut: false,
      tankLinkLost: false,
      overloadTrip: false,
      timeScaleMultiplier: 1,
    };
    this.activeTransport = 'CLOUD';
    this.emit();
  }

  public setFaults(patch: Partial<SimulatorFaultInjection>): void {
    this.faults = { ...this.faults, ...patch };
    this.recomputeActiveTransport();
    this.emit();
  }

  public registerOrUpdateDevice(instance: VirtualDeviceInstance): void {
    this.devices[instance.device_id] = structuredClone(instance);
    this.logPacket(
      'SYSTEM',
      'info',
      buildMqttTopic(this.homeId, instance.device_id, 'info'),
      instance.info
    );
    this.emit();
  }

  public syncExternalDevices(externalDevices: Record<string, VirtualDeviceInstance>): void {
    let added = false;
    for (const [id, dev] of Object.entries(externalDevices)) {
      if (!this.devices[id]) {
        this.devices[id] = structuredClone(dev);
        added = true;
      }
    }
    if (added) {
      this.emit();
    }
  }

  public setTransportModeOverride(mode: OperationMode): void {
    this.activeTransport = CONNECTIVITY_PILL_MAP[mode].tier;
    for (const dev of Object.values(this.devices)) {
      dev.state.operation_mode = mode;
      dev.config.operation_mode = mode;
    }
    this.logPacket('SYSTEM', 'transport', `ddoodle/${this.homeId}/system/mode`, {
      operation_mode: mode,
      transport_tier: this.activeTransport,
    });
    this.emit();
  }

  private recomputeActiveTransport(): void {
    let targetMode: OperationMode = 'CLOUD_DIRECT';
    const hubOnline = this.findByModule('HUB-01')?.status === 'online';

    if (!this.faults.cloudOutage && !this.faults.wifiRouterDown) {
      targetMode = 'CLOUD_DIRECT';
    } else if (this.faults.cloudOutage && !this.faults.wifiRouterDown) {
      targetMode = hubOnline ? 'LOCAL_HUB' : 'LAN_ONLY';
    } else if (this.faults.wifiRouterDown && this.faults.bleInRange) {
      targetMode = 'BLE_ONLY';
    } else {
      targetMode = 'FAILSAFE_MANUAL';
    }

    this.activeTransport = CONNECTIVITY_PILL_MAP[targetMode].tier;
    for (const dev of Object.values(this.devices)) {
      dev.state.operation_mode = targetMode;
    }
  }

  /**
   * G10 & G12: Sends command (.../cmd) with latched fault check and sensor safety.
   */
  public sendCommand(
    deviceId: string,
    set: DeviceStateMap,
    source: CommandSource = 'pwa_cloud'
  ): { accepted: boolean; reqId: string; warning?: string } {
    const dev = this.devices[deviceId];
    const reqId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (!dev) {
      return { accepted: false, reqId, warning: `Device ${deviceId} not found.` };
    }

    if (this.activeTransport === 'MANUAL_FAILSAFE' && source !== 'wall_switch') {
      return {
        accepted: false,
        reqId,
        warning: 'Device is in FAILSAFE_MANUAL mode — only physical wall switches operate.',
      };
    }

    // G10: Check for latched fault. When fault !== null, lock load-ON controls
    if (dev.state.fault !== null) {
      const isTurningLoadOn = Object.entries(set).some(([k, v]) => {
        if (k === 'ch1' || k === 'ch2' || k === 'ch3' || k === 'ch4' || k === 'pump_on') {
          return v === true;
        }
        if (k === 'fan_speed' || k === 'dimmer_pct') {
          return Number(v) > 0;
        }
        return false;
      });

      if (isTurningLoadOn) {
        return {
          accepted: false,
          reqId,
          warning: `Hardware safety lock: Latched fault [${dev.state.fault}] active. Requires 3 s physical button hold on device to clear (no remote clear).`,
        };
      }
    }

    // G12: Enforce read-only sensor check (never allow .../cmd on sensor keys)
    const readOnlyKeys = dev.info.capabilities
      .filter((c) => c.type === 'sensor')
      .map((c) => c.key);
    for (const k of Object.keys(set)) {
      if (readOnlyKeys.includes(k)) {
        return {
          accepted: false,
          reqId,
          warning: `G12 violation: "${k}" is a strictly read-only sensor capability. Commands cannot mutate sensor keys.`,
        };
      }
    }

    // G17: Local rules on HUB-01 cannot command VEH-01 immobilize or guardrails
    if (source === 'rule' && (set.immobilize !== undefined || set.guardrails !== undefined)) {
      const alert: DeviceAlertPayload = {
        ts: Math.floor(Date.now() / 1000),
        type: 'RULE_REJECTED',
        severity: 'WARNING',
        latched: false,
        message: 'G17 violation: Local automation rule attempted to command vehicle starter lock or guardrails.',
      };
      dev.last_alert = alert;
      this.logPacket('RX_ALERT', 'alert', buildMqttTopic(this.homeId, deviceId, 'alert'), alert);
      return {
        accepted: false,
        reqId,
        warning: 'Rule rejected: Local hub rules cannot actuate vehicle starter lock or alter guardrails.',
      };
    }

    const cmdPayload: CommandPayload = { req_id: reqId, source, set };
    this.logPacket('TX_CMD', 'cmd', buildMqttTopic(this.homeId, deviceId, 'cmd'), cmdPayload);

    // G15b: VEH-01 Starter Interlock Logic
    if (dev.module_code === 'VEH-01' && set.immobilize !== undefined) {
      const vehTel = dev.telemetry as VehicleTelemetryPayload;
      const targetImmobilize = Boolean(set.immobilize);

      if (targetImmobilize) {
        const safety = evaluateStarterInterlockSafety(vehTel.speed_kmh, vehTel.ignition);
        if (safety.targetState === 'PENDING') {
          this.pendingImmobilize = true;
          dev.state.immobilize = 'PENDING';
          dev.state.immobilize_reason = safety.reason;
          vehTel.immobilize_status = 'PENDING';
          this.emit();
          return {
            accepted: true,
            reqId,
            warning: safety.reason,
          };
        } else {
          dev.state.immobilize = 'ENGAGED';
          dev.state.immobilize_reason = 'Starter solenoid cut engaged.';
          vehTel.immobilize_status = 'ENGAGED';
        }
      } else {
        this.pendingImmobilize = false;
        dev.state.immobilize = 'RELEASED';
        dev.state.immobilize_reason = 'Starter released - normal operation.';
        vehTel.immobilize_status = 'RELEASED';
      }
    }

    dev.state = {
      ...dev.state,
      ts: Math.floor(Date.now() / 1000),
      ack: reqId,
      manual_override: source === 'wall_switch',
      state: {
        ...dev.state.state,
        ...set,
      },
    };

    if (dev.module_code === 'PWR-03' && set.ch1 === false) {
      this.geyserElapsedSec = 0;
    }
    if (dev.module_code === 'WAT-01' && set.pump_on === false) {
      this.dryRunElapsedSec = 0;
    }

    this.logPacket('RX_STATE', 'state', buildMqttTopic(this.homeId, deviceId, 'state'), dev.state);
    this.emit();
    return { accepted: true, reqId };
  }

  /**
   * G10: Simulates holding the physical hardware button on the device for 3 seconds
   * to clear a latched fault (no remote clear permitted).
   */
  public clearPhysicalFault(deviceId: string): boolean {
    const dev = this.devices[deviceId];
    if (!dev || dev.state.fault === null) return false;

    const clearedFault = dev.state.fault;
    dev.state.fault = null;
    if (dev.last_alert) {
      dev.last_alert.latched = false;
    }

    this.logPacket('SYSTEM', 'state', buildMqttTopic(this.homeId, deviceId, 'state'), {
      cleared_fault: clearedFault,
      reason: '3s physical device button hold verified — latched fault cleared.',
      ts: Math.floor(Date.now() / 1000),
    });
    this.emit();
    return true;
  }

  /**
   * G8 & G10: Triggers an OVERLOAD trip on PWR-03 (or specified device).
   * Trips relays OFF, sets latched fault, and requires 3s physical button hold to clear.
   */
  public triggerOverloadFault(deviceId?: string): void {
    const dev = deviceId ? this.devices[deviceId] : this.findByModule('PWR-03');
    if (!dev) return;

    const nowSec = Math.floor(Date.now() / 1000);
    // Trip load relays OFF
    if (dev.state.state.ch1 !== undefined) dev.state.state.ch1 = false;
    if (dev.state.state.ch2 !== undefined) dev.state.state.ch2 = false;
    if (dev.state.state.ch3 !== undefined) dev.state.state.ch3 = false;
    if (dev.state.state.ch4 !== undefined) dev.state.state.ch4 = false;
    if (dev.state.state.pump_on !== undefined) dev.state.state.pump_on = false;

    dev.state.fault = 'OVERLOAD';
    if (dev.telemetry && 'p' in dev.telemetry) {
      (dev.telemetry as PowerTelemetryPayload).p = 0;
      (dev.telemetry as PowerTelemetryPayload).i = 0;
    }

    const alert: DeviceAlertPayload = {
      ts: nowSec,
      type: 'OVERLOAD',
      severity: 'CRITICAL',
      latched: true,
      value: 18.4,
      limit: 16.0,
      message: 'G8 / G10 Cutoff: Current exceeded 16A hardware rating (18.4A detected). Relays tripped OFF. Requires 3 s button hold on device to clear.',
    };

    dev.last_alert = alert;
    this.logPacket('RX_ALERT', 'alert', buildMqttTopic(this.homeId, dev.device_id, 'alert'), alert);
    this.logPacket('RX_STATE', 'state', buildMqttTopic(this.homeId, dev.device_id, 'state'), dev.state);
    this.emit();
  }

  /**
   * G18a: Triggers HUB-01 permit_join 180s pairing window
   */
  public togglePermitJoin(): boolean {
    const hub = this.findByModule('HUB-01');
    if (!hub) return false;

    if (hub.info.permit_join) {
      hub.info.permit_join = false;
      this.hubPermitJoinSec = 0;
    } else {
      hub.info.permit_join = true;
      this.hubPermitJoinSec = SAFETY_CONSTANTS.HUB_PERMIT_JOIN_TIMEOUT_SEC;
    }
    hub.info.permit_join_timeout_sec = this.hubPermitJoinSec;
    this.logPacket('SYSTEM', 'info', buildMqttTopic(this.homeId, hub.device_id, 'info'), hub.info);
    this.emit();
    return hub.info.permit_join;
  }

  public updateConfig(deviceId: string, nextConfig: ConfigPayload): { ok: boolean; error?: string } {
    const dev = this.devices[deviceId];
    if (!dev) return { ok: false, error: 'Device not found.' };

    const check = validateGuardrailUpdate(dev.module_code, dev.config.guardrails, nextConfig.guardrails);
    if (!check.valid) {
      return { ok: false, error: check.reason };
    }

    dev.config = structuredClone(nextConfig);
    this.logPacket('TX_CONFIG', 'config', buildMqttTopic(this.homeId, deviceId, 'config'), dev.config);
    this.emit();
    return { ok: true };
  }

  public updateRules(deviceId: string, nextRules: RulesPayload): boolean {
    const dev = this.devices[deviceId];
    if (!dev) return false;
    dev.rules = structuredClone(nextRules);
    this.logPacket('TX_RULES', 'rules', buildMqttTopic(this.homeId, deviceId, 'rules'), dev.rules);
    this.emit();
    return true;
  }

  /**
   * G13a: Triggers VEH-01 CRASH_DETECTED alert (up to 3 publishes sharing ts: T0, cancel, T+20s).
   */
  public triggerVehicleCrash(gForce: number = 6.4, tiltDeg: number = 78): ActiveCrashSosSession | null {
    const veh = this.findByModule('VEH-01');
    if (!veh) return null;

    const tel = veh.telemetry as VehicleTelemetryPayload;
    const nowSec = Math.floor(Date.now() / 1000);

    const alert: DeviceAlertPayload = {
      ts: nowSec,
      type: 'CRASH_DETECTED',
      severity: 'CRITICAL',
      latched: true,
      g_force: gForce,
      tilt_deg: tiltDeg,
      lat: tel.lat,
      lng: tel.lng,
      cancel_window_sec: SAFETY_CONSTANTS.CRASH_SOS_CANCEL_WINDOW_SEC,
      cancelled: false,
    };

    tel.speed_kmh = 0;
    veh.last_alert = alert;

    this.activeCrashSos = {
      incident_id: `inc_${nowSec}`,
      device_id: veh.device_id,
      alert,
      started_at_ms: Date.now(),
      remaining_sec: SAFETY_CONSTANTS.CRASH_SOS_CANCEL_WINDOW_SEC,
      status: 'countdown',
      escalated_channels: [],
    };

    this.logPacket('RX_ALERT', 'alert', buildMqttTopic(this.homeId, veh.device_id, 'alert'), alert);
    this.emit();
    return this.activeCrashSos;
  }

  /**
   * G13b: Cancels active Crash SOS during 20s cancel window. Shares original ts.
   */
  public cancelCrashSos(): boolean {
    if (!this.activeCrashSos || this.activeCrashSos.status !== 'countdown') {
      return false;
    }
    this.activeCrashSos.status = 'cancelled_by_user';
    this.activeCrashSos.alert.cancelled = true;
    this.activeCrashSos.remaining_sec = 0;

    const veh = this.devices[this.activeCrashSos.device_id];
    if (veh) {
      veh.last_alert = structuredClone(this.activeCrashSos.alert);
      this.logPacket('RX_ALERT', 'alert', buildMqttTopic(this.homeId, veh.device_id, 'alert'), this.activeCrashSos.alert);
    }
    this.emit();
    return true;
  }

  /**
   * G13c & G13d: Triggers SOS_MANUAL, EXT_POWER_LOST or LOW_BATTERY alert
   */
  public triggerVehicleFaultAlert(type: 'SOS_MANUAL' | 'EXT_POWER_LOST' | 'LOW_BATTERY'): void {
    const veh = this.findByModule('VEH-01');
    if (!veh) return;
    const tel = veh.telemetry as VehicleTelemetryPayload;
    const nowSec = Math.floor(Date.now() / 1000);

    let alert: DeviceAlertPayload;
    if (type === 'EXT_POWER_LOST') {
      tel.ext_v = 5.2; // < 6.0 V
      alert = {
        ts: nowSec,
        type: 'EXT_POWER_LOST',
        severity: 'WARNING',
        latched: true,
        value: 5.2,
        limit: 6.0,
        message: 'Vehicle main battery cut/disconnected (<6.0 V for >2 s). Switched to internal backup cell.',
      };
    } else if (type === 'LOW_BATTERY') {
      tel.bat_pct = 12; // <= 15%
      alert = {
        ts: nowSec,
        type: 'LOW_BATTERY',
        severity: 'WARNING',
        latched: true,
        value: 12,
        limit: 15,
        message: 'VEH-01 internal backup battery critical (<=15%). Connect external power.',
      };
    } else {
      alert = {
        ts: nowSec,
        type: 'SOS_MANUAL',
        severity: 'CRITICAL',
        latched: true,
        lat: tel.lat,
        lng: tel.lng,
        message: 'Driver pressed SOS Emergency Button in vehicle.',
      };
    }

    veh.last_alert = alert;
    this.logPacket('RX_ALERT', 'alert', buildMqttTopic(this.homeId, veh.device_id, 'alert'), alert);
    this.emit();
  }

  private tick(): void {
    const nowSec = Math.floor(Date.now() / 1000);
    const dtSec = Math.max(1, this.faults.timeScaleMultiplier);

    this.tickCrashCountdown();
    this.tickPwr03Geyser(nowSec, dtSec);
    this.tickWat01Tank(nowSec, dtSec);
    this.tickVeh01(nowSec);
    this.tickHub01(nowSec, dtSec);
    this.emit();
  }

  private tickCrashCountdown(): void {
    if (!this.activeCrashSos || this.activeCrashSos.status !== 'countdown') return;

    this.activeCrashSos.remaining_sec = Math.max(0, this.activeCrashSos.remaining_sec - 1);
    if (this.activeCrashSos.remaining_sec === 0) {
      this.activeCrashSos.status = 'escalated';
      this.activeCrashSos.escalated_channels = ['SMS', 'WHATSAPP', 'VOICE_CALL', 'FCM_FAMILY', 'ADMIN_TICKET'];
      this.logPacket('SYSTEM', 'alert', `ddoodle/${this.homeId}/sos/escalated`, {
        incident_id: this.activeCrashSos.incident_id,
        channels: this.activeCrashSos.escalated_channels,
        lat: this.activeCrashSos.alert.lat,
        lng: this.activeCrashSos.alert.lng,
        g_force: this.activeCrashSos.alert.g_force,
      });
    }
  }

  /**
   * G9: PWR-03 Geyser Telemetry & Max-Runtime Guardrail
   */
  private tickPwr03Geyser(nowSec: number, dtSec: number): void {
    const geyser = this.findByModule('PWR-03');
    if (!geyser) return;
    const tel = geyser.telemetry as PowerTelemetryPayload;
    const isOn = geyser.state.state.ch1 === true;

    if (isOn) {
      this.geyserElapsedSec += dtSec;
      const runtimeMin = this.geyserElapsedSec / 60;
      const maxMin = geyser.config.guardrails.max_runtime_min ?? SAFETY_CONSTANTS.PWR03_DEFAULT_RUNTIME_MIN;

      tel.v = 230.5;
      tel.i = 8.9;
      tel.p = 2050;
      tel.pf = 0.99;
      tel.runtime_min = Number(runtimeMin.toFixed(1));
      // G9: Cumulative NVS kWh accumulation
      tel.kwh = Number((tel.kwh + (tel.p / 1000) * (dtSec / 3600)).toFixed(4));
      tel.ts = nowSec;

      // Hard-locked safety cutoff: Auto cut-off after max_runtime_min
      if (runtimeMin >= maxMin) {
        geyser.state.state.ch1 = false;
        geyser.state.fault = 'RUNTIME_LIMIT'; // G10
        tel.p = 0;
        tel.i = 0;
        this.geyserElapsedSec = 0;
        const alert: DeviceAlertPayload = {
          ts: nowSec,
          type: 'RUNTIME_LIMIT',
          severity: 'WARNING',
          latched: true, // G8
          value: maxMin,
          limit: maxMin,
          message: `G10 Hardware Cutoff: PWR-03 auto-off triggered after ${maxMin} min safety ceiling. Requires 3 s button hold on device to clear.`,
        };
        geyser.last_alert = alert;
        this.logPacket('RX_ALERT', 'alert', buildMqttTopic(this.homeId, geyser.device_id, 'alert'), alert);
        this.logPacket('RX_STATE', 'state', buildMqttTopic(this.homeId, geyser.device_id, 'state'), geyser.state);
      }
    } else {
      tel.p = 0;
      tel.i = 0;
      tel.runtime_min = 0;
      tel.ts = nowSec;
    }
  }

  /**
   * G11: WAT-01 Tank Telemetry & Dry-Run Guardrail
   */
  private tickWat01Tank(nowSec: number, dtSec: number): void {
    const wat = this.findByModule('WAT-01');
    if (!wat) return;
    const tel = wat.telemetry as WaterTelemetryPayload;
    const pumpOn = wat.state.state.pump_on === true;

    // G11: Handle tank_link fault
    tel.tank_link = !this.faults.tankLinkLost;
    if (this.faults.tankLinkLost && (!wat.last_alert || wat.last_alert.type !== 'TANK_LINK_LOST')) {
      const alert: DeviceAlertPayload = {
        ts: nowSec,
        type: 'TANK_LINK_LOST',
        severity: 'WARNING',
        latched: true,
        message: 'G11 Alert: Encrypted ESP-NOW wireless link to overhead tank sensor lost. Retrying auto-reconnect.',
      };
      wat.last_alert = alert;
      wat.state.fault = 'TANK_LINK_LOST';
      this.logPacket('RX_ALERT', 'alert', buildMqttTopic(this.homeId, wat.device_id, 'alert'), alert);
    }

    if (pumpOn) {
      if (this.faults.dryRunNoWaterFlow) {
        tel.flow_lpm = 0;
        this.dryRunElapsedSec += dtSec;
        const timeoutSec = wat.config.guardrails.dry_run_timeout_sec ?? SAFETY_CONSTANTS.WAT01_DEFAULT_DRY_RUN_SEC;

        if (this.dryRunElapsedSec >= timeoutSec) {
          wat.state.state.pump_on = false;
          wat.state.fault = 'DRY_RUN_FAULT'; // G10
          this.dryRunElapsedSec = 0;
          const alert: DeviceAlertPayload = {
            ts: nowSec,
            type: 'DRY_RUN_FAULT',
            severity: 'CRITICAL',
            latched: true, // G8
            value: timeoutSec,
            limit: timeoutSec,
            message: `G10 Hardware Cutoff: Dry-run fault triggered after ${timeoutSec}s with 0 L/min flow. Requires 3 s button hold on device to clear.`,
          };
          wat.last_alert = alert;
          this.logPacket('RX_ALERT', 'alert', buildMqttTopic(this.homeId, wat.device_id, 'alert'), alert);
          this.logPacket('RX_STATE', 'state', buildMqttTopic(this.homeId, wat.device_id, 'state'), wat.state);
        }
      } else {
        tel.flow_lpm = 18.5;
        this.dryRunElapsedSec = 0;
        tel.level_pct = Math.min(100, Number((tel.level_pct + 0.5 * dtSec).toFixed(1)));
        tel.level_cm = Math.round(tel.level_pct * 2); // 200 cm tank
        const highPct = Number(wat.state.state.auto_high_pct ?? 90);
        if (wat.state.state.auto_fill === true && tel.level_pct >= highPct) {
          wat.state.state.pump_on = false;
          tel.flow_lpm = 0;
        }
      }
    } else {
      tel.flow_lpm = 0;
      tel.level_pct = Math.max(5, Number((tel.level_pct - 0.05 * dtSec).toFixed(2)));
      tel.level_cm = Math.round(tel.level_pct * 2);
      const lowPct = Number(wat.state.state.auto_low_pct ?? 25);
      if (wat.state.state.auto_fill === true && tel.level_pct <= lowPct && wat.state.fault === null) {
        wat.state.state.pump_on = true;
      }
    }
    tel.ts = nowSec;
  }

  /**
   * G13–G15: VEH-01 Vehicle Telemetry & Starter Interlock
   */
  private tickVeh01(nowSec: number): void {
    const veh = this.findByModule('VEH-01');
    if (!veh) return;
    const tel = veh.telemetry as VehicleTelemetryPayload;

    if (this.activeCrashSos?.status === 'countdown' || this.activeCrashSos?.status === 'escalated') {
      tel.speed_kmh = 0;
      tel.ts = nowSec;
      return;
    }

    if (tel.ignition && veh.state.immobilize !== 'ENGAGED') {
      if (this.pendingImmobilize) {
        // Vehicle is slowing down
        tel.speed_kmh = Math.max(0, Number((tel.speed_kmh - 8).toFixed(1)));
        if (tel.speed_kmh < SAFETY_CONSTANTS.IMMOBILIZER_MAX_SAFE_SPEED_KMH) {
          // G15b: Starter solenoid cut engages safely once stopped and ignition turned off
          tel.speed_kmh = 0;
          tel.ignition = false;
          veh.state.ignition = false;
          veh.state.immobilize = 'ENGAGED';
          veh.state.immobilize_reason = 'Vehicle stopped (<5 km/h) & ignition OFF. Starter solenoid cut engaged.';
          tel.immobilize_status = 'ENGAGED';
          this.pendingImmobilize = false;
          this.logPacket('RX_STATE', 'state', buildMqttTopic(this.homeId, veh.device_id, 'state'), veh.state);
        }
      } else {
        this.routeIdx = (this.routeIdx + 1) % VEH01_ROUTE_WAYPOINTS.length;
        const wp = VEH01_ROUTE_WAYPOINTS[this.routeIdx];
        tel.lat = wp.lat;
        tel.lng = wp.lng;
        tel.heading = wp.heading;
        tel.speed_kmh = Number((32 + (this.routeIdx % 4) * 6.5).toFixed(1));
      }
    } else {
      tel.speed_kmh = 0;
    }
    tel.ts = nowSec;
  }

  /**
   * G18: HUB-01 permit_join 180s countdown
   */
  private tickHub01(nowSec: number, dtSec: number): void {
    const hub = this.findByModule('HUB-01');
    if (!hub) return;
    const tel = hub.telemetry as HubTelemetryPayload;
    tel.ts = nowSec;

    if (hub.info.permit_join && this.hubPermitJoinSec > 0) {
      this.hubPermitJoinSec = Math.max(0, this.hubPermitJoinSec - dtSec);
      hub.info.permit_join_timeout_sec = this.hubPermitJoinSec;
      if (this.hubPermitJoinSec === 0) {
        hub.info.permit_join = false;
        this.logPacket('SYSTEM', 'info', buildMqttTopic(this.homeId, hub.device_id, 'info'), hub.info);
      }
    }
  }

  private findByModule(code: Phase1ModuleCode): VirtualDeviceInstance | undefined {
    return Object.values(this.devices).find((d) => d.module_code === code);
  }

  private logPacket(
    direction: SimulatorPacketLog['direction'],
    channel: SimulatorPacketLog['channel'],
    topic: string,
    payload: unknown
  ): void {
    this.packetLog.unshift({
      id: `pkt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      direction,
      transport: this.activeTransport,
      topic,
      channel,
      payload,
    });
    if (this.packetLog.length > MAX_PACKET_LOG_ENTRIES) {
      this.packetLog.length = MAX_PACKET_LOG_ENTRIES;
    }
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}

export const simulatorEngine = new VirtualDeviceSimulatorEngine();
