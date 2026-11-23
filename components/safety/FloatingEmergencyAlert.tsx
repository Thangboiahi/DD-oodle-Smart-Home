'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Lock,
  Minimize2,
  PhoneCall,
  ShieldAlert,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { AlertType, AlertSeverity } from '@/lib/protocol/contract';
import { simulatorEngine } from '@/lib/simulator/engine';
import { useWorkspace } from '@/components/workspace/WorkspaceProvider';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface ActiveEmergencyIncident {
  id: string;
  deviceId: string;
  deviceName: string;
  roomId: string;
  roomName: string;
  moduleCode: string;
  alertType: AlertType;
  severity: AlertSeverity | 'HIGH';
  value?: number;
  limit?: number;
  latched: boolean;
  ts: number;
  message?: string;
}

interface RecoveryPlaybook {
  headline: string;
  rootCauseSummary: string;
  hardwareLockNotice?: string;
  steps: string[];
  primaryActionLabel: string;
  primaryActionHref: string;
  secondaryAction?: {
    label: string;
    href: string;
    isEmergencyCall?: boolean;
  };
}

const ROOM_LABELS: Record<string, string> = {
  room_living: 'Living Room',
  room_master: 'Master Bedroom',
  room_kitchen: 'Kitchen & Utility',
  room_terrace: 'Terrace & Overhead Tank',
  room_garage: 'Garage & Hub',
};

