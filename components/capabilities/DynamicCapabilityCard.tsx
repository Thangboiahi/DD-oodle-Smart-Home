'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Battery,
  ChevronDown,
  ChevronUp,
  Droplets,
  Eye,
  ExternalLink,
  Gauge,
  KeyRound,
  Lock,
  Radio,
  Shield,
  ShieldCheck,
  Signal,
  SignalZero,
  Unlock,
  Zap,
} from 'lucide-react';
import {
  LevelCapability,
  PowerTelemetryPayload,
  ReadOnlySensorCapability,
  VehicleTelemetryPayload,
  WaterTelemetryPayload,
  evaluateStarterInterlockSafety,
} from '@/lib/protocol/contract';
import { VirtualDeviceInstance } from '@/lib/simulator/types';
import { cn } from '@/lib/utils';
import {
  Badge,
  Button,
  PrecisionSlider,
  SegmentedControl,
  TactileSwitch,
} from '@/components/ui';
import { LatchedFaultBanner } from './LatchedFaultBanner';
import { SensorSparkline } from './SensorSparkline';
import {
  AssistedWellnessCapabilityRenderer,
  SmartLockCapabilityRenderer,
  VideoStreamCapabilityRenderer,
} from './Phase23CapabilityRenderers';

export interface DynamicCapabilityCardProps {
  device: VirtualDeviceInstance;
  tariffInr?: number;
  hasPlusHistory?: boolean;
  connectedHubMembers?: Array<{ device_id: string; name: string; module_code: string; via?: string }>;
  onSendCommand: (deviceId: string, set: Record<string, boolean | number | string>) => void;
  onTriggerCrash?: () => void;
  onOpenLocalAccess?: (deviceId: string, pin: string) => void;
  onInspect?: (deviceId: string) => void;
}

/**
 * G12 Hard-Enforced Guard: verifies whether a capability key is strictly read-only (`type: "sensor"`).
 * NEVER emits .../cmd for any read-only sensor key.
 */
export function isReadOnlySensorKey(device: VirtualDeviceInstance, key: string): boolean {
  return device.info.capabilities.some((cap) => cap.key === key && cap.type === 'sensor');
}

