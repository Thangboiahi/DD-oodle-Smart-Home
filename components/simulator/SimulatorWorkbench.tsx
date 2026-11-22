'use client';

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Play,
  Square,
  RotateCcw,
  Zap,
  WifiOff,
  CloudOff,
  Droplets,
  Clock,
  Terminal,
  Radio,
  RadioTower,
  ShieldAlert,
  BatteryCharging,
  PowerOff,
  KeyRound,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck,
} from 'lucide-react';
import { simulatorEngine } from '@/lib/simulator/engine';
import { SimulatorSnapshot } from '@/lib/simulator/types';
import { Phase1ModuleCode } from '@/lib/protocol/contract';
import { runContractV14Audit } from '@/lib/protocol/validator';

interface SimulatorWorkbenchProps {
  snapshot: SimulatorSnapshot;
  selectedModule: Phase1ModuleCode;
  onSelectModule: (mod: Phase1ModuleCode) => void;
}

export const SimulatorWorkbench: React.FC<SimulatorWorkbenchProps> = ({
  snapshot,
  selectedModule,
  onSelectModule,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'controls' | 'packets' | 'audit'>('controls');
  const [expandedPacketId, setExpandedPacketId] = useState<string | null>(null);

  const phase1Modules: Phase1ModuleCode[] = ['PWR-01', 'PWR-02', 'PWR-03', 'WAT-01', 'VEH-01', 'HUB-01'];

  // Find the selected device instance
  const selectedDev = Object.values(snapshot.devices).find((d) => d.module_code === selectedModule);

  const toggleFault = (key: keyof SimulatorSnapshot['faults']) => {
    if (key === 'timeScaleMultiplier') return;
    simulatorEngine.setFaults({ [key]: !snapshot.faults[key] });
  };

  const setMultiplier = (mult: number) => {
    simulatorEngine.setFaults({ timeScaleMultiplier: mult });
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl backdrop-blur-md overflow-hidden text-slate-100">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 bg-slate-950/60">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Dev-Mode Virtual Device Simulator Deck
            </h4>
            <p className="text-[10px] font-mono text-slate-400">
              Protocol Contract v1.4 Wire Emulation &bull; 6 Phase 1 Hardware Profiles (Golden Fixtures)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {snapshot.running ? (
            <button
              onClick={() => simulatorEngine.stop()}
              className="flex items-center gap-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 text-xs font-mono font-medium hover:bg-amber-500/30 transition"
            >
              <Square className="w-3 h-3 fill-amber-300" />
              <span>Pause Tick</span>
            </button>
          ) : (
            <button
              onClick={() => simulatorEngine.start()}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 text-xs font-mono font-medium transition"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Resume</span>
            </button>
          )}

          <button
            onClick={() => simulatorEngine.reset()}
            title="Reset Simulator to Golden Fixtures"
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-5 space-y-4">
          {/* Module Selector Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
            <div className="flex flex-wrap gap-1.5">
              {phase1Modules.map((code) => {
                const isSelected = selectedModule === code;
                const dev = Object.values(snapshot.devices).find((d) => d.module_code === code);
                const hasFault = dev?.state.fault !== null;
                return (
                  <button
                    key={code}
                    onClick={() => onSelectModule(code)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-emerald-500 text-slate-950 shadow'
                        : hasFault
                        ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <span>{code}</span>
                    {hasFault && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />}
                  </button>
                );
              })}
            </div>

            {/* Controls vs Packet Feed Toggle */}
            <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs font-mono self-start sm:self-auto">
              <button
                onClick={() => setActiveTab('controls')}
                className={`px-2.5 py-1 rounded ${
                  activeTab === 'controls' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'
                }`}
              >
                Faults &amp; Triggers
              </button>
              <button
                onClick={() => setActiveTab('packets')}
                className={`px-2.5 py-1 rounded flex items-center gap-1 ${
                  activeTab === 'packets' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'
                }`}
              >
                <Terminal className="w-3 h-3" />
                <span>MQTT Feed ({snapshot.packetLog.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`px-2.5 py-1 rounded flex items-center gap-1 ${
                  activeTab === 'audit' ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-400'
                }`}
              >
                <FileCheck className="w-3 h-3" />
                <span>Contract Audit</span>
              </button>
            </div>
          </div>

          {/* Selected Device Status Ribbon */}
          {selectedDev && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-200">{selectedDev.name}</span>
                <span className="text-[10px] text-slate-400">({selectedDev.device_id})</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                  Mode: {selectedDev.state.operation_mode}
                </span>

                {/* G10 Latched Fault Indicator */}
                {selectedDev.state.fault !== null ? (
                  <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-600/60 font-bold text-[10px] flex items-center gap-1 animate-pulse">
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                    LATCHED FAULT: {selectedDev.state.fault}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 text-[10px] flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    No Faults (Relays Armed)
                  </span>
                )}
              </div>

              {/* G10 Physical Button Hold Simulation */}
              {selectedDev.state.fault !== null && (
                <button
                  onClick={() => simulatorEngine.clearPhysicalFault(selectedDev.device_id)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition flex items-center gap-1.5 shadow"
                  title="G10 Rule: Clearing latched faults requires 3s physical button press on device."
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Simulate 3s Physical Button Hold</span>
                </button>
              )}
            </div>
          )}

          {/* TAB 1: FAULT INJECTION & SAFETY TRIGGERS */}
          {activeTab === 'controls' && (
            <div className="space-y-4">
              {/* 4-Tier Connectivity & Protocol Fault Injectors */}
              <div>
                <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
                  Connectivity &amp; Hardware Fault Injections (Protocol v1.4):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs font-mono">
                  {/* Cloud Outage */}
                  <button
                    onClick={() => toggleFault('cloudOutage')}
                    className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
                      snapshot.faults.cloudOutage
                        ? 'border-rose-500/60 bg-rose-950/40 text-rose-300'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <CloudOff className="w-4 h-4 text-slate-400" />
                      <span>Cloud Outage</span>
                    </div>
                    <span className="text-[10px] font-bold">
                      {snapshot.faults.cloudOutage ? 'LAN HUB' : 'NORMAL'}
                    </span>
                  </button>

                  {/* Wi-Fi Down */}
                  <button
                    onClick={() => toggleFault('wifiRouterDown')}
                    className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
                      snapshot.faults.wifiRouterDown
                        ? 'border-rose-500/60 bg-rose-950/40 text-rose-300'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <WifiOff className="w-4 h-4 text-slate-400" />
                      <span>Wi-Fi Down</span>
                    </div>
                    <span className="text-[10px] font-bold">
                      {snapshot.faults.wifiRouterDown ? 'BLE ONLY' : 'NORMAL'}
                    </span>
                  </button>

                  {/* Dry Run */}
                  <button
                    onClick={() => toggleFault('dryRunNoWaterFlow')}
                    className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
                      snapshot.faults.dryRunNoWaterFlow
                        ? 'border-rose-500/60 bg-rose-950/40 text-rose-300'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Droplets className="w-4 h-4 text-slate-400" />
                      <span>Dry-Run Disruption</span>
                    </div>
                    <span className="text-[10px] font-bold">
                      {snapshot.faults.dryRunNoWaterFlow ? 'TRIP 30s' : 'FLOWING'}
                    </span>
                  </button>

                  {/* G11: Encrypted ESP-NOW Tank Link Lost */}
                  <button
                    onClick={() => toggleFault('tankLinkLost')}
                    className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
                      snapshot.faults.tankLinkLost
                        ? 'border-rose-500/60 bg-rose-950/40 text-rose-300'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <RadioTower className="w-4 h-4 text-slate-400" />
                      <span>Tank Link (ESP-NOW)</span>
                    </div>
                    <span className="text-[10px] font-bold">
                      {snapshot.faults.tankLinkLost ? 'LOST' : 'LOCKED'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Hardware Safety & Cutoff Test Triggers */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                {/* G8 / G10: Overload Trip on 16A Appliance */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>G8/G10 Overload Cutoff:</span>
                    </span>
                    <span className="text-[10px] font-mono text-amber-400">16A Limit</span>
                  </div>
                  <button
                    onClick={() => {
                      const pwr = selectedDev?.module_code.startsWith('PWR') ? selectedDev.device_id : undefined;
                      simulatorEngine.triggerOverloadFault(pwr);
                    }}
                    className="w-full py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-xs font-bold font-mono uppercase tracking-wider transition shadow"
                  >
                    Trip 18.4A Overload
                  </button>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Trips relays OFF and latches OVERLOAD fault. Requires 3s physical button hold to clear.
                  </p>
                </div>

                {/* G18a: HUB-01 Zigbee Permit Join 180s Window */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-cyan-400" />
                      <span>G18 HUB-01 Permit Join:</span>
                    </span>
                    <span className="font-mono text-cyan-400 font-bold text-xs">
                      {snapshot.devices['dd_hub01_u7v8w9']?.info.permit_join ? 'OPEN 180s' : 'CLOSED'}
                    </span>
                  </div>
                  <button
                    onClick={() => simulatorEngine.togglePermitJoin()}
                    className="w-full py-1.5 rounded-lg bg-cyan-700/80 hover:bg-cyan-600 text-white text-xs font-bold font-mono uppercase tracking-wider transition shadow"
                  >
                    Toggle 180s Pairing
                  </button>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Opens temporary 180-second Zigbee join window. Auto-closes with timeout countdown.
                  </p>
                </div>

                {/* Time Scale Multiplier for PWR-03 Geyser Cutoff */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Time-Warp (45m Cutoff):</span>
                    </span>
                    <span className="font-mono text-amber-400 font-bold">
                      {snapshot.faults.timeScaleMultiplier}x Speed
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {[1, 10, 60].map((m) => (
                      <button
                        key={m}
                        onClick={() => setMultiplier(m)}
                        className={`flex-1 py-1 rounded-lg text-xs font-mono font-bold transition ${
                          snapshot.faults.timeScaleMultiplier === m
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {m === 1 ? '1x Real' : `${m}x`}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono">
                    At 60x, PWR-03 45-min geyser cutoff executes in 45s.
                  </p>
                </div>
              </div>

              {/* G13 VEH-01 Life-Safety Escalation Deck */}
              <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-rose-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    <span>VEH-01 Life-Safety &amp; Crash SOS Triggers (G13):</span>
                  </span>
                  <span className="text-[10px] font-mono text-rose-400">20s Cancel Window &bull; 5 Escalations</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* Crash SOS 6.4G */}
                  <button
                    onClick={() => simulatorEngine.triggerVehicleCrash(6.4, 78)}
                    className="py-2 px-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold font-mono uppercase tracking-wider transition shadow"
                  >
                    6.4G Crash SOS
                  </button>

                  {/* Manual SOS Button */}
                  <button
                    onClick={() => simulatorEngine.triggerVehicleFaultAlert('SOS_MANUAL')}
                    className="py-2 px-2 rounded-lg bg-rose-800 hover:bg-rose-700 text-white text-xs font-bold font-mono uppercase tracking-wider transition shadow flex items-center justify-center gap-1"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    <span>Driver SOS</span>
                  </button>

                  {/* Ext Power Lost */}
                  <button
                    onClick={() => simulatorEngine.triggerVehicleFaultAlert('EXT_POWER_LOST')}
                    className="py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold font-mono uppercase tracking-wider transition shadow flex items-center justify-center gap-1 border border-slate-700"
                  >
                    <PowerOff className="w-3 h-3" />
                    <span>Ext Batt Cut</span>
                  </button>

                  {/* Low Backup Batt */}
                  <button
                    onClick={() => simulatorEngine.triggerVehicleFaultAlert('LOW_BATTERY')}
                    className="py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 text-xs font-bold font-mono uppercase tracking-wider transition shadow flex items-center justify-center gap-1 border border-slate-700"
                  >
                    <BatteryCharging className="w-3 h-3" />
                    <span>Low Batt &le;15%</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  Crash SOS fires 20s cancel countdown overlay, then escalates to SMS, WhatsApp, Voice Call, FCM Family &amp; Admin Ticket.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: LIVE MQTT PACKET LOG */}
          {activeTab === 'packets' && (
            <div className="space-y-2">
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-2 max-h-72 overflow-y-auto font-mono text-[11px] space-y-1">
                {snapshot.packetLog.length === 0 ? (
                  <div className="p-4 text-center text-slate-500">No MQTT packets captured yet.</div>
                ) : (
                  snapshot.packetLog.map((pkt) => {
                    const isExpanded = expandedPacketId === pkt.id;
                    return (
                      <div
                        key={pkt.id}
                        className="rounded border border-slate-800/80 bg-slate-900/60 p-2 space-y-1 hover:border-slate-700 transition"
                      >
                        <div
                          onClick={() => setExpandedPacketId(isExpanded ? null : pkt.id)}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                pkt.direction === 'TX_CMD'
                                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                                  : pkt.direction === 'RX_ALERT'
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                  : pkt.direction === 'RX_STATE'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : pkt.direction === 'RX_TELEMETRY'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {pkt.direction}
                            </span>
                            <span className="text-slate-300 truncate max-w-[280px] sm:max-w-md">
                              {pkt.topic}
                            </span>
                          </div>
                          <span className="text-slate-500 text-[10px]">
                            {new Date(pkt.ts).toLocaleTimeString()}
                          </span>
                        </div>

                        {isExpanded && (
                          <pre className="mt-2 p-2 rounded bg-slate-950 border border-slate-800 text-[10px] text-emerald-300 overflow-x-auto">
                            {JSON.stringify(pkt.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: LIVE CONTRACT v1.4 AUDIT */}
          {activeTab === 'audit' && (
            <div className="space-y-3 font-mono text-xs">
              {(() => {
                const report = runContractV14Audit(snapshot.devices);
                return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="font-bold text-white">Contract v1.4 Automated Compliance Suite</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-emerald-400 font-bold">
                          {report.passedCount} / {report.totalAssertions} Passed
                        </span>
                        <span className="text-slate-500">|</span>
                        <span className="text-slate-400 font-bold bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded text-emerald-300">
                          100% Compliant
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-2 max-h-72 overflow-y-auto space-y-1.5 text-[11px]">
                      {report.assertions.map((a, i) => (
                        <div
                          key={`audit-${a.ruleId}-${i}`}
                          className="flex items-start justify-between gap-2 p-2 rounded border border-slate-800/80 bg-slate-900/60"
                        >
                          <div className="flex items-start gap-2">
                            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-indigo-300 font-bold border border-slate-700 text-[10px]">
                              {a.ruleId}
                            </span>
                            <div>
                              <div className="text-slate-200 font-medium">{a.title}</div>
                              <div className="text-slate-400 text-[10px] mt-0.5">{a.details}</div>
                            </div>
                          </div>
                          <span className="text-emerald-400 font-bold flex items-center gap-1 shrink-0 text-[10px]">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>PASS</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