function buildRecoveryPlaybook(inc: ActiveEmergencyIncident): RecoveryPlaybook {
  const isVehicle = inc.moduleCode === 'VEH-01';
  const inspectHref = isVehicle ? `/vehicles/${inc.deviceId}` : `/devices/${inc.deviceId}`;

  switch (inc.alertType) {
    case 'OVERLOAD':
    case 'OVERPOWER':
    case 'OVERTEMP':
    case 'RUNTIME_LIMIT':
    case 'METER_FAULT':
      return {
        headline:
          inc.alertType === 'OVERLOAD' || inc.alertType === 'OVERPOWER'
            ? 'Heavy Load Safety Cutoff Tripped'
            : inc.alertType === 'OVERTEMP'
            ? 'Thermal Ceiling Cutoff Tripped'
            : inc.alertType === 'RUNTIME_LIMIT'
            ? 'Max Continuous Runtime Ceiling Reached'
            : 'HLW8032 Energy Metering Fault Detected',
        rootCauseSummary:
          inc.value !== undefined && inc.limit !== undefined
            ? `${inc.deviceName} (${inc.moduleCode}) measured ${inc.value} against a hard-locked safety ceiling of ${inc.limit}. Relay opened automatically to protect wiring and appliance.`
            : inc.message ??
              `${inc.deviceName} (${inc.moduleCode}) triggered a G10 hardware safety cutoff (${inc.alertType}).`,
        hardwareLockNotice:
          'G10 Hardware Lockout Active: Remote turn-ON via PWA, LAN, BLE, or Automation Rules is disabled in firmware until physically cleared at the switch.',
        steps: [
          'Unplug or switch off the heavy appliance (geyser, AC, motor, or heater) connected to this circuit.',
          'Inspect plug, socket, and wiring for overheating, loose terminals, or excessive draw.',
          'Hold the physical push-button on the DD oodle module for 3 full seconds until the status LED flashes green to clear the latched fault.',
        ],
        primaryActionLabel: `Inspect ${inc.deviceName}`,
        primaryActionHref: inspectHref,
      };

    case 'DRY_RUN_FAULT':
      return {
        headline: 'Pump Dry-Run Protection Latched (WAT-01)',
        rootCauseSummary:
          inc.message ??
          `${inc.deviceName} ran with flow below threshold (${inc.value ?? 0}s without flow vs limit ${inc.limit ?? 30}s). Pump contactor opened to prevent motor burnout.`,
        hardwareLockNotice:
          'G10 Hardware Lockout Active: Pump cannot be restarted remotely until cleared via a 3-second physical button hold on WAT-01.',
        steps: [
          'Verify municipal water supply or underground sump water level before restarting.',
          'Check foot-valve priming and inspect the inline flow sensor for airlocks or debris.',
          'Press and hold the physical button on the WAT-01 Pump Controller for 3 seconds to clear DRY_RUN_FAULT.',
        ],
        primaryActionLabel: 'Inspect Pump & Tank Node',
        primaryActionHref: inspectHref,
      };

    case 'TANK_LINK_LOST':
      return {
        headline: 'Overhead Tank ESP-NOW Sensor Link Lost (G11)',
        rootCauseSummary:
          inc.message ??
          `${inc.deviceName} has not received an encrypted ESP-NOW ultrasonic depth frame from the Terrace Tank Node within the heartbeat window.`,
        steps: [
          'Automatic pump top-off is safely paused so the overhead tank cannot overflow blindly.',
          'Check the Terrace Tank Node solar/LiFePO4 battery or 5V supply and antenna alignment.',
          'Verify last known tank_rssi in Device Diagnostics; manual pump control remains available with max-runtime guardrail.',
        ],
        primaryActionLabel: 'Check Tank Link Diagnostics',
        primaryActionHref: inspectHref,
      };

    case 'RULE_REJECTED':
      return {
        headline: 'Local Rule Rejected by Firmware Guardrail (G17)',
        rootCauseSummary:
          inc.message ??
          `${inc.deviceName} rejected a pushed automation rule because it targeted a restricted safety key (VEH-01 immobilize or hard_locked guardrails) or exceeded node quota.`,
        steps: [
          'G17 forbids automated rules from engaging vehicle starter cut (immobilize) or mutating hardware guardrails.',
          'Open the Hybrid Automations studio to inspect the G17 Compiler Preview and remove restricted targets.',
          'Re-publish the validated rule payload to ddoodle/{home_id}/{device_id}/rules.',
        ],
        primaryActionLabel: 'Fix Rule in Automations',
        primaryActionHref: '/automations',
        secondaryAction: {
          label: `Inspect ${inc.deviceName}`,
          href: inspectHref,
        },
      };

    case 'EXT_POWER_LOST':
    case 'LOW_BATTERY':
      return {
        headline:
          inc.alertType === 'EXT_POWER_LOST'
            ? 'Vehicle 12V Main Harness Disconnected (Tamper / Power Loss)'
            : 'Internal Backup Battery Low',
        rootCauseSummary:
          inc.message ??
          `${inc.deviceName} (${inc.moduleCode}) switched to internal LiPo backup battery${
            inc.value !== undefined ? ` (measured ${inc.value})` : ''
          }.`,
        steps: [
          'Verify vehicle 12V battery terminal connections, inline blade fuse, and OBD/wiring harness.',
          'Check live GPS position and parked status on the Vehicle Safety Map.',
          'If parked in an unverified location, consider arming PIN-gated Starter Interlock (< 5 km/h & ignition OFF).',
        ],
        primaryActionLabel: 'Open Live Vehicle Map',
        primaryActionHref: '/vehicles',
        secondaryAction: {
          label: 'Call Emergency Contact',
          href: 'tel:+919876543210',
          isEmergencyCall: true,
        },
      };

    case 'GAS_LEAK':
    case 'SMOKE_FIRE':
    case 'FLAME_DETECTED':
    case 'WATER_LEAK':
    case 'FALL_DETECTED':
    case 'PANIC_SOS':
    case 'CRASH_DETECTED':
    case 'SOS_MANUAL':
      return {
        headline: `Life-Safety Alert: ${inc.alertType.replace(/_/g, ' ')}`,
        rootCauseSummary:
          inc.message ??
          `${inc.deviceName} in ${inc.roomName} reported a critical life-safety event (${inc.alertType}).`,
        steps: [
          'Verify occupant safety immediately and ventilate or evacuate if gas/smoke is present.',
          'Check automated safety cutoffs (heavy appliances and main valves).',
          'Use the 1-tap call action below to reach configured E.164 family contacts or 112 Emergency Response.',
        ],
        primaryActionLabel: isVehicle ? 'Open Vehicle Incident Map' : `Inspect ${inc.deviceName}`,
        primaryActionHref: isVehicle ? '/vehicles' : inspectHref,
        secondaryAction: {
          label: 'Call 112 / Emergency Contact',
          href: 'tel:112',
          isEmergencyCall: true,
        },
      };

    default:
      return {
        headline: `Device Diagnostic Alert: ${inc.alertType}`,
        rootCauseSummary:
          inc.message ?? `${inc.deviceName} (${inc.moduleCode}) reported ${inc.alertType}.`,
        steps: [
          'Open the device detail view to inspect real-time telemetry and sensor health.',
          'Check local Wi-Fi / Hub RSSI and power supply stability.',
        ],
        primaryActionLabel: `Inspect ${inc.deviceName}`,
        primaryActionHref: inspectHref,
      };
  }
}

