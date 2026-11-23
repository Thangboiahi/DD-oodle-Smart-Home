'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GripVertical,
  Lock,
  PhoneCall,
  ShieldAlert,
  Sparkles,
  Volume2,
  VolumeX,
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

interface PersistedBeaconPos {
  edge: 'left' | 'right';
  yPct: number;
}

interface SafeRailMetrics {
  minY: number;
  maxY: number;
  bottomNavTop: number;
  viewportW: number;
  viewportH: number;
}

const STORAGE_KEY = 'dd_oodle_alert_beacon_pos_v1';
const BEACON_HEIGHT = 44;
const BEACON_WIDTH = 64;
const POPOVER_EST_HEIGHT = 224;
const DRAG_THRESHOLD_PX = 6;
const DEFAULT_POS: PersistedBeaconPos = { edge: 'right', yPct: 0.72 };

const ROOM_LABELS: Record<string, string> = {
  room_living: 'Living Room',
  room_master: 'Master Bedroom',
  room_kitchen: 'Kitchen & Utility',
  room_terrace: 'Terrace & Overhead Tank',
  room_garage: 'Garage & Hub',
};

function clamp(val: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(val, min), max);
}

function readPersistedPos(): PersistedBeaconPos {
  if (typeof window === 'undefined') return DEFAULT_POS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_POS;
    const parsed = JSON.parse(raw) as Partial<PersistedBeaconPos>;
    const edge: 'left' | 'right' = parsed.edge === 'left' ? 'left' : 'right';
    const yPct =
      typeof parsed.yPct === 'number' && Number.isFinite(parsed.yPct)
        ? clamp(parsed.yPct, 0, 1)
        : DEFAULT_POS.yPct;
    return { edge, yPct };
  } catch {
    return DEFAULT_POS;
  }
}

function savePersistedPos(pos: PersistedBeaconPos): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        edge: pos.edge,
        yPct: Number(clamp(pos.yPct, 0, 1).toFixed(4)),
      })
    );
  } catch {
    // Ignore storage quota / private mode failures
  }
}

