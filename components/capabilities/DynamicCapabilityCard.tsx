'use client';

import React, { useState } from 'react';
import {
  Power,
  Zap,
  Gauge,
  Droplets,
  AlertTriangle,
  Lock,
  Unlock,
  Sliders,
  ShieldCheck,
  RotateCcw,
  Navigation,
  Compass,
  BatteryCharging,
  Flame,
  CheckCircle,
  ExternalLink,
  Shield,
  Activity,
  Radio,
  Battery,
  AlertOctagon,
  KeyRound,
  Signal,
  SignalZero,
} from 'lucide-react';
import {
  DeviceCapability,
  LevelCapability,
  PowerTelemetryPayload,
  ReadOnlySensorCapability,
  VehicleTelemetryPayload,
  WaterTelemetryPayload,
  evaluateStarterInterlockSafety,
} from '@/lib/protocol/contract';
import { VirtualDeviceInstance } from '@/lib/simulator/types';
import { simulatorEngine } from '@/lib/simulator/engine';

interface DynamicCapabilityCardProps {
  device: VirtualDeviceInstance;
  tariffInr?: number;
  onSendCommand: (deviceId: string, set: Record<string, boolean | number | string>) => void;
  onTriggerCrash?: () => void;
  onOpenLocalAccess?: (deviceId: string, pin: string) => void;
}

