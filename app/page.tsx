'use client';

import React, { useEffect, useState } from 'react';
import {
  Home,
  Shield,
  Zap,
  Droplets,
  Car,
  Sparkles,
  Sliders,
  Layers,
  Activity,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle,
  Coffee,
  Sun,
  Moon,
  Battery,
  Box,
  Mic,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { simulatorEngine } from '@/lib/simulator/engine';
import { SimulatorSnapshot, VirtualDeviceInstance } from '@/lib/simulator/types';
import { Phase1ModuleCode } from '@/lib/protocol/contract';
import { resolveEntitlements } from '@/lib/entitlements/resolver';
import { StatusPill } from '@/components/connectivity/StatusPill';
import { PWAInstallButton } from '@/components/pwa/PWAInstallButton';
import { PlanBadge } from '@/components/entitlements/PlanBadge';
import { CrashSosModal } from '@/components/safety/CrashSosModal';
import { DynamicCapabilityCard } from '@/components/capabilities/DynamicCapabilityCard';
import { SimulatorWorkbench } from '@/components/simulator/SimulatorWorkbench';
import { VehicleLiveMap } from '@/components/map/VehicleLiveMap';
import { Home3DTwinView } from '@/components/twin/Home3DTwinView';
import { AutomationRulesEngine } from '@/components/rules/AutomationRulesEngine';
import { VoiceIntegrationsModal } from '@/components/voice/VoiceIntegrationsModal';
import { OfflineBanner } from '@/components/connectivity/OfflineBanner';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export default function DDoodleSmartHomeDashboard() {
  const [snapshot, setSnapshot] = useState<SimulatorSnapshot>(() => simulatorEngine.getSnapshot());
  const [activeMainView, setActiveMainView] = useState<
    'fixtures' | 'twin_3d' | 'vehicle_map' | 'automations'
  >('fixtures');
  const [showVoiceModal, setShowVoiceModal] = useState<boolean>(false);
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [selectedModule, setSelectedModule] = useState<Phase1ModuleCode>('PWR-01');
  const [showSimulator, setShowSimulator] = useState<boolean>(true);
  const [localAccessTarget, setLocalAccessTarget] = useState<{ id: string; pin: string } | null>(null);

  // Subscribe to real-time Virtual Device Simulator engine ticks
  useEffect(() => {
    simulatorEngine.start(1000);
    const unsubscribe = simulatorEngine.subscribe((nextSnap) => {
      setSnapshot(nextSnap);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Compute entitlements with automatic 90-day Plus trial
  const [initialTrialEndsAt] = useState(() => 1771488000000 + 89 * 24 * 60 * 60 * 1000);
  const entitlements = resolveEntitlements({
    tier: 'core',
    status: 'trial',
    trial_ends_at: initialTrialEndsAt,
    expires_at: null,
    dfy_3d_purchased: false,
  });

  const devicesList = Object.values(snapshot.devices);

  // Rooms definition
  const rooms = [
    { id: 'all', label: 'All Fixtures', count: devicesList.length },
    { id: 'room_living', label: 'Living Room', count: 2 },
    { id: 'room_bedroom', label: 'Master Bedroom', count: 1 },
    { id: 'room_bath', label: 'Master Bath', count: 1 },
    { id: 'room_terrace', label: 'Terrace Tank', count: 1 },
    { id: 'room_garage', label: 'Garage & Car', count: 1 },
  ];

  const filteredDevices = selectedRoom === 'all'
    ? devicesList
    : devicesList.filter((d) => d.room_id === selectedRoom);

  // Metric aggregates (Protocol Contract v1.4)
  const totalWatts = devicesList.reduce((acc, d) => {
    const p = d.telemetry as { p?: number; watts?: number };
    return acc + (p?.p ?? p?.watts ?? 0);
  }, 0);

  const totalKwh = devicesList.reduce((acc, d) => {
    const p = d.telemetry as { kwh?: number; kwh_today?: number };
    return acc + (p?.kwh ?? p?.kwh_today ?? 0);
  }, 0);

  const wat01 = snapshot.devices['dd_wat01_j1k2l3'];
  const watTel = wat01?.telemetry as { level_pct?: number; level_cm?: number; tank_link?: boolean };
  const waterLevel = watTel?.level_pct ?? 0;
  const waterDepthCm = watTel?.level_cm ?? Math.round(waterLevel * 2);
  const tankLinkLost = watTel?.tank_link === false;

  const veh01 = snapshot.devices['dd_veh01_m4n5p6'];
  const vehTel = veh01?.telemetry as { speed_kmh?: number; ignition?: boolean };
  const vehSpeed = vehTel?.speed_kmh ?? 0;
  const vehIgnition = vehTel?.ignition ?? false;
  const vehImmobilize = veh01?.state.immobilize ?? 'RELEASED';

  // 1-Tap Indian Recipe triggers
  const triggerRecipe = (recipe: string) => {
    if (recipe === 'inverter_saver') {
      simulatorEngine.sendCommand('dd_pwr03_g7h8i9', { ch1: false }, 'rule');
    } else if (recipe === 'geyser_morning') {
      simulatorEngine.sendCommand('dd_pwr03_g7h8i9', { ch1: true }, 'rule');
    } else if (recipe === 'tank_fill') {
      simulatorEngine.sendCommand('dd_wat01_j1k2l3', { pump_on: true }, 'rule');
    } else if (recipe === 'porch_lights') {
      const pwr01 = snapshot.devices['dd_pwr01_a1b2c3'];
      const next = !pwr01?.state.state.ch3;
      simulatorEngine.sendCommand('dd_pwr01_a1b2c3', { ch3: next }, 'rule');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-slate-950 font-black text-sm">
              DD
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-white">DD oodle</h1>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-1.5 rounded">
                  v1.4
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Imphal Residence (home_imphal_001)
              </p>
            </div>
          </div>

          {/* Right Action Tools */}
          <div className="flex items-center gap-2">
            {/* 4-Tier Connectivity Status Pill */}
            <StatusPill
              transport={snapshot.activeTransport}
              homeId={snapshot.home_id}
              selectedDeviceId={localAccessTarget?.id ?? 'dd_pwr01_a1b2c3'}
              localPin={localAccessTarget?.pin ?? '48291034'}
              onModeSelect={(mode) => simulatorEngine.setTransportModeOverride(mode)}
            />

            {/* Plan Badge */}
            <PlanBadge entitlements={entitlements} />

            {/* Voice C2C Trigger */}
            <button
              onClick={() => setShowVoiceModal(true)}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs font-mono"
              title="Voice Integrations (Google Home, Alexa, Siri)"
            >
              <Mic className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden lg:inline">Voice C2C</span>
            </button>

            {/* Admin Installer Portal Link */}
            <Link
              href="/admin"
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs font-mono"
              title="Installer & Admin Operations Portal"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden lg:inline">/admin</span>
            </Link>

            {/* In-App PWA Install */}
            <PWAInstallButton />

            {/* Simulator Workbench Toggle */}
            <button
              onClick={() => setShowSimulator(!showSimulator)}
              className={`p-1.5 rounded-lg border text-xs font-mono transition flex items-center gap-1.5 ${
                showSimulator
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Simulator</span>
            </button>
          </div>
        </div>
      </header>

      {/* Offline / Local Reconnect Banner */}
      <OfflineBanner
        activeTransport={snapshot.activeTransport}
        onSelectMode={(mode) => simulatorEngine.setTransportModeOverride(mode)}
        selectedDeviceId={localAccessTarget?.id ?? 'dd_pwr01_a1b2c3'}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        <ErrorBoundary>
          {/* Anti-Bricking Floor Notification Pill */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-300">
            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              <strong>Core Anti-Bricking Floor Active:</strong> Basic 4-Tier control, 2D Grid, 5 local schedules, and hardware safety cutoffs are permanently free forever.
            </span>
          </div>
          <span className="text-[11px] font-mono text-emerald-400/80 bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-700/40 self-start sm:self-auto">
            Zero-Lockout Floor
          </span>
        </div>

        {/* Real-Time Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> TOTAL ACTIVE LOAD
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-slate-100">{totalWatts.toFixed(0)}</span>
              <span className="text-xs text-slate-400 font-mono">Watts</span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-400 font-mono">
              ₹{(totalKwh * 7.5).toFixed(2)} cost today
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
              <Droplets className="w-3.5 h-3.5 text-sky-400" /> OVERHEAD TANK
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-sky-300">{waterLevel.toFixed(0)}%</span>
              <span className="text-xs text-slate-400 font-mono">({waterDepthCm} cm)</span>
            </div>
            <p className="mt-1 text-[11px] font-mono">
              {tankLinkLost ? (
                <span className="text-rose-400 font-semibold animate-pulse">Link Lost (ESP-NOW)</span>
              ) : wat01?.state.state.pump_on ? (
                <span className="text-emerald-400">Motor ON (Filling)</span>
              ) : (
                <span className="text-slate-400">Motor Standby</span>
              )}
            </p>
          </div>

          <div
            onClick={() => setActiveMainView('vehicle_map')}
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 cursor-pointer hover:border-cyan-500/50 transition group"
            title="Click to open Live Vehicle Map & Geofencing"
          >
            <span className="text-xs font-mono text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1 group-hover:text-cyan-400 transition">
                <Car className="w-3.5 h-3.5 text-indigo-400 group-hover:text-cyan-400" /> VEHICLE TRACKER
              </span>
              <span className="text-[10px] text-cyan-400 opacity-0 group-hover:opacity-100 transition">View Map &rarr;</span>
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-slate-100">{vehSpeed.toFixed(0)}</span>
              <span className="text-xs text-slate-400 font-mono">km/h</span>
            </div>
            <p className="mt-1 text-[11px] font-mono">
              {vehImmobilize === 'ENGAGED' ? (
                <span className="text-rose-400 font-bold">Starter Cut ENGAGED</span>
              ) : vehImmobilize === 'PENDING' ? (
                <span className="text-amber-400 font-bold">Cut PENDING (&lt;5km/h)</span>
              ) : vehIgnition ? (
                <span className="text-emerald-400">Ignition Active (NH-2)</span>
              ) : (
                <span className="text-slate-400">Parked in Garage</span>
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-emerald-400" /> LIFE-SAFETY GUARDS
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-emerald-400">ARMED</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 font-mono">
              20s Crash SOS &bull; Dry-Run &bull; 45m Geyser
            </p>
          </div>
        </div>

        {/* Sprint 2 Main View Mode Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveMainView('fixtures')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 border ${
                activeMainView === 'fixtures'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/50'
                  : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Fixtures &amp; 2D Grid</span>
              <span className="text-[10px] opacity-75 font-mono">({devicesList.length})</span>
            </button>

            <button
              onClick={() => setActiveMainView('twin_3d')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 border ${
                activeMainView === 'twin_3d'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/50'
                  : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Box className="w-4 h-4 text-emerald-300" />
              <span>3D Home Twin View</span>
              <span className="text-[9px] bg-emerald-950/80 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-700/50">
                Plus / 90d Trial
              </span>
            </button>

            <button
              onClick={() => setActiveMainView('vehicle_map')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 border ${
                activeMainView === 'vehicle_map'
                  ? 'bg-cyan-600 text-white border-cyan-500 shadow-lg shadow-cyan-950/50'
                  : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Car className="w-4 h-4 text-cyan-300" />
              <span>Live Vehicle Map &amp; Geofencing</span>
              <span className="text-[9px] bg-cyan-950/80 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-700/50">
                MapLibre + OSM
              </span>
            </button>

            <button
              onClick={() => setActiveMainView('automations')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 border ${
                activeMainView === 'automations'
                  ? 'bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-950/50'
                  : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Hybrid Automations</span>
              <span className="text-[9px] bg-amber-950/80 text-amber-300 px-1.5 py-0.5 rounded border border-amber-700/50">
                G17 Engine
              </span>
            </button>
          </div>
        </div>

        {/* VIEW 1: 3D HOME DIGITAL TWIN */}
        {activeMainView === 'twin_3d' && (
          <Home3DTwinView
            devices={snapshot.devices}
            entitlements={entitlements}
            onSendCommand={(deviceId, set) => simulatorEngine.sendCommand(deviceId, set, 'pwa_cloud')}
            onClearPhysicalFault={(deviceId) => simulatorEngine.clearPhysicalFault(deviceId)}
          />
        )}

        {/* VIEW 2: LIVE VEHICLE MAP & GEOFENCING */}
        {activeMainView === 'vehicle_map' && snapshot.devices['dd_veh01_m4n5p6'] && (
          <VehicleLiveMap
            vehicleDevice={snapshot.devices['dd_veh01_m4n5p6']}
            onCommandImmobilize={(imm) =>
              simulatorEngine.sendCommand('dd_veh01_m4n5p6', { immobilize: imm }, 'pwa_cloud')
            }
            onTriggerCrashSos={() => simulatorEngine.triggerVehicleCrash(6.4, 78)}
          />
        )}

        {/* VIEW 3: HYBRID AUTOMATION ENGINE */}
        {activeMainView === 'automations' && (
          <AutomationRulesEngine
            entitlements={entitlements}
            selectedModule={selectedModule}
            onSelectModule={(m) => setSelectedModule(m)}
          />
        )}

        {/* VIEW 3: FIXTURES & 2D ROOM GRID */}
        {activeMainView === 'fixtures' && (
          <>
            {/* 1-Tap Indian Home Presets & Quick Scenes */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    1-Tap Indian Recipes &amp; Quick Scenes
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-slate-500">Autonomous Offline Execution</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                <button
                  onClick={() => triggerRecipe('inverter_saver')}
                  className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-amber-500/50 hover:bg-slate-900 text-left transition space-y-1"
                >
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                    <Battery className="w-3.5 h-3.5" />
                    <span>Inverter Saver</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Instantly cuts 16A Geyser &amp; heavy heating loads</p>
                </button>

                <button
                  onClick={() => triggerRecipe('geyser_morning')}
                  className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-sky-500/50 hover:bg-slate-900 text-left transition space-y-1"
                >
                  <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
                    <Sun className="w-3.5 h-3.5" />
                    <span>Morning Geyser</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Turns on PWR-03 with 45m non-overridable auto-cutoff</p>
                </button>

                <button
                  onClick={() => triggerRecipe('tank_fill')}
                  className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-blue-500/50 hover:bg-slate-900 text-left transition space-y-1"
                >
                  <div className="flex items-center gap-1.5 text-blue-400 font-semibold">
                    <Droplets className="w-3.5 h-3.5" />
                    <span>Auto-Fill Tank</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Starts pump with 30s dry-run hardware interlock</p>
                </button>

                <button
                  onClick={() => triggerRecipe('porch_lights')}
                  className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-emerald-500/50 hover:bg-slate-900 text-left transition space-y-1"
                >
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <Moon className="w-3.5 h-3.5" />
                    <span>Porch Lights</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Toggles evening exterior lights on PWR-01 Ch3</p>
                </button>
              </div>
            </div>

            {/* 2D Room Grid Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRoom(r.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                    selectedRoom === r.id
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <span>{r.label}</span>
                  <span className="text-[10px] opacity-75 font-mono">({r.count})</span>
                </button>
              ))}
            </div>

            {/* Capability-Driven Dynamic Device Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredDevices.map((dev) => (
                <DynamicCapabilityCard
                  key={dev.device_id}
                  device={dev}
                  onSendCommand={(deviceId, set) => simulatorEngine.sendCommand(deviceId, set, 'pwa_cloud')}
                  onTriggerCrash={() => simulatorEngine.triggerVehicleCrash(6.4, 78)}
                  onOpenLocalAccess={(id, pin) => setLocalAccessTarget({ id, pin })}
                />
              ))}
            </div>
          </>
        )}

        {/* Dev-Mode Virtual Device Simulator Deck (Expandable) */}
        {showSimulator && (
          <div className="pt-6">
            <SimulatorWorkbench
              snapshot={snapshot}
              selectedModule={selectedModule}
              onSelectModule={(m) => setSelectedModule(m)}
            />
          </div>
        )}
        </ErrorBoundary>
      </main>

      {/* 20-Second Life-Safety Crash SOS Countdown Modal */}
      <CrashSosModal
        session={snapshot.activeCrashSos}
        onCancelSos={() => simulatorEngine.cancelCrashSos()}
        onDismiss={() => simulatorEngine.cancelCrashSos()}
      />

      {/* Phase 1.5 Voice C2C Integration Hub Modal */}
      <VoiceIntegrationsModal
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        entitlements={entitlements}
        onTestScene={(scene) => triggerRecipe(scene)}
      />
    </div>
  );
}