function measureSafeRail(): SafeRailMetrics {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  const headerEl = document.querySelector('header');
  const headerBottom = headerEl
    ? Math.max(0, headerEl.getBoundingClientRect().bottom)
    : 60;

  const mobileNavEl = document.querySelector('nav[aria-label="Mobile Navigation"]');
  let bottomNavTop = viewportH;
  if (mobileNavEl) {
    const rect = mobileNavEl.getBoundingClientRect();
    if (rect.height > 0 && rect.top > 0 && rect.top < viewportH) {
      bottomNavTop = rect.top;
    }
  }

  const minY = Math.round(headerBottom) + 8;
  const maxY = Math.max(minY, Math.round(bottomNavTop) - BEACON_HEIGHT - 8);

  return {
    minY,
    maxY,
    bottomNavTop: Math.round(bottomNavTop),
    viewportW,
    viewportH,
  };
}

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

  // 1. Collect all active device faults/alerts + escalated/acknowledged Crash SOS
  const allActiveIncidents = useMemo<ActiveEmergencyIncident[]>(() => {
    const list: ActiveEmergencyIncident[] = [];

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

    for (const dev of Object.values(snapshot.devices)) {
      if (dev.last_alert?.cancelled) continue;
      const alertType = dev.state.fault ?? dev.last_alert?.type ?? null;
      if (!alertType) continue;

      // Avoid duplicating an active countdown crash modal (G13a remains immediate)
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
        ts: dev.last_alert?.ts ? dev.last_alert.ts * 1000 : dev.state.ts ? dev.state.ts * 1000 : 0,
        message: dev.last_alert?.message,
      });
    }

    return list;
  }, [snapshot]);

  // Local warning dismissals (NEVER applies to G10 latched faults or escalated Crash SOS)
  const [dismissedWarnings, setDismissedWarnings] = useState<Record<string, number>>({});
  const [silencedAlertIds, setSilencedAlertIds] = useState<Record<string, boolean>>({});
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [selectedIncidentIdx, setSelectedIncidentIdx] = useState(0);

  // Persisted edge-docked position + measured viewport safe rail
  const [persistedPos, setPersistedPos] = useState<PersistedBeaconPos>(DEFAULT_POS);
  const [rail, setRail] = useState<SafeRailMetrics | null>(null);

  // Active drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragCoords, setDragCoords] = useState<{ x: number; y: number } | null>(null);
  const dragSessionRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startBeaconX: number;
    startBeaconY: number;
    moved: boolean;
    rail: SafeRailMetrics;
    lastX: number;
    lastY: number;
  } | null>(null);

  const lastSignatureRef = useRef<string>('');

  const activeIncidents = useMemo(() => {
    return allActiveIncidents.filter((inc) => {
      if (inc.latched) return true;
      if (inc.alertType === 'CRASH_DETECTED' || inc.alertType === 'SOS_MANUAL') return true;
      return dismissedWarnings[inc.id] !== inc.ts;
    });
  }, [allActiveIncidents, dismissedWarnings]);

  const incidentSignature = useMemo(
    () => activeIncidents.map((i) => `${i.id}@${i.ts}`).join('|'),
    [activeIncidents]
  );

  // Hydrate persisted position & measure safe vertical rail between header & bottom nav
  useEffect(() => {
    const syncLayout = () => {
      setRail(measureSafeRail());
    };

    const rafId = window.requestAnimationFrame(() => {
      setPersistedPos(readPersistedPos());
      syncLayout();
    });

    window.addEventListener('resize', syncLayout);
    window.addEventListener('orientationchange', syncLayout);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', syncLayout);
      window.removeEventListener('orientationchange', syncLayout);
    };
  }, []);

  // Re-measure safe rail whenever incidents become visible (e.g. after route layout settles)
  useEffect(() => {
    if (activeIncidents.length === 0) return;
    const rafId = window.requestAnimationFrame(() => {
      setRail(measureSafeRail());
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [activeIncidents.length]);

  // On new alert arrival, briefly open the compact popover and auto-collapse to the edge beacon after 5s
  useEffect(() => {
    if (!incidentSignature) {
      lastSignatureRef.current = '';
      return;
    }

    const isNewAlert = incidentSignature !== lastSignatureRef.current;
    lastSignatureRef.current = incidentSignature;

    if (!isNewAlert) return;

    const openTimer = window.setTimeout(() => {
      setSelectedIncidentIdx(0);
      setPopoverOpen(true);
    }, 0);

    const autoCollapseTimer = window.setTimeout(() => {
      setPopoverOpen(false);
    }, 5200);

    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(autoCollapseTimer);
    };
  }, [incidentSignature]);

  // Header bell event opens the full Cause & Guided Recovery diagnostic sheet
  useEffect(() => {
    const onOpenDiagnostics = () => {
      if (allActiveIncidents.length > 0) {
        setDismissedWarnings({});
        setPopoverOpen(false);
        setDiagnosticOpen(true);
      }
    };
    window.addEventListener('ddoodle:open-emergency-sheet', onOpenDiagnostics);
    return () => window.removeEventListener('ddoodle:open-emergency-sheet', onOpenDiagnostics);
  }, [allActiveIncidents.length]);

  // Escape key closes inline popover or diagnostic sheet
  useEffect(() => {
    if (!popoverOpen && !diagnosticOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (diagnosticOpen) setDiagnosticOpen(false);
        else if (popoverOpen) setPopoverOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [popoverOpen, diagnosticOpen]);

  // Compute clamped docked pixel coordinates from persisted { edge, yPct }
  const dockedPosition = useMemo(() => {
    if (!rail) return null;
    const span = Math.max(0, rail.maxY - rail.minY);
    const y = clamp(Math.round(rail.minY + persistedPos.yPct * span), rail.minY, rail.maxY);
    const x = persistedPos.edge === 'left' ? 0 : Math.max(0, rail.viewportW - BEACON_WIDTH);
    return { x, y };
  }, [rail, persistedPos]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const currentRail = measureSafeRail();
      setRail(currentRail);

      const span = Math.max(0, currentRail.maxY - currentRail.minY);
      const startBeaconY = clamp(
        Math.round(currentRail.minY + persistedPos.yPct * span),
        currentRail.minY,
        currentRail.maxY
      );
      const startBeaconX =
        persistedPos.edge === 'left' ? 0 : Math.max(0, currentRail.viewportW - BEACON_WIDTH);

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic events may not support pointer capture
      }

      dragSessionRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startBeaconX,
        startBeaconY,
        moved: false,
        rail: currentRail,
        lastX: startBeaconX,
        lastY: startBeaconY,
      };
    },
    [persistedPos]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const dx = e.clientX - session.startClientX;
    const dy = e.clientY - session.startClientY;

    if (!session.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      session.moved = true;
      setIsDragging(true);
      setPopoverOpen(false);
    }

    if (session.moved) {
      const nextX = clamp(
        Math.round(session.startBeaconX + dx),
        0,
        Math.max(0, session.rail.viewportW - BEACON_WIDTH)
      );
      const nextY = clamp(
        Math.round(session.startBeaconY + dy),
        session.rail.minY,
        session.rail.maxY
      );
      session.lastX = nextX;
      session.lastY = nextY;
      setDragCoords({ x: nextX, y: nextY });
    }
  }, []);

  const finishPointerInteraction = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      dragSessionRef.current = null;

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore capture release error
      }

      if (!session.moved) {
        if (!cancelled) {
          setPopoverOpen((prev) => !prev);
        }
        return;
      }

      // Snap horizontally to nearest viewport edge and persist { edge, yPct }
      const centerX = session.lastX + BEACON_WIDTH / 2;
      const nextEdge: 'left' | 'right' = centerX < session.rail.viewportW / 2 ? 'left' : 'right';
      const span = Math.max(1, session.rail.maxY - session.rail.minY);
      const nextYPct = clamp((session.lastY - session.rail.minY) / span, 0, 1);
      const nextPos: PersistedBeaconPos = { edge: nextEdge, yPct: nextYPct };

      setPersistedPos(nextPos);
      savePersistedPos(nextPos);
      setIsDragging(false);
      setDragCoords(null);
    },
    []
  );

  if (activeIncidents.length === 0) {
    return null;
  }

  const safeIdx = Math.min(selectedIncidentIdx, activeIncidents.length - 1);
  const activeIncident = activeIncidents[safeIdx] ?? activeIncidents[0];
  const playbook = buildRecoveryPlaybook(activeIncident);
  const hasCritical = activeIncidents.some((i) => i.severity === 'CRITICAL');
  const isLifeSafetyCrash =
    activeIncident.alertType === 'CRASH_DETECTED' || activeIncident.alertType === 'SOS_MANUAL';
  const canDismissActive = !activeIncident.latched && !isLifeSafetyCrash;
  const isActiveSilenced = Boolean(silencedAlertIds[activeIncident.id]);
  const allSilenced = activeIncidents.every((i) => Boolean(silencedAlertIds[i.id]));
  const deviceHref =
    activeIncident.moduleCode === 'VEH-01'
      ? '/vehicles'
      : `/devices/${activeIncident.deviceId}`;

  const beaconX = isDragging && dragCoords ? dragCoords.x : dockedPosition?.x ?? 0;
  const beaconY = isDragging && dragCoords ? dragCoords.y : dockedPosition?.y ?? 200;

  // Compute viewport-clamped compact popover position anchored right beside the edge beacon
  const popoverGeometry = (() => {
    if (!rail || !dockedPosition) return null;
    const width = Math.min(296, Math.max(224, rail.viewportW - BEACON_WIDTH - 20));
    const left =
      persistedPos.edge === 'right'
        ? Math.max(8, rail.viewportW - BEACON_WIDTH - 10 - width)
        : Math.min(rail.viewportW - width - 8, BEACON_WIDTH + 10);

    const availBottom = rail.bottomNavTop - 8;
    let idealTop = dockedPosition.y;
    if (idealTop + POPOVER_EST_HEIGHT > availBottom) {
      idealTop = dockedPosition.y + BEACON_HEIGHT - POPOVER_EST_HEIGHT;
    }
    const top = clamp(
      Math.round(idealTop),
      rail.minY,
      Math.max(rail.minY, availBottom - POPOVER_EST_HEIGHT)
    );
    return { left: Math.round(left), top, width: Math.round(width) };
  })();

  const cycleIncident = (delta: number) => {
    if (activeIncidents.length <= 1) return;
    setSelectedIncidentIdx(
      (prev) => (prev + delta + activeIncidents.length) % activeIncidents.length
    );
  };

  const toggleSilenceActive = () => {
    setSilencedAlertIds((prev) => ({
      ...prev,
      [activeIncident.id]: !prev[activeIncident.id],
    }));
  };

  const dismissActiveWarning = () => {
    if (!canDismissActive) return;
    setDismissedWarnings((prev) => ({
      ...prev,
      [activeIncident.id]: activeIncident.ts,
    }));
    if (activeIncidents.length <= 1) {
      setPopoverOpen(false);
    } else {
      setSelectedIncidentIdx(0);
    }
  };

  return (
    <>
      {/* Transparent tap-outside backdrop while compact quick-actions popover is open */}
      {popoverOpen && !diagnosticOpen && !isDragging && (
        <div
          aria-hidden="true"
          onClick={() => setPopoverOpen(false)}
          className="fixed inset-0 z-40"
        />
      )}

      {/* 1. Compact Vertical-Draggable Edge-Docked Emergency Beacon (~44px tall) */}
      {rail && dockedPosition && !diagnosticOpen && (
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) => finishPointerInteraction(e, false)}
          onPointerCancel={(e) => finishPointerInteraction(e, true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setPopoverOpen((prev) => !prev);
            }
          }}
          aria-label={`Emergency alert beacon (${activeIncidents.length} active ${
            activeIncidents.length === 1 ? 'alert' : 'alerts'
          }). Tap for quick actions or drag vertically to reposition.`}
          aria-expanded={popoverOpen}
          aria-haspopup="dialog"
          style={{
            left: `${beaconX}px`,
            top: `${beaconY}px`,
            width: `${BEACON_WIDTH}px`,
            height: `${BEACON_HEIGHT}px`,
          }}
          className={cn(
            'fixed z-50 flex items-center justify-center gap-1 touch-none select-none cursor-grab active:cursor-grabbing',
            'bg-[var(--dd-surface-0)]/96 backdrop-blur-xl shadow-2xl border',
            isDragging
              ? 'rounded-full scale-105 shadow-2xl transition-none'
              : cn(
                  'transition-[left,top,border-radius,transform] duration-200 ease-out',
                  persistedPos.edge === 'right'
                    ? 'rounded-l-full rounded-r-none border-r-0 pl-2 pr-1.5'
                    : 'rounded-r-full rounded-l-none border-l-0 pl-1.5 pr-2'
                ),
            hasCritical
              ? 'border-danger/85 ring-1 ring-danger/35'
              : 'border-warning/85 ring-1 ring-warning/30'
          )}
        >
          {/* Subtle Pulsating Outer Ring (paused visually when all alerts are silenced or while dragging) */}
          {!allSilenced && !isDragging && (
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute -inset-[2px] animate-beacon-ring border-2',
                persistedPos.edge === 'right'
                  ? 'rounded-l-full rounded-r-none border-r-0'
                  : 'rounded-r-full rounded-l-none border-l-0',
                hasCritical ? 'border-danger/60' : 'border-warning/60'
              )}
            />
          )}

          {/* Drag Grip Handle on the edge-facing side */}
          {persistedPos.edge === 'left' && !isDragging && (
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-foreground-muted/70" />
          )}

          {/* Severity Icon + Unread Count Badge */}
          <span className="relative inline-flex items-center justify-center">
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full shadow-sm',
                hasCritical
                  ? 'bg-danger text-white'
                  : 'bg-warning text-slate-950'
              )}
            >
              {hasCritical ? (
                <ShieldAlert className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
            </span>

            <span
              className={cn(
                'absolute -top-1.5 -right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-mono font-bold leading-none ring-2 ring-[var(--dd-surface-0)]',
                hasCritical
                  ? 'bg-danger text-white'
                  : 'bg-warning text-slate-950'
              )}
            >
              {activeIncidents.length}
            </span>

            {allSilenced && (
              <span
                title="Alert tone silenced"
                className="absolute -bottom-1 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface-elevated border border-border text-foreground-muted"
              >
                <VolumeX className="h-2.5 w-2.5" />
              </span>
            )}
          </span>

          {persistedPos.edge === 'right' && !isDragging && (
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-foreground-muted/70" />
          )}
        </button>
      )}

      {/* 2. Compact Inline Quick-Actions Popover (Auto-flipped inside viewport) */}
      <AnimatePresence>
        {popoverOpen && !diagnosticOpen && !isDragging && popoverGeometry && (
          <motion.aside
            key="compact-alert-popover"
            role="dialog"
            aria-label={`Alert quick actions: ${activeIncident.alertType}`}
            initial={{
              opacity: 0,
              scale: 0.94,
              x: persistedPos.edge === 'right' ? 10 : -10,
            }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{
              opacity: 0,
              scale: 0.94,
              x: persistedPos.edge === 'right' ? 10 : -10,
              transition: { duration: 0.14 },
            }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            style={{
              left: `${popoverGeometry.left}px`,
              top: `${popoverGeometry.top}px`,
              width: `${popoverGeometry.width}px`,
            }}
            className={cn(
              'fixed z-50 rounded-2xl border bg-[var(--dd-surface-0)]/98 backdrop-blur-xl shadow-2xl p-3 space-y-2.5',
              activeIncident.severity === 'CRITICAL'
                ? 'border-danger/75 ring-1 ring-danger/25'
                : 'border-warning/75 ring-1 ring-warning/25'
            )}
          >
            {/* Row 1: Alert Title + < 1/N > Switcher + Close */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={cn(
                    'inline-flex h-2 w-2 shrink-0 rounded-full',
                    activeIncident.severity === 'CRITICAL' ? 'bg-danger' : 'bg-warning'
                  )}
                />
                <span
                  className={cn(
                    'text-[11px] font-mono font-bold uppercase tracking-tight truncate',
                    activeIncident.severity === 'CRITICAL' ? 'text-danger' : 'text-warning'
                  )}
                >
                  {activeIncident.alertType}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {activeIncidents.length > 1 && (
                  <div className="inline-flex items-center rounded-lg border border-border/80 bg-surface-elevated/80 px-0.5 h-6">
                    <button
                      type="button"
                      onClick={() => cycleIncident(-1)}
                      aria-label="Previous active alert"
                      className="inline-flex h-5 w-5 items-center justify-center rounded text-foreground-muted hover:text-foreground cursor-pointer"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="px-1 text-[10px] font-mono font-semibold text-foreground tabular-nums">
                      {safeIdx + 1}/{activeIncidents.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => cycleIncident(1)}
                      aria-label="Next active alert"
                      className="inline-flex h-5 w-5 items-center justify-center rounded text-foreground-muted hover:text-foreground cursor-pointer"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setPopoverOpen(false)}
                  aria-label="Close alert popover"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-border/70 bg-surface-elevated/80 text-foreground-muted hover:text-foreground cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Row 2: Offending Device Name & Concise Summary */}
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-foreground truncate">
                  {activeIncident.deviceName}
                </span>
                <span className="text-[10px] font-mono text-foreground-muted shrink-0">
                  {activeIncident.moduleCode}
                </span>
              </div>
              <p className="text-[11px] text-foreground-secondary leading-snug line-clamp-2">
                {playbook.headline}
              </p>
            </div>

            {/* Row 3: G10 Hardware Lock Badge (NEVER remote clear) OR Non-Latched Silence / Dismiss */}
            {activeIncident.latched ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-danger/45 bg-danger/10 px-2 py-1.5 text-[10px] font-medium text-danger">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <Lock className="h-3 w-3 shrink-0" />
                  <span className="truncate font-semibold">3s Physical Reset Required</span>
                </span>
                <span className="font-mono text-[9px] uppercase tracking-wider shrink-0 opacity-85">
                  G10 Lock
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleSilenceActive}
                  className={cn(
                    'flex-1 inline-flex h-7 items-center justify-center gap-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer',
                    isActiveSilenced
                      ? 'border-accent/50 bg-accent-soft text-accent'
                      : 'border-border/80 bg-surface-elevated/80 text-foreground-secondary hover:text-foreground'
                  )}
                >
                  {isActiveSilenced ? (
                    <>
                      <Volume2 className="h-3 w-3" />
                      <span>Silenced</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="h-3 w-3" />
                      <span>Silence</span>
                    </>
                  )}
                </button>

                {canDismissActive ? (
                  <button
                    type="button"
                    onClick={dismissActiveWarning}
                    className="flex-1 inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-border/80 bg-surface-elevated/80 text-[11px] font-medium text-foreground-secondary hover:text-foreground cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                    <span>Dismiss</span>
                  </button>
                ) : (
                  <Link
                    href="tel:112"
                    onClick={() => setPopoverOpen(false)}
                    className="flex-1 inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-danger/60 bg-danger/15 text-[11px] font-semibold text-danger hover:bg-danger/25"
                  >
                    <PhoneCall className="h-3 w-3" />
                    <span>Call 112</span>
                  </Link>
                )}
              </div>
            )}

            {/* Row 4: 1-Tap Quick Actions — Cause & Fix + Go to Device */}
            <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-border/60">
              <button
                type="button"
                onClick={() => {
                  setPopoverOpen(false);
                  setDiagnosticOpen(true);
                }}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-accent px-2.5 text-[11px] font-semibold text-[var(--dd-accent-fg)] hover:opacity-95 transition-opacity cursor-pointer"
              >
                <Sparkles className="h-3 w-3 shrink-0" />
                <span className="truncate">Cause &amp; Fix</span>
              </button>

              <Link
                href={deviceHref}
                onClick={() => setPopoverOpen(false)}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-border bg-surface-elevated px-2.5 text-[11px] font-medium text-foreground hover:border-border-strong transition-colors"
              >
                <span className="truncate">Go to Device</span>
                <ExternalLink className="h-3 w-3 shrink-0 text-foreground-muted" />
              </Link>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* 3. Full Cause & Guided Solutions Diagnostic Modal / Bottom Sheet */}
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
                  onClick={() => setDiagnosticOpen(false)}
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
                        idx === safeIdx
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
                  onClick={() => setDiagnosticOpen(false)}
                >
                  Minimize to Edge Beacon
                </Button>

                <div className="flex flex-wrap items-center gap-2">
                  {playbook.secondaryAction && (
                    <Link
                      href={playbook.secondaryAction.href}
                      onClick={() => setDiagnosticOpen(false)}
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
                    onClick={() => setDiagnosticOpen(false)}
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