export const DynamicCapabilityCard: React.FC<DynamicCapabilityCardProps> = ({
  device,
  tariffInr = 7.5,
  onSendCommand,
  onTriggerCrash,
  onOpenLocalAccess,
}) => {
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, boolean | number | string>>({});
  const [immobilizerConfirm, setImmobilizerConfirm] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [holdingButton, setHoldingButton] = useState(false);

  // Merge confirmed device state with pending optimistic user interactions
  const optimisticState = { ...device.state.state, ...optimisticOverrides };
  const hasLatchedFault = device.state.fault !== null;

  const handleToggle = (key: string) => {
    if (hasLatchedFault) {
      alert(`Safety Lock: Cannot turn ON while fault [${device.state.fault}] is active. Requires 3-second physical device button hold to clear.`);
      return;
    }
    const currentVal = Boolean(optimisticState[key]);
    const nextVal = !currentVal;
    setOptimisticOverrides((prev) => ({ ...prev, [key]: nextVal }));
    onSendCommand(device.device_id, { [key]: nextVal });
  };

  const handleLevelChange = (key: string, val: number) => {
    if (hasLatchedFault && val > 0) {
      alert(`Safety Lock: Cannot engage load while fault [${device.state.fault}] is active.`);
      return;
    }
    setOptimisticOverrides((prev) => ({ ...prev, [key]: val }));
    onSendCommand(device.device_id, { [key]: val });
  };

  const handleStarterLockClick = () => {
    const isCurrentlyEngaged = device.state.immobilize === 'ENGAGED' || device.state.immobilize === 'PENDING';
    if (isCurrentlyEngaged) {
      // Release starter
      onSendCommand(device.device_id, { immobilize: false });
      return;
    }
    // Require confirmation before cutting starter
    setImmobilizerConfirm(true);
  };

  const confirmImmobilize = () => {
    onSendCommand(device.device_id, { immobilize: true });
    setImmobilizerConfirm(false);
    setPinInput('');
  };

  const simulatePhysicalButtonClear = () => {
    setHoldingButton(true);
    setTimeout(() => {
      simulatorEngine.clearPhysicalFault(device.device_id);
      setHoldingButton(false);
    }, 1000);
  };

  // Telemetry casts
  const powerTel = (device.module_code.startsWith('PWR') ? device.telemetry : null) as PowerTelemetryPayload | null;
  const waterTel = (device.module_code === 'WAT-01' ? device.telemetry : null) as WaterTelemetryPayload | null;
  const vehTel = (device.module_code === 'VEH-01' ? device.telemetry : null) as VehicleTelemetryPayload | null;

  // G9: Calculate cost from cumulative NVS kWh
  const cumulativeKwh = powerTel?.kwh ?? 0;
  const totalCostInr = (cumulativeKwh * tariffInr).toFixed(2);

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-5 shadow-lg backdrop-blur-sm transition-all space-y-4 ${
      hasLatchedFault
        ? 'border-rose-600/60 bg-slate-900/90 ring-1 ring-rose-500/30'
        : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
    }`}>
      {/* Card Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {device.module_code}
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              RSSI: {device.state.rssi} dBm
            </span>
            {device.state.manual_override && (
              <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 border border-amber-700/50 px-1.5 py-0.2 rounded">
                Wall Switch
              </span>
            )}
            {device.state.via === 'ble_proxy' && (
              <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-700/50 px-1.5 py-0.2 rounded">
                BLE Proxy
              </span>
            )}
          </div>
          <h3 className="mt-1 text-base font-semibold text-slate-100">{device.name}</h3>
        </div>

        {/* Local Access Quick Link with PIN display (G7) */}
        <button
          onClick={() => onOpenLocalAccess?.(device.device_id, device.local_pin)}
          title={`G7 Local Device PIN: ${device.local_pin}`}
          className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1 text-[11px] font-mono text-slate-400 hover:text-white hover:border-slate-700 transition"
        >
          <span>PIN: {device.local_pin}</span>
          <ExternalLink className="w-3 h-3 text-slate-400" />
        </button>
      </div>

      {/* G10: LATCHED FAULT BANNER */}
      {hasLatchedFault && (
        <div className="rounded-xl border border-rose-500/60 bg-rose-950/40 p-3.5 space-y-2.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-rose-300">
            <span className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider">
              <AlertOctagon className="w-4 h-4 text-rose-400 animate-pulse" />
              <span>Latched Fault: {device.state.fault}</span>
            </span>
            <span className="text-[10px] font-mono bg-rose-900/60 text-rose-200 px-2 py-0.5 rounded border border-rose-700/50">
              G10 LOCKED
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Hardware cutoff engaged. All load-ON actuation is strictly locked. Clearing requires a <strong>3-second physical device button hold</strong> (no remote clearing allowed by safety spec).
          </p>

          <button
            onClick={simulatePhysicalButtonClear}
            disabled={holdingButton}
            className="w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold font-mono uppercase tracking-wider transition shadow flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${holdingButton ? 'animate-spin' : ''}`} />
            <span>{holdingButton ? 'Holding Physical Button (3 s)...' : 'Simulate 3s Physical Button Hold to Clear'}</span>
          </button>
        </div>
      )}

      {/* Safety Guardrails Badge */}
      {device.config.guardrails && (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          {device.config.guardrails.hard_locked && (
            <span className="flex items-center gap-1 text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-2 py-0.5 rounded-full">
              <ShieldCheck className="w-3 h-3" />
              <span>Hard-Locked Guardrails</span>
            </span>
          )}
          {device.config.guardrails.max_runtime_min && (
            <span className="text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-full">
              Ceiling: {device.config.guardrails.max_runtime_min}m Auto-Cutoff
            </span>
          )}
          {device.config.guardrails.dry_run_timeout_sec && (
            <span className="text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-full">
              Dry-Run: {device.config.guardrails.dry_run_timeout_sec}s
            </span>
          )}
        </div>
      )}

      {/* DYNAMIC CAPABILITIES SECTION */}
      <div className="space-y-3 pt-1">
        {device.info.capabilities.map((cap) => {
          // 1. SWITCH / RELAY
          if (cap.type === 'switch' || cap.type === 'pump_switch') {
            const isOn = Boolean(optimisticState[cap.key]);
            return (
              <div
                key={cap.key}
                className="flex items-center justify-between rounded-xl bg-slate-950/60 border border-slate-800/80 p-3"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                      isOn
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}
                  >
                    <Power className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">{cap.label}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {hasLatchedFault
                        ? 'Locked by Fault'
                        : isOn
                        ? 'Active (Relay ON)'
                        : 'Standby (Relay OFF)'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleToggle(cap.key)}
                  disabled={hasLatchedFault && !isOn}
                  className={`w-12 h-6 rounded-full transition-colors relative focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
                    isOn ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                      isOn ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            );
          }

          // 2. LEVEL (Fan speed stepped buttons or Dimmer slider)
          if (cap.type === 'level') {
            const levelCap = cap as LevelCapability;
            const currentVal = Number(optimisticState[cap.key] ?? 0);
            const isSteppedFan = (levelCap.max ?? 100) <= 5;

            if (isSteppedFan) {
              const speeds = Array.from({ length: levelCap.max - levelCap.min + 1 }, (_, i) => i + levelCap.min);
              return (
                <div key={cap.key} className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-200">{cap.label}</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {currentVal === 0 ? 'OFF' : `Speed ${currentVal}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {speeds.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleLevelChange(cap.key, s)}
                        disabled={hasLatchedFault && s > 0}
                        className={`py-1.5 rounded-lg text-xs font-mono font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                          currentVal === s
                            ? 'bg-emerald-500 text-slate-950 shadow-sm'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        {s === 0 ? '0' : s}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div key={cap.key} className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-200">{cap.label}</span>
                  <span className="font-mono text-emerald-400 font-bold">{currentVal}%</span>
                </div>
                <input
                  type="range"
                  min={levelCap.min}
                  max={levelCap.max}
                  step={levelCap.step ?? 1}
                  value={currentVal}
                  onChange={(e) => handleLevelChange(cap.key, Number(e.target.value))}
                  disabled={hasLatchedFault}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-40"
                />
              </div>
            );
          }

          // 3. G12: STRICTLY READ-ONLY SENSOR CAPABILITY
          if (cap.type === 'sensor') {
            const sensorCap = cap as ReadOnlySensorCapability;
            // Lookup sensor value from telemetry or state
            let val = (device.telemetry as Record<string, unknown>)[cap.key];
            if (val === undefined || val === null) {
              val = optimisticState[cap.key];
            }
            const displayVal = typeof val === 'number' ? val.toFixed(1) : String(val ?? '--');

            return (
              <div
                key={cap.key}
                className="flex items-center justify-between rounded-xl bg-slate-950/40 border border-slate-800/60 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-300 font-medium">{cap.label}</span>
                </div>
                <div className="flex items-baseline gap-1 font-mono">
                  <span className="font-bold text-slate-100">{displayVal}</span>
                  <span className="text-[10px] text-slate-400">{sensorCap.unit}</span>
                </div>
              </div>
            );
          }

          // 4. G11: WATER LEVEL & TANK TELEMETRY (WAT-01)
          if (cap.type === 'water_level_pct') {
            const level = waterTel?.level_pct ?? 0;
            const levelCm = waterTel?.level_cm ?? 0;
            const flow = waterTel?.flow_lpm ?? 0;
            const linkOk = waterTel?.tank_link !== false;
            const battPct = waterTel?.tank_batt_pct;

            return (
              <div key={cap.key} className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-1.5 text-sky-400 font-medium">
                    <Droplets className="w-4 h-4" />
                    <span>{cap.label}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-base font-bold text-sky-300">{level}%</span>
                    <span className="text-xs text-slate-400 font-normal">({levelCm} cm)</span>
                  </div>
                </div>

                {/* Animated Tank Indicator */}
                <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      level < 20 ? 'bg-rose-500' : level < 40 ? 'bg-amber-500' : 'bg-sky-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, level))}%` }}
                  />
                </div>

                {/* Sub-GHz Tank Link & Battery Row (G11) */}
                <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
                  <div className="flex items-center gap-2">
                    {/* Link Status */}
                    {linkOk ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Signal className="w-3.5 h-3.5" />
                        <span>Link: {waterTel?.tank_rssi ?? -68} dBm</span>
                      </span>
                    ) : (
                      <span className="text-rose-400 font-bold flex items-center gap-1 bg-rose-950/60 px-1.5 py-0.5 rounded">
                        <SignalZero className="w-3.5 h-3.5" />
                        <span>TANK LINK LOST</span>
                      </span>
                    )}

                    {/* G11: Hide battery badge when tank_batt_pct === null */}
                    {battPct !== null && battPct !== undefined && (
                      <span className="flex items-center gap-1 text-slate-300">
                        <Battery className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{battPct}%</span>
                      </span>
                    )}
                  </div>

                  <span>Flow: {flow > 0 ? `${flow.toFixed(1)} L/min` : '0 L/min'}</span>
                </div>
              </div>
            );
          }

          // 5. G13–G15: VEHICLE SAFETY & STARTER INTERLOCK (VEH-01)
          if (cap.type === 'gps_track') {
            if (!vehTel) return null;
            const starterState = device.state.immobilize ?? 'RELEASED';
            const starterReason = device.state.immobilize_reason;

            return (
              <div key={cap.key} className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 space-y-3">
                {/* HUD Strip */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-900 border border-slate-800 p-2">
                    <span className="text-[10px] text-slate-400 block font-mono">SPEED</span>
                    <span className="text-base font-bold font-mono text-slate-100">
                      {vehTel.speed_kmh.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">km/h</span>
                    </span>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-slate-800 p-2">
                    <span className="text-[10px] text-slate-400 block font-mono">IGNITION</span>
                    <span
                      className={`text-xs font-bold font-mono block mt-1 ${
                        vehTel.ignition ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {vehTel.ignition ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-slate-800 p-2">
                    <span className="text-[10px] text-slate-400 block font-mono">BATTERY</span>
                    <span className="text-xs font-bold font-mono text-slate-200 block mt-1">
                      {vehTel.bat_pct}% ({vehTel.ext_v}V)
                    </span>
                  </div>
                </div>

                {/* GPS Coordinates */}
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800/60">
                  <span className="flex items-center gap-1 text-slate-300">
                    <Navigation className="w-3.5 h-3.5 text-sky-400" />
                    <span>NH-2 Live GPS:</span>
                  </span>
                  <span>{vehTel.lat.toFixed(4)}°N, {vehTel.lng.toFixed(4)}°E</span>
                </div>

                {/* G15: Starter Solenoid Interlock Button & State */}
                <div className="pt-1 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300">Starter Solenoid Interlock:</span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        starterState === 'ENGAGED'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : starterState === 'PENDING'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {starterState}
                    </span>
                  </div>

                  <button
                    onClick={handleStarterLockClick}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition ${
                      starterState === 'ENGAGED' || starterState === 'PENDING'
                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-900/40'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{starterState === 'ENGAGED' ? 'Release Starter Lock' : starterState === 'PENDING' ? 'Cancel Pending Lock' : 'Engage Starter Cut'}</span>
                  </button>

                  {starterReason && (
                    <p className="text-[10px] text-amber-300 leading-tight font-mono bg-slate-950 p-2 rounded border border-slate-800">
                      {starterReason}
                    </p>
                  )}
                </div>

                {/* Crash SOS Simulator Trigger Button */}
                {onTriggerCrash && (
                  <button
                    onClick={onTriggerCrash}
                    className="w-full py-1.5 rounded-lg border border-rose-700/50 bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 text-[11px] font-medium transition flex items-center justify-center gap-1.5"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Simulate 6.4G Crash SOS Event</span>
                  </button>
                )}

                {/* Starter Lock PIN Confirmation Dialog */}
                {immobilizerConfirm && (
                  <div className="rounded-lg border border-rose-600/70 bg-rose-950/80 p-3 space-y-2 mt-2">
                    <p className="text-xs font-semibold text-rose-200">
                      Confirm Remote Starter Solenoid Cut:
                    </p>
                    <p className="text-[11px] text-slate-300">
                      Starter circuit will be severed. Starter cut engages safely when vehicle is stationary (&lt;5 km/h) &amp; ignition is OFF. Enter Device PIN to authorize:
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="8-digit PIN"
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-white"
                      />
                      <button
                        onClick={confirmImmobilize}
                        disabled={pinInput.length < 4}
                        className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1 rounded text-xs font-semibold disabled:opacity-50"
                      >
                        Authorize
                      </button>
                      <button
                        onClick={() => setImmobilizerConfirm(false)}
                        className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          // 6. G18: LOCAL HUB STATUS (HUB-01)
          if (cap.type === 'hub_status') {
            const hubTel = device.telemetry as {
              connected_devices?: number;
              lan_clients?: number;
              cloud_uplink?: boolean;
              local_ip?: string;
              broker_rx_rate?: number;
              broker_tx_rate?: number;
            };
            const permitJoin = device.info.permit_join ?? false;
            const permitTimeout = device.info.permit_join_timeout_sec ?? 0;

            return (
              <div key={cap.key} className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-200">{cap.label}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => simulatorEngine.togglePermitJoin()}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded transition ${
                        permitJoin
                          ? 'bg-amber-500 text-slate-950 font-bold animate-pulse'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {permitJoin ? `Pairing (${permitTimeout}s)` : 'Permit Join'}
                    </button>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded">
                      Broker :1883
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono pt-1">
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">DEVICES</span>
                    <span className="font-bold text-slate-200">{hubTel?.connected_devices ?? 5}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">LAN CLIENTS</span>
                    <span className="font-bold text-slate-200">{hubTel?.lan_clients ?? 2}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">LOCAL IP</span>
                    <span className="font-bold text-slate-200 text-[10px]">{hubTel?.local_ip ?? '192.168.1.50'}</span>
                  </div>
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* G9: Power Metering Footer (V, I, P, PF, and Cumulative NVS kWh) */}
      {powerTel && (
        <div className="mt-2 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5 text-amber-400">
            <Zap className="w-3.5 h-3.5" />
            <span className="font-bold text-slate-200">{(powerTel.p ?? 0).toFixed(1)} W</span>
          </div>
          <div>{(powerTel.v ?? 230).toFixed(0)} V ({(powerTel.i ?? 0).toFixed(2)} A)</div>
          <div className="text-emerald-400 font-semibold" title={`Cumulative NVS: ${(powerTel.kwh ?? 0).toFixed(2)} kWh`}>
            {(powerTel.kwh ?? 0).toFixed(2)} kWh (₹{totalCostInr})
          </div>
        </div>
      )}
    </div>
  );
};