export const FloatingEmergencyAlert: React.FC = () => {
  const { snapshot } = useWorkspace();

  // Collect all active device faults/alerts + escalated/acknowledged Crash SOS
  const activeIncidents = useMemo<ActiveEmergencyIncident[]>(() => {
    const list: ActiveEmergencyIncident[] = [];

    // 1. If Crash SOS has already escalated (the 20s countdown modal is finished or acknowledged),
    // include it in the docked emergency beacon so it remains accessible without painting the app red.
    if (snapshot.activeCrashSos && snapshot.activeCrashSos.status === 'escalated') {
      const veh = snapshot.devices[snapshot.activeCrashSos.device_id];
      list.push({
        id: `crash_${snapshot.activeCrashSos.device_id}_${snapshot.activeCrashSos.started_at_ms}`,
        deviceId: snapshot.activeCrashSos.device_id,
        deviceName: veh?.name ?? 'Creta VEH-01 GPS/4G',
        roomId: veh?.room_id ?? 'room_garage',
        roomName: 'Vehicle Telemetry',
        moduleCode: 'VEH-01',
        alertType: snapshot.activeCrashSos.alert.type,
        severity: 'CRITICAL',
        value: snapshot.activeCrashSos.alert.g_force,
        limit: 4.0,
        latched: false,
        ts: snapshot.activeCrashSos.started_at_ms,
        message: snapshot.activeCrashSos.alert.message,
      });
    }

    // 2. All device-level latched faults (G10) and active last_alerts (G8 / G11 / G17)
    for (const dev of Object.values(snapshot.devices)) {
      if (dev.last_alert?.cancelled) continue;
      const alertType = dev.state.fault ?? dev.last_alert?.type ?? null;
      if (!alertType) continue;
      // Avoid duplicating an active countdown crash modal that's currently on screen
      if (
        (alertType === 'CRASH_DETECTED' || alertType === 'SOS_MANUAL') &&
        snapshot.activeCrashSos?.status === 'countdown'
      ) {
        continue;
      }

      const severity: AlertSeverity =
        dev.last_alert?.severity ??
        (dev.state.fault === 'OVERLOAD' ||
        dev.state.fault === 'OVERTEMP' ||
        dev.state.fault === 'DRY_RUN_FAULT'
          ? 'CRITICAL'
          : 'WARNING');

      list.push({
        id: `${dev.device_id}_${alertType}`,
        deviceId: dev.device_id,
        deviceName: dev.name,
        roomId: dev.room_id,
        roomName: ROOM_LABELS[dev.room_id] ?? dev.room_id,
        moduleCode: dev.module_code,
        alertType,
        severity,
        value: dev.last_alert?.value,
        limit: dev.last_alert?.limit,
        latched: dev.state.fault !== null,
        ts: dev.last_alert?.ts ? dev.last_alert.ts * 1000 : (dev.state.ts ? dev.state.ts * 1000 : 0),
        message: dev.last_alert?.message,
      });
    }

    return list;
  }, [snapshot]);

  const [isDocked, setIsDocked] = useState(false);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [selectedIncidentIdx, setSelectedIncidentIdx] = useState(0);
  const [beaconCorner, setBeaconCorner] = useState<'right' | 'left'>('right');
  const lastSignatureRef = useRef<string>('');

  const incidentSignature = useMemo(
    () => activeIncidents.map((i) => i.id).join('|'),
    [activeIncidents]
  );

  // Whenever a new alert signature appears, pop the floating card out and start the 5s auto-dock timer
  useEffect(() => {
    if (!incidentSignature) {
      lastSignatureRef.current = '';
      return;
    }

    const isNewAlert = incidentSignature !== lastSignatureRef.current;
    lastSignatureRef.current = incidentSignature;

    let expandTimer: number | undefined;
    if (isNewAlert) {
      expandTimer = window.setTimeout(() => {
        setIsDocked(false);
        setSelectedIncidentIdx(0);
      }, 0);
    }

    const dockTimer = window.setTimeout(() => {
      setIsDocked(true);
    }, 5200);

    return () => {
      if (expandTimer) window.clearTimeout(expandTimer);
      window.clearTimeout(dockTimer);
    };
  }, [incidentSignature]);

  // Listen for custom event from header bell or elsewhere to open the guided diagnostic sheet
  useEffect(() => {
    const onOpenDiagnostics = () => {
      if (activeIncidents.length > 0) {
        setDiagnosticOpen(true);
      }
    };
    window.addEventListener('ddoodle:open-emergency-sheet', onOpenDiagnostics);
    return () => window.removeEventListener('ddoodle:open-emergency-sheet', onOpenDiagnostics);
  }, [activeIncidents.length]);

  if (activeIncidents.length === 0) {
    return null;
  }

  const activeIncident =
    activeIncidents[Math.min(selectedIncidentIdx, activeIncidents.length - 1)] ?? activeIncidents[0];
  const playbook = buildRecoveryPlaybook(activeIncident);
  const hasCritical = activeIncidents.some((i) => i.severity === 'CRITICAL');

  return (
    <>
      {/* 1. Floating Alert Popup (Auto-docks into corner beacon after ~5s or on Minimize) */}
      <AnimatePresence mode="wait">
        {!isDocked && !diagnosticOpen && (
          <motion.aside
            key="floating-alert-popup"
            layoutId="dd-emergency-floating-vessel"
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            role="alert"
            aria-live="assertive"
            className={cn(
              'fixed z-50 top-16 right-3 left-3 sm:left-auto sm:right-5 sm:w-[356px] max-w-[360px] mx-auto sm:mx-0',
              'rounded-2xl border bg-surface/95 backdrop-blur-xl shadow-2xl p-3.5',
              hasCritical
                ? 'border-danger/80 ring-1 ring-danger/30'
                : 'border-warning/80 ring-1 ring-warning/25'
            )}
          >
            <div className="flex items-start justify-between gap-2.5">
              <button
                type="button"
                onClick={() => setDiagnosticOpen(true)}
                className="flex items-start gap-2.5 text-left min-w-0 flex-1 group cursor-pointer"
              >
                <div
                  className={cn(
                    'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                    hasCritical
                      ? 'border-danger/50 bg-danger/15 text-danger'
                      : 'border-warning/50 bg-warning/15 text-warning'
                  )}
                >
                  <span
                    className={cn(
                      'absolute inset-0 rounded-xl animate-beacon-ring',
                      hasCritical ? 'bg-danger/35' : 'bg-warning/35'
                    )}
                  />
                  <AlertTriangle className="h-4 w-4 relative z-10" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={cn(
                        'text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                        hasCritical
                          ? 'bg-danger/20 text-danger'
                          : 'bg-warning/20 text-warning'
                      )}
                    >
                      {activeIncident.alertType}
                    </span>
                    <span className="text-[10px] font-mono text-foreground-muted">
                      {activeIncident.moduleCode}
                    </span>
                    {activeIncidents.length > 1 && (
                      <span className="text-[10px] font-mono text-accent font-semibold">
                        +{activeIncidents.length - 1} more
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-xs font-semibold text-foreground truncate group-hover:text-accent transition-colors">
                    {activeIncident.deviceName} · {activeIncident.roomName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-foreground-secondary line-clamp-2">
                    {playbook.headline}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setIsDocked(true)}
                aria-label="Minimize alert to corner beacon"
                title="Minimize to Corner Beacon"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-surface-elevated text-foreground-muted hover:text-foreground cursor-pointer"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDiagnosticOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline cursor-pointer"
              >
                <Sparkles className="h-3 w-3" />
                <span>Cause &amp; Guided Recovery Steps</span>
                <ChevronRight className="h-3 w-3" />
              </button>

              <span className="text-[10px] font-mono text-foreground-muted">
                Auto-docks in 5s
              </span>
            </div>
          </motion.aside>
        )}

        {/* 2. Docked Pulsating Corner Emergency Beacon */}
        {isDocked && !diagnosticOpen && (
          <motion.div
            key="docked-alert-beacon"
            layoutId="dd-emergency-floating-vessel"
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.75 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className={cn(
              'fixed z-50 bottom-20 md:bottom-6',
              beaconCorner === 'right' ? 'right-3.5 md:right-6' : 'left-3.5 md:left-6'
            )}
          >
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDiagnosticOpen(true)}
                aria-label={`Open emergency diagnostics (${activeIncidents.length} active alerts)`}
                className={cn(
                  'group relative flex items-center gap-2 rounded-full border px-3 py-2 shadow-xl backdrop-blur-xl transition-transform active:scale-95 cursor-pointer',
                  hasCritical
                    ? 'border-danger bg-surface/95 text-foreground ring-2 ring-danger/30'
                    : 'border-warning bg-surface/95 text-foreground ring-2 ring-warning/30'
                )}
              >
                {/* Pulsating Outer Ring */}
                <span
                  className={cn(
                    'absolute -inset-1 rounded-full animate-beacon-ring pointer-events-none',
                    hasCritical ? 'border-2 border-danger/60' : 'border-2 border-warning/60'
                  )}
                />

                <span
                  className={cn(
                    'relative flex h-6 w-6 items-center justify-center rounded-full text-white',
                    hasCritical ? 'bg-danger' : 'bg-warning text-slate-950'
                  )}
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                </span>

                <div className="text-left pr-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono font-bold tracking-tight">
                      {activeIncident.alertType}
                    </span>
                    <span
                      className={cn(
                        'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-mono font-bold',
                        hasCritical
                          ? 'bg-danger/20 text-danger'
                          : 'bg-warning/20 text-warning'
                      )}
                    >
                      {activeIncidents.length}
                    </span>
                  </div>
                  <span className="block text-[9px] text-foreground-muted leading-none">
                    Tap for cause &amp; fix
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setBeaconCorner((prev) => (prev === 'right' ? 'left' : 'right'))
                }
                title="Snap beacon to opposite corner"
                aria-label="Snap beacon to opposite corner"
                className="h-7 w-7 rounded-full border border-border/70 bg-surface/90 text-[10px] font-mono text-foreground-muted hover:text-foreground flex items-center justify-center shadow cursor-pointer"
              >
                ⇄
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Cause & Guided Solutions Diagnostic Modal / Bottom Sheet */}
      <AnimatePresence>
        {diagnosticOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
            onClick={() => setDiagnosticOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 36, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 28, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="incident-recovery-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto dd-scroll rounded-t-2xl sm:rounded-2xl border border-border bg-surface shadow-2xl p-4 sm:p-5 space-y-4"
            >
              {/* Sheet Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                      activeIncident.severity === 'CRITICAL'
                        ? 'border-danger/50 bg-danger/15 text-danger'
                        : 'border-warning/50 bg-warning/15 text-warning'
                    )}
                  >
                    <AlertOctagon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge
                        variant={
                          activeIncident.severity === 'CRITICAL' ? 'danger' : 'warning'
                        }
                      >
                        {activeIncident.alertType}
                      </Badge>
                      <Badge variant="mono">{activeIncident.moduleCode}</Badge>
                      {activeIncident.latched && (
                        <Badge variant="danger">G10 LATCHED</Badge>
                      )}
                    </div>
                    <h2
                      id="incident-recovery-title"
                      className="mt-1 text-sm font-semibold text-foreground"
                    >
                      {playbook.headline}
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDiagnosticOpen(false);
                    setIsDocked(true);
                  }}
                  aria-label="Close diagnostic sheet"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground-secondary hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Multi-Incident Pill Switcher (when > 1 active alert) */}
              {activeIncidents.length > 1 && (
                <div className="snap-strip gap-1.5 pb-1">
                  {activeIncidents.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedIncidentIdx(idx)}
                      className={cn(
                        'snap-start shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-mono transition-colors cursor-pointer',
                        idx === selectedIncidentIdx
                          ? 'border-accent bg-accent-soft text-accent font-semibold'
                          : 'border-border bg-surface-elevated text-foreground-secondary hover:text-foreground'
                      )}
                    >
                      {item.alertType} · {item.deviceName}
                    </button>
                  ))}
                </div>
              )}

              {/* Exact Root Cause Telemetry Box */}
              <div className="rounded-xl border border-border/80 bg-surface-elevated/70 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between text-[11px] font-mono text-foreground-muted">
                  <span>ROOT CAUSE DIAGNOSTIC</span>
                  <span>
                    {new Date(activeIncident.ts).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-foreground leading-relaxed">
                  {playbook.rootCauseSummary}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
                  <div className="rounded-lg bg-surface px-2.5 py-1.5 border border-border/60">
                    <span className="text-[9px] text-foreground-muted block">DEVICE / ROOM</span>
                    <span className="text-foreground font-semibold truncate block">
                      {activeIncident.deviceName}
                    </span>
                  </div>
                  <div className="rounded-lg bg-surface px-2.5 py-1.5 border border-border/60">
                    <span className="text-[9px] text-foreground-muted block">MEASURED / LIMIT</span>
                    <span className="text-foreground font-semibold tabular-nums">
                      {activeIncident.value !== undefined
                        ? `${activeIncident.value} / ${activeIncident.limit ?? '—'}`
                        : 'Threshold Event'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-surface px-2.5 py-1.5 border border-border/60 col-span-2 sm:col-span-1">
                    <span className="text-[9px] text-foreground-muted block">HARDWARE STATE</span>
                    <span
                      className={cn(
                        'font-semibold',
                        activeIncident.latched ? 'text-danger' : 'text-warning'
                      )}
                    >
                      {activeIncident.latched ? 'G10 Latched Lock' : 'Active Warning'}
                    </span>
                  </div>
                </div>
              </div>

              {/* G10 Hardware Lock Notice (No Remote Clear Button per Contract v1.4) */}
              {playbook.hardwareLockNotice && (
                <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 flex items-start gap-2.5 text-xs">
                  <Lock className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-semibold text-danger">
                      Physical 3-Second Reset Required (Protocol Rule G10)
                    </div>
                    <p className="text-[11px] text-foreground-secondary leading-relaxed">
                      {playbook.hardwareLockNotice}
                    </p>
                  </div>
                </div>
              )}

              {/* Tailored Step-by-Step Recovery Checklist */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-accent" />
                  <span>Guided Recovery Steps</span>
                </div>
                <ol className="space-y-2">
                  {playbook.steps.map((step, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-surface-elevated/40 p-2.5 text-xs text-foreground-secondary"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent font-mono text-[11px] font-bold">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed text-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Bench Simulator Quick-Action (Only for bench testing convenience, clearly labeled as Physical Hold Simulation) */}
              {activeIncident.latched && (
                <div className="rounded-xl border border-dashed border-border bg-surface-elevated/30 px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-foreground-muted font-mono">
                    Bench Simulator Only: Emulate 3s Physical Button Hold on {activeIncident.moduleCode}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      simulatorEngine.clearPhysicalFault(activeIncident.deviceId);
                      setDiagnosticOpen(false);
                    }}
                  >
                    Simulate 3s Physical Hold
                  </Button>
                </div>
              )}

              {/* Footer Actions: 1-Tap Inspect Device + Secondary Action */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDiagnosticOpen(false);
                    setIsDocked(true);
                  }}
                >
                  Dock to Corner Beacon
                </Button>

                <div className="flex flex-wrap items-center gap-2">
                  {playbook.secondaryAction && (
                    <Link
                      href={playbook.secondaryAction.href}
                      onClick={() => {
                        setDiagnosticOpen(false);
                        setIsDocked(true);
                      }}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors',
                        playbook.secondaryAction.isEmergencyCall
                          ? 'border-danger/60 bg-danger/15 text-danger hover:bg-danger/25'
                          : 'border-border bg-surface-elevated text-foreground hover:border-border-strong'
                      )}
                    >
                      {playbook.secondaryAction.isEmergencyCall && (
                        <PhoneCall className="h-3.5 w-3.5" />
                      )}
                      <span>{playbook.secondaryAction.label}</span>
                    </Link>
                  )}

                  <Link
                    href={playbook.primaryActionHref}
                    onClick={() => {
                      setDiagnosticOpen(false);
                      setIsDocked(true);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-semibold text-[var(--dd-accent-fg)] hover:opacity-95 transition-opacity"
                  >
                    <span>{playbook.primaryActionLabel}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