export const DynamicCapabilityCard: React.FC<DynamicCapabilityCardProps> = ({
  device,
  tariffInr = 7.5,
  hasPlusHistory = true,
  connectedHubMembers = [],
  onSendCommand,
  onTriggerCrash,
  onOpenLocalAccess,
  onInspect,
}) => {
  const [pendingKeys, setPendingKeys] = useState<Record<string, boolean>>({});
  const [ackedKeys, setAckedKeys] = useState<Record<string, boolean>>({});
  const [optimisticOverrides, setOptimisticOverrides] = useState<
    Record<string, boolean | number | string>
  >({});
  const [immobilizerConfirm, setImmobilizerConfirm] = useState(false);
  const [hubMembersExpanded, setHubMembersExpanded] = useState(false);

  // HUB-01 G18a: live 180s permit_join countdown
  const permitJoinActive = Boolean(device.info.permit_join || device.state.state.permit_join);
  const [permitRemainingSec, setPermitRemainingSec] = useState<number>(
    device.info.permit_join_timeout_sec ?? 180
  );

  useEffect(() => {
    if (!permitJoinActive) return;
    const handle = window.setInterval(() => {
      setPermitRemainingSec((sec) => (sec > 0 ? sec - 1 : 0));
    }, 1000);
    return () => window.clearInterval(handle);
  }, [permitJoinActive]);

  const effectiveState = useMemo(
    () => ({ ...device.state.state, ...optimisticOverrides }),
    [device.state.state, optimisticOverrides]
  );

  const hasLatchedFault = device.state.fault !== null;

  const dispatchCommand = (key: string, nextVal: boolean | number | string) => {
    // G12 Hard Guard: NEVER emit commands targeting a read-only sensor key
    if (isReadOnlySensorKey(device, key)) return;
    // G10 Hard Guard: NEVER turn ON loads while a latched fault is active
    if (hasLatchedFault && (nextVal === true || (typeof nextVal === 'number' && nextVal > 0))) {
      return;
    }

    setOptimisticOverrides((prev) => ({ ...prev, [key]: nextVal }));
    setPendingKeys((prev) => ({ ...prev, [key]: true }));
    onSendCommand(device.device_id, { [key]: nextVal });

    window.setTimeout(() => {
      setPendingKeys((prev) => ({ ...prev, [key]: false }));
      setAckedKeys((prev) => ({ ...prev, [key]: true }));
      setOptimisticOverrides((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      window.setTimeout(() => {
        setAckedKeys((prev) => ({ ...prev, [key]: false }));
      }, 1800);
    }, 260);
  };

  // Telemetry casts
  const powerTel = (
    device.module_code.startsWith('PWR') ? device.telemetry : null
  ) as PowerTelemetryPayload | null;
  const waterTel = (
    device.module_code === 'WAT-01' ? device.telemetry : null
  ) as WaterTelemetryPayload | null;
  const vehTel = (
    device.module_code === 'VEH-01' ? device.telemetry : null
  ) as VehicleTelemetryPayload | null;

  // G9: Power metrics & INR cost derived from cumulative NVS kWh
  const watts = powerTel?.p ?? 0;
  const volts = powerTel?.v ?? 230;
  const amps = powerTel?.i ?? 0;
  const pf = powerTel?.pf ?? 0.96;
  const cumulativeKwh = powerTel?.kwh ?? 0;
  const dailyDeltaKwh = Number((cumulativeKwh * 0.14).toFixed(2));
  const monthlyProjectedKwh = Number((dailyDeltaKwh * 30).toFixed(1));
  const dailyCostInr = (dailyDeltaKwh * tariffInr).toFixed(2);
  const monthlyCostInr = (monthlyProjectedKwh * tariffInr).toFixed(0);
  const maxLoadWatts = device.module_code === 'PWR-03' ? 5500 : 2500;
  const wattGaugePct = Math.min(100, Math.round((watts / maxLoadWatts) * 100));

  // WAT-01 G11 telemetry
  const tankLinkLost = waterTel?.tank_link === false;
  const showTankBattery = waterTel !== null && waterTel.tank_batt_pct !== null && typeof waterTel.tank_batt_pct === 'number';

  return (
    <article
      className={cn(
        'rounded-2xl border bg-surface p-3 sm:p-3.5 transition-colors space-y-2.5',
        hasLatchedFault
          ? 'border-danger/70 ring-1 ring-danger/25'
          : 'hairline-border hover:border-border-strong'
      )}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="accent">{device.module_code}</Badge>
            <span className="text-[10px] font-mono text-foreground-muted tabular-nums">
              {device.state.rssi} dBm
            </span>
            {device.state.ack && (
              <Badge variant="success" className="text-[10px]">
                ACK
              </Badge>
            )}
            {device.state.via === 'ble_proxy' && (
              <Badge variant="warning" className="text-[10px]">
                BLE Proxy
              </Badge>
            )}
          </div>
          <h3 className="mt-1 text-sm font-semibold tracking-tight text-foreground truncate">
            {device.name}
          </h3>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onInspect && (
            <button
              type="button"
              onClick={() => onInspect(device.device_id)}
              title="Open Quick Inspector"
              aria-label={`Inspect ${device.name}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-surface-elevated text-foreground-secondary hover:text-accent hover:border-accent-border transition-colors cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          )}
          <a
            href={
              device.module_code === 'VEH-01'
                ? `/vehicles/${device.device_id}`
                : `/devices/${device.device_id}`
            }
            title="Open Device Detail & Settings"
            aria-label={`Open full details for ${device.name}`}
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/70 bg-surface-elevated px-2 text-[10px] font-mono text-foreground-secondary hover:text-foreground hover:border-border-strong transition-colors"
          >
            <span>Detail</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </div>

      {/* G10: Global Latched Fault Lock Banner (NO remote clear button) */}
      <LatchedFaultBanner fault={device.state.fault} moduleCode={device.module_code} />

      {/* G11: WAT-01 Tank Link Lost Warning Banner */}
      {tankLinkLost && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-[var(--dd-radius-control)] border border-warning/50 bg-warning-soft px-3 py-2 text-xs text-foreground"
        >
          <SignalZero className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-warning font-mono text-[11px]">
              TANK_LINK_LOST (G11)
            </div>
            <div className="text-[11px] text-foreground-secondary">
              Overhead tank sensor link offline. Automatic top-off paused to prevent overflow.
            </div>
          </div>
        </div>
      )}

      {/* Guardrail Badges */}
      {device.config.guardrails && (
        <div className="flex flex-wrap items-center gap-1.5">
          {device.config.guardrails.hard_locked && (
            <Badge variant="success">
              <ShieldCheck className="h-3 w-3" />
              <span>Hard-Locked Ceiling</span>
            </Badge>
          )}
          {device.config.guardrails.max_runtime_min && (
            <Badge variant="mono">Max {device.config.guardrails.max_runtime_min}m</Badge>
          )}
          {device.config.guardrails.dry_run_timeout_sec && (
            <Badge variant="mono">Dry-Run {device.config.guardrails.dry_run_timeout_sec}s</Badge>
          )}
        </div>
      )}

      {/* Dynamic Capability Controls (strictly bound to device.info.capabilities[]) */}
      <div className="space-y-2.5">
        {device.info.capabilities.map((cap) => {
          // 1. SWITCH / PUMP_SWITCH (including HUB-01 permit_join)
          if (cap.type === 'switch' || cap.type === 'pump_switch') {
            const checked = Boolean(effectiveState[cap.key]);
            const isPermitJoin = device.module_code === 'HUB-01' && cap.key === 'permit_join';

            return (
              <div key={cap.key} className="space-y-1.5">
                <TactileSwitch
                  label={cap.label}
                  sublabel={
                    isPermitJoin && checked
                      ? `Pairing window closes in ${permitRemainingSec}s (G18a)`
                      : hasLatchedFault
                      ? 'G10 Locked · Physical Reset Required'
                      : `${cap.key} · ${checked ? 'ON' : 'OFF'}`
                  }
                  checked={checked}
                  pending={Boolean(pendingKeys[cap.key])}
                  acked={Boolean(ackedKeys[cap.key])}
                  manualOverride={Boolean(device.state.manual_override)}
                  locked={hasLatchedFault && !checked}
                  onChange={(next) => {
                    if (isPermitJoin && next) setPermitRemainingSec(180);
                    dispatchCommand(cap.key, next);
                  }}
                />
              </div>
            );
          }

          // 2. LEVEL (G6: Stepped buttons for fan_speed 0-4, PrecisionSlider for 0-100%)
          if (cap.type === 'level') {
            const levelCap = cap as LevelCapability;
            const currentVal = Number(effectiveState[cap.key] ?? 0);
            const isStepped = (levelCap.max ?? 100) <= 5;

            if (isStepped) {
              const steps = Array.from(
                { length: levelCap.max - levelCap.min + 1 },
                (_, i) => levelCap.min + i
              );
              return (
                <div
                  key={cap.key}
                  className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated p-2.5 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{cap.label}</span>
                    <span className="font-mono text-accent font-semibold tabular-nums">
                      {currentVal === 0 ? 'OFF' : `Speed ${currentVal}`}
                    </span>
                  </div>
                  <SegmentedControl
                    fullWidth
                    size="sm"
                    ariaLabel={cap.label}
                    value={currentVal}
                    onChange={(next) => dispatchCommand(cap.key, next)}
                    options={steps.map((s) => ({
                      value: s,
                      label: s === 0 ? 'OFF' : String(s),
                      disabled: hasLatchedFault && s > 0,
                    }))}
                  />
                </div>
              );
            }

            return (
              <div
                key={cap.key}
                className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated p-3"
              >
                <PrecisionSlider
                  label={cap.label}
                  value={currentVal}
                  min={levelCap.min}
                  max={levelCap.max}
                  step={levelCap.step ?? 1}
                  unit={cap.unit ?? '%'}
                  disabled={hasLatchedFault}
                  onChange={(next) => dispatchCommand(cap.key, next)}
                />
              </div>
            );
          }

          // 3. G12 STRICTLY READ-ONLY SENSOR CAPABILITY
          if (cap.type === 'sensor') {
            const sensorCap = cap as ReadOnlySensorCapability;
            const telVal = (device.telemetry as unknown as Record<string, unknown>)[cap.key];
            const stateVal = device.state.state[cap.key];
            const rawVal =
              telVal !== undefined
                ? telVal
                : stateVal !== undefined
                ? stateVal
                : cap.key === 'local_clients'
                ? device.info.local_clients
                : null;

            return (
              <SensorSparkline
                key={cap.key}
                label={sensorCap.label}
                sensorKey={sensorCap.key}
                value={rawVal as number | string | null}
                unit={sensorCap.unit}
                min={sensorCap.min}
                max={sensorCap.max}
                hasPlusHistory={hasPlusHistory}
              />
            );
          }

          // 4. Phase 2/3 Registry Readiness: Smart Lock
          if (cap.type === 'lock_state') {
            const isLocked = effectiveState[cap.key] !== false && effectiveState[cap.key] !== 'UNLOCKED';
            return (
              <SmartLockCapabilityRenderer
                key={cap.key}
                label={cap.label}
                locked={isLocked}
                disabled={hasLatchedFault}
                onUnlockToggle={(nextLocked) => dispatchCommand(cap.key, nextLocked)}
              />
            );
          }

          // 5. Phase 2/3 Registry Readiness: Video Stream
          if (cap.type === 'video_stream') {
            return (
              <VideoStreamCapabilityRenderer
                key={cap.key}
                label={cap.label}
                deviceId={device.device_id}
              />
            );
          }

          // 6. Phase 2/3 Registry Readiness: Assisted Wellness (with mandatory non-medical disclaimer)
          if (cap.type === 'vitals' || cap.type === 'fall_alert' || cap.type === 'pill_dispenser') {
            return (
              <AssistedWellnessCapabilityRenderer
                key={cap.key}
                type={cap.type}
                label={cap.label}
                statusValue={effectiveState[cap.key]}
              />
            );
          }

          return null;
        })}
      </div>

      {/* PWR-01 / PWR-02 / PWR-03 Telemetry & G9 Energy/INR Calculator */}
      {powerTel && (
        <div className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated p-3 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground-secondary">
              <Zap className="h-3.5 w-3.5 text-accent" />
              <span>Live Power Meter</span>
            </span>
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {watts.toFixed(0)} W
            </span>
          </div>

          {/* Wattage Gauge Bar */}
          <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
            <div
              className={cn(
                'h-full transition-[width] duration-300',
                wattGaugePct > 85 ? 'bg-danger' : wattGaugePct > 65 ? 'bg-warning' : 'bg-accent'
              )}
              style={{ width: `${wattGaugePct}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono tabular-nums">
            <div className="rounded bg-surface border border-border/70 px-2 py-1">
              <span className="text-foreground-muted block text-[9px]">VOLTS</span>
              <span className="text-foreground font-semibold">{volts.toFixed(1)} V</span>
            </div>
            <div className="rounded bg-surface border border-border/70 px-2 py-1">
              <span className="text-foreground-muted block text-[9px]">CURRENT</span>
              <span className="text-foreground font-semibold">{amps.toFixed(2)} A</span>
            </div>
            <div className="rounded bg-surface border border-border/70 px-2 py-1">
              <span className="text-foreground-muted block text-[9px]">PF</span>
              <span className="text-foreground font-semibold">{pf.toFixed(2)}</span>
            </div>
          </div>

          {/* G9 Cumulative NVS kWh + Daily/Monthly INR */}
          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/60 text-[10px] font-mono tabular-nums text-foreground-secondary">
            <span>
              Today: <strong className="text-foreground">{dailyDeltaKwh} kWh</strong> (₹{dailyCostInr})
            </span>
            <span>
              Est/Mo: <strong className="text-foreground">₹{monthlyCostInr}</strong>
            </span>
          </div>
        </div>
      )}

      {/* WAT-01 Telemetry (G11: hide battery if tank_batt_pct === null) */}
      {waterTel && (
        <div className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground-secondary">
              <Droplets className="h-3.5 w-3.5 text-accent" />
              <span>Overhead Tank</span>
            </span>
            <div className="flex items-center gap-1.5">
              {typeof waterTel.tank_rssi === 'number' && (
                <Badge variant={waterTel.tank_rssi > -75 ? 'success' : 'warning'}>
                  <Signal className="h-2.5 w-2.5" />
                  <span>{waterTel.tank_rssi} dBm</span>
                </Badge>
              )}
              {showTankBattery && (
                <Badge variant={(waterTel.tank_batt_pct ?? 100) < 25 ? 'danger' : 'mono'}>
                  <Battery className="h-2.5 w-2.5" />
                  <span>{waterTel.tank_batt_pct}%</span>
                </Badge>
              )}
            </div>
          </div>

          {/* Level Gauge */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-mono tabular-nums">
              <span className="text-foreground font-semibold">{waterTel.level_pct}% Full</span>
              <span className="text-foreground-muted">
                Flow: {(waterTel.flow_lpm ?? 0).toFixed(1)} L/min
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-muted overflow-hidden">
              <div
                className="h-full bg-accent transition-[width] duration-300"
                style={{ width: `${Math.min(100, Math.max(0, waterTel.level_pct))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* HUB-01 (G18a–d): Connected Members & Local Routing */}
      {device.module_code === 'HUB-01' && (
        <div className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated overflow-hidden">
          <button
            type="button"
            onClick={() => setHubMembersExpanded((e) => !e)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-foreground hover:bg-surface-muted/50 cursor-pointer"
          >
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Radio className="h-3.5 w-3.5 text-accent" />
              <span>Hub Members & BLE Proxy ({connectedHubMembers.length || device.info.local_clients || 0})</span>
            </span>
            {hubMembersExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-foreground-muted" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-foreground-muted" />
            )}
          </button>

          {hubMembersExpanded && (
            <div className="border-t border-border/70 p-2.5 space-y-1.5 bg-surface text-[11px] font-mono">
              <div className="text-[10px] text-foreground-muted">
                LAN API: <span className="text-foreground">GET /api/v1/devices</span> · WS target key:{' '}
                <span className="text-accent">&quot;d&quot;</span>
              </div>
              {connectedHubMembers.length === 0 ? (
                <div className="text-foreground-muted">Local LAN broker standing by.</div>
              ) : (
                connectedHubMembers.map((m) => (
                  <div
                    key={m.device_id}
                    className="flex items-center justify-between rounded border border-border/70 bg-surface-elevated px-2 py-1"
                  >
                    <span className="truncate text-foreground">{m.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="mono" className="text-[9px]">
                        {m.module_code}
                      </Badge>
                      {m.via === 'ble_proxy' && (
                        <Badge variant="warning" className="text-[9px]">
                          BLE
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* VEH-01 Telemetry, G15/G16 Starter Interlock & Crash SOS */}
      {vehTel && (
        <div className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated p-3 space-y-2.5">
          <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono tabular-nums">
            <div className="rounded bg-surface border border-border/70 px-2 py-1">
              <span className="text-foreground-muted block text-[9px]">SPEED</span>
              <span className="text-foreground font-semibold">{vehTel.speed_kmh.toFixed(0)} km/h</span>
            </div>
            <div className="rounded bg-surface border border-border/70 px-2 py-1">
              <span className="text-foreground-muted block text-[9px]">BATTERY</span>
              <span className="text-foreground font-semibold">{vehTel.ext_v.toFixed(1)} V</span>
            </div>
            <div className="rounded bg-surface border border-border/70 px-2 py-1">
              <span className="text-foreground-muted block text-[9px]">IGNITION</span>
              <span className="text-foreground font-semibold">{vehTel.ignition ? 'ON' : 'OFF'}</span>
            </div>
          </div>

          {(() => {
            const safety = evaluateStarterInterlockSafety(vehTel.speed_kmh, vehTel.ignition);
            const engaged =
              device.state.immobilize === 'ENGAGED' || device.state.immobilize === 'PENDING';
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="inline-flex items-center gap-1 text-foreground-secondary">
                    <Shield className="h-3.5 w-3.5 text-accent" />
                    <span>Starter Interlock</span>
                  </span>
                  <Badge variant={engaged ? 'danger' : 'success'}>
                    {device.state.immobilize ?? 'RELEASED'}
                  </Badge>
                </div>

                {immobilizerConfirm ? (
                  <div className="rounded-md border border-danger/40 bg-danger-soft p-2.5 space-y-2 text-[11px]">
                    <div className="text-foreground font-medium">
                      {safety.targetState === 'ENGAGED'
                        ? 'Vehicle parked. Confirm starter cut?'
                        : `Vehicle active (${safety.reason}). Command will queue as PENDING until parked.`}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          onSendCommand(device.device_id, { immobilize: true });
                          setImmobilizerConfirm(false);
                        }}
                      >
                        Confirm Cut
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setImmobilizerConfirm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      variant={engaged ? 'secondary' : 'danger'}
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        if (engaged) {
                          onSendCommand(device.device_id, { immobilize: false });
                        } else {
                          setImmobilizerConfirm(true);
                        }
                      }}
                    >
                      {engaged ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                      <span>{engaged ? 'Release Starter' : 'Starter Cut'}</span>
                    </Button>
                    {onTriggerCrash && (
                      <Button variant="outline" size="sm" onClick={onTriggerCrash}>
                        <AlertTriangle className="h-3.5 w-3.5 text-danger" />
                        <span>SOS</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Footer Status */}
      <div className="flex items-center justify-between pt-1 border-t border-border/60 text-[10px] font-mono text-foreground-muted tabular-nums">
        <span className="inline-flex items-center gap-1">
          <Gauge className="h-3 w-3" />
          <span>{device.info.operation_mode}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Activity className="h-3 w-3" />
          <span>FW {device.info.fw_version}</span>
        </span>
      </div>
    </article>
  );
};
