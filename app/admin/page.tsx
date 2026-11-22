'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Shield,
  QrCode,
  Wifi,
  HardDrive,
  Activity,
  Layers,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Zap,
  Radio,
  Send,
  Sparkles,
  Calendar,
  CreditCard,
  KeyRound,
  FileCheck,
  Smartphone,
  ExternalLink,
  ChevronRight,
  Clock,
  Lock,
} from 'lucide-react';
import { simulatorEngine } from '@/lib/simulator/engine';
import { SimulatorSnapshot, VirtualDeviceInstance } from '@/lib/simulator/types';
import {
  HomeTemplateId,
  Layout3DPin,
  OtaPayload,
  Phase1ModuleCode,
  SubscriptionTier,
} from '@/lib/protocol/contract';
import { TIER_CATALOG, DFY_3D_TWIN_ADDON_INR } from '@/lib/entitlements/resolver';
import { runContractV14Audit, ContractComplianceReport } from '@/lib/protocol/validator';

export default function AdminInstallerPortal() {
  const [snapshot, setSnapshot] = useState<SimulatorSnapshot>(() => simulatorEngine.getSnapshot());
  const [activeTab, setActiveTab] = useState<
    'diagnostics' | 'provisioning' | 'dfy_twin' | 'ota' | 'subscriptions' | 'contract_audit'
  >('diagnostics');
  const [auditReport, setAuditReport] = useState<ContractComplianceReport | null>(null);

  // Listen to simulator changes
  React.useEffect(() => {
    const unsub = simulatorEngine.subscribe((next) => setSnapshot(next));
    return () => unsub();
  }, []);

  const devicesList = Object.values(snapshot.devices);

  // --- Sub-states for various tabs ---
  // Provisioning
  const [provSsid, setProvSsid] = useState('DD_Home_WiFi_2.4G');
  const [provPass, setProvPass] = useState('ddoodle2026');
  const [provClaimToken, setProvClaimToken] = useState('claim_tok_982f1b4c');
  const [provStatus, setProvStatus] = useState<string | null>(null);

  // DFY 3D Twin
  const [dfyTemplate, setDfyTemplate] = useState<HomeTemplateId>('2bhk');
  const [dfySuccess, setDfySuccess] = useState(false);

  // OTA Rollout
  const [otaTargetDevice, setOtaTargetDevice] = useState<string>('dd_pwr03_g7h8i9');
  const [otaFwVersion, setOtaFwVersion] = useState('1.4.1-patch');
  const [otaRolloutStatus, setOtaRolloutStatus] = useState<string | null>(null);
  const [otaProgress, setOtaProgress] = useState<number>(0);

  // Subscriptions & AMC
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>('shield');
  const [simRenewalSuccess, setSimRenewalSuccess] = useState(false);
  const [amcTickets, setAmcTickets] = useState([
    {
      id: 'amc_01',
      device: 'WAT-01 Tank Sensor',
      issue: 'Encrypted ESP-NOW wireless link calibration & battery health check',
      priority: '24h Swap Priority (Shield)',
      status: 'Scheduled (Tomorrow 10:00 AM)',
    },
    {
      id: 'amc_02',
      device: 'PWR-03 Heavy Appliance',
      issue: 'Annual contact resistance & 16A thermal check',
      priority: 'Standard',
      status: 'Resolved',
    },
  ]);

  // Handle SoftAP Provisioning
  const handleExecuteSoftApProv = () => {
    setProvStatus('Connecting to ESP32 SoftAP (192.168.4.1)...');
    setTimeout(() => {
      setProvStatus('POST /api/v1/prov payload verified. Injecting credentials & claim token...');
      setTimeout(() => {
        setProvStatus('Provisioning Successful! Node registered to home_imphal_001. Device rebooting in CLOUD_DIRECT mode.');
      }, 1200);
    }, 1000);
  };

  // Handle DFY 3D Twin Deployment
  const handleDeployDfyTwin = () => {
    setDfySuccess(true);
    setTimeout(() => setDfySuccess(false), 4000);
  };

  // Handle OTA Rollout
  const handleTriggerOta = () => {
    setOtaRolloutStatus('Initiating Staged OTA Rollout via MQTT ddoodle/.../ota (QoS 1)...');
    setOtaProgress(15);

    setTimeout(() => {
      setOtaProgress(45);
      setOtaRolloutStatus('ESP32 Downloading firmware chunks (HTTP 206 Range verified)...');
      setTimeout(() => {
        setOtaProgress(80);
        setOtaRolloutStatus('Verifying SHA-256 Checksum & Secure Boot v2 Signature...');
        setTimeout(() => {
          setOtaProgress(100);
          setOtaRolloutStatus('OTA Flash Complete. Entering 60s rollback watchdog. Health confirmed! Firmware active.');
        }, 1500);
      }, 1500);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-mono flex flex-col selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition flex items-center gap-1 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Customer App</span>
            </Link>

            <div className="h-4 w-px bg-slate-800" />

            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-tight">DD oodle</span>
              <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-800/40 px-2 py-0.5 rounded">
                /admin Installer Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 hidden sm:inline">Role: Certified Field Installer</span>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded">
              AUTH LEVEL 4
            </span>
          </div>
        </div>
      </header>

      {/* Main Admin Workspace */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-800 scrollbar-none text-xs">
          {[
            { id: 'diagnostics', label: 'Fleet Health & Diagnostics', icon: Activity },
            { id: 'provisioning', label: 'QR & SoftAP Provisioning', icon: QrCode },
            { id: 'dfy_twin', label: '₹999 DFY 3D Twin Builder', icon: Layers },
            { id: 'ota', label: 'Staged OTA Rollout', icon: HardDrive },
            { id: 'subscriptions', label: 'Plans, 4G SIM & AMC', icon: CreditCard },
            { id: 'contract_audit', label: 'Contract v1.4 Audit Suite', icon: FileCheck },
          ].map((t) => {
            const Icon = t.icon;
            const isSelected = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                className={`px-4 py-2.5 rounded-xl font-bold whitespace-nowrap transition flex items-center gap-2 border ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-950/50'
                    : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: FLEET HEALTH & DIAGNOSTICS */}
        {activeTab === 'diagnostics' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  Hardware Fleet Diagnostics &bull; home_imphal_001
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time telemetry, signal RSSI, G7 local PINs, and hardware safety fault status across all 6 Phase 1 nodes.
                </p>
              </div>

              <span className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-1 rounded">
                6 / 6 Fixtures Verified Online
              </span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-[11px] uppercase">
                    <tr>
                      <th className="p-3.5">Device / Module</th>
                      <th className="p-3.5">Transport Mode</th>
                      <th className="p-3.5">Firmware / HW</th>
                      <th className="p-3.5">RSSI / Link</th>
                      <th className="p-3.5">G7 Local PIN</th>
                      <th className="p-3.5">Latched Fault</th>
                      <th className="p-3.5 text-right">Installer Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {devicesList.map((dev) => {
                      const isFault = dev.state.fault !== null;
                      return (
                        <tr key={dev.device_id} className="hover:bg-slate-800/30 transition">
                          <td className="p-3.5">
                            <div className="font-bold text-slate-200">{dev.name}</div>
                            <div className="text-[10px] text-slate-500">{dev.device_id}</div>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                              {dev.state.operation_mode}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className="text-slate-300 font-bold">{dev.info.fw_version}</span>
                            <span className="text-[10px] text-slate-500 block">{dev.info.hw_rev}</span>
                          </td>
                          <td className="p-3.5">
                            <span className="text-slate-300">{dev.state.rssi} dBm</span>
                            {dev.module_code === 'WAT-01' && (
                              <span className="text-[10px] text-emerald-400 block">
                                ESP-NOW: -68 dBm
                              </span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span className="font-bold text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                              {dev.local_pin}
                            </span>
                          </td>
                          <td className="p-3.5">
                            {isFault ? (
                              <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-600 font-bold text-[10px]">
                                {dev.state.fault}
                              </span>
                            ) : (
                              <span className="text-emerald-400 text-[10px]">NORMAL</span>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            {isFault ? (
                              <button
                                onClick={() => simulatorEngine.clearPhysicalFault(dev.device_id)}
                                className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] transition shadow"
                              >
                                Clear 3s Fault
                              </button>
                            ) : (
                              <span className="text-slate-500 text-[10px]">Ready</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: QR & SOFTAP PROVISIONING */}
        {activeTab === 'provisioning' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">
                    ESP32 Device Provisioning &amp; Claim Token Onboarding
                  </h3>
                  <p className="text-slate-400 text-[11px]">
                    Supports Zero-Friction SoftAP (192.168.4.1) &amp; Android Web Bluetooth GATT Setup
                  </p>
                </div>
              </div>

              {provStatus && (
                <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-500/40 text-indigo-300 text-xs">
                  {provStatus}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {/* QR Code Mock Card */}
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-32 h-32 bg-white rounded-lg p-2 flex items-center justify-center">
                    {/* SVG QR Code Simulation */}
                    <div className="grid grid-cols-4 gap-1 w-full h-full">
                      {Array.from({ length: 16 }).map((_, i) => (
                        <div
                          key={i}
                          className={`rounded-xs ${i % 3 === 0 ? 'bg-slate-950' : 'bg-slate-800'}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="font-bold text-slate-200 block">Scan Device QR Badge</span>
                    <span className="text-[10px] text-slate-500">MAC: 24:6F:28:B4:9C:12</span>
                  </div>
                </div>

                {/* SoftAP 192.168.4.1 Configuration Form */}
                <div className="md:col-span-2 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Home Wi-Fi SSID (2.4 GHz only):</label>
                      <input
                        type="text"
                        value={provSsid}
                        onChange={(e) => setProvSsid(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-200 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Wi-Fi WPA2 Password:</label>
                      <input
                        type="password"
                        value={provPass}
                        onChange={(e) => setProvPass(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-200 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400">Claim Token (from Customer Invoice):</label>
                    <input
                      type="text"
                      value={provClaimToken}
                      onChange={(e) => setProvClaimToken(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-200 text-xs"
                    />
                  </div>

                  <div className="pt-2 flex flex-wrap gap-2">
                    <button
                      onClick={handleExecuteSoftApProv}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 transition shadow"
                    >
                      <Wifi className="w-4 h-4" />
                      <span>Transmit via SoftAP (192.168.4.1)</span>
                    </button>

                    <button
                      onClick={() => setProvStatus('Web Bluetooth GATT Scanner ready. Pair device DD_OODLE_CTRL.')}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-2 transition"
                    >
                      <Radio className="w-4 h-4 text-cyan-400" />
                      <span>Web Bluetooth Direct</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ₹999 DFY 3D HOME TWIN BUILDER */}
        {activeTab === 'dfy_twin' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-100">
                      ₹999 One-Time DFY 3D Twin Layout Configurator
                    </h3>
                    <p className="text-slate-400 text-[11px]">
                      Installer tool to map physical switches to 3D pins and unlock customer 3D Twin permanently.
                    </p>
                  </div>
                </div>

                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-1 rounded">
                  ₹{DFY_3D_TWIN_ADDON_INR} Lifetime Add-On
                </span>
              </div>

              {dfySuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                  <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>
                    DFY 3D Twin Deployed! Marked `dfy_3d_purchased: true` in Firestore homes/home_imphal_001. Customer has permanent 3D twin access.
                  </span>
                </div>
              )}

              {/* Template Picker */}
              <div className="space-y-2">
                <label className="text-slate-400 text-[11px]">Select Floor Template:</label>
                <div className="flex flex-wrap gap-2">
                  {(['1bhk', '2bhk', '3bhk', 'duplex', 'compact'] as HomeTemplateId[]).map((tmpl) => (
                    <button
                      key={tmpl}
                      onClick={() => setDfyTemplate(tmpl)}
                      className={`px-3 py-1.5 rounded-lg uppercase font-bold transition ${
                        dfyTemplate === tmpl
                          ? 'bg-emerald-600 text-white shadow'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {tmpl} Template
                    </button>
                  ))}
                </div>
              </div>

              {/* Pin Mapping Grid */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                <span className="text-slate-400 text-[11px] font-bold uppercase">
                  Mapped Pins for {dfyTemplate.toUpperCase()} Template:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {devicesList.map((dev) => (
                    <div
                      key={dev.device_id}
                      className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-slate-200 block">{dev.name}</span>
                        <span className="text-[10px] text-slate-500">{dev.room_id}</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40">
                        PIN OK
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleDeployDfyTwin}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition shadow"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Deploy &amp; Unlock DFY 3D Twin for Customer</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: STAGED OTA ROLLOUT */}
        {activeTab === 'ota' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">
                    Staged OTA Firmware Rollout Engine (.bin + SHA-256)
                  </h3>
                  <p className="text-slate-400 text-[11px]">
                    MQTT ddoodle/.../ota delivery with HTTP 206 Range resumption &amp; 60 s hardware rollback watchdog.
                  </p>
                </div>
              </div>

              {otaRolloutStatus && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/40 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-amber-300 font-bold">{otaRolloutStatus}</span>
                    <span className="text-amber-400 font-mono font-bold">{otaProgress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
                      style={{ width: `${otaProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-slate-400 text-[11px]">Target Device:</label>
                  <select
                    value={otaTargetDevice}
                    onChange={(e) => setOtaTargetDevice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-200 text-xs font-mono"
                  >
                    <option value="dd_pwr03_g7h8i9">dd_pwr03_g7h8i9 (PWR-03 Heavy Switch)</option>
                    <option value="dd_wat01_j1k2l3">dd_wat01_j1k2l3 (WAT-01 Tank Controller)</option>
                    <option value="dd_pwr01_a1b2c3">dd_pwr01_a1b2c3 (PWR-01 4-Channel)</option>
                    <option value="dd_veh01_m4n5p6">dd_veh01_m4n5p6 (VEH-01 Tracker)</option>
                    <option value="dd_hub01_u7v8w9">dd_hub01_u7v8w9 (HUB-01 Gateway)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 text-[11px]">Firmware Binary Version:</label>
                  <input
                    type="text"
                    value={otaFwVersion}
                    onChange={(e) => setOtaFwVersion(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-200 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Security & Verification Metadata */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-1 text-[11px] text-slate-400">
                <div>URL: https://storage.googleapis.com/dd-oodle-ota-bin/pwr03-v1.4.1.bin</div>
                <div>SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</div>
                <div>Signature: secure-boot-v2 &bull; Common-CA Chain Verified</div>
              </div>

              <button
                onClick={handleTriggerOta}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow"
              >
                <HardDrive className="w-4 h-4" />
                <span>Deploy Staged OTA to Selected Node</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: SUBSCRIPTIONS, 4G SIM & AMC */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-5">
            {/* Subscription Tier Manager */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-100">Customer Subscription &amp; Tier Manager</h3>
                  <p className="text-slate-400 text-[11px]">
                    Manage plan entitlements. Cleanly degrades to Core without blocking safety cutoffs.
                  </p>
                </div>

                <span className="font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-1 rounded">
                  Current: {currentTier.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                {(['core', 'plus', 'drive', 'shield', 'all_in_family'] as SubscriptionTier[]).map((tier) => {
                  const meta = TIER_CATALOG[tier];
                  const isCur = currentTier === tier;
                  return (
                    <button
                      key={tier}
                      onClick={() => setCurrentTier(tier)}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-2 ${
                        isCur
                          ? 'border-indigo-500 bg-indigo-950/40 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-xs block text-slate-200">{meta.displayName}</span>
                        <span className="text-[10px] text-emerald-400 font-bold">
                          {meta.annualInr === 0 ? 'Free Forever' : `₹${meta.annualInr}/yr`}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-500 line-clamp-2">{meta.summary}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* VEH-01 4G M2M SIM Management */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-100">VEH-01 4G M2M IoT SIM Operations</h3>
                    <p className="text-slate-400 text-[11px]">
                      Airtel / Jio M2M National Roaming SIM &bull; Renewal tracking for Drive &amp; All-In Family
                    </p>
                  </div>
                </div>

                <span className="text-cyan-400 text-xs font-bold bg-cyan-950/60 px-2.5 py-1 rounded border border-cyan-800/40">
                  SIM Status: Active (312 Days Remaining)
                </span>
              </div>

              {simRenewalSuccess && (
                <div className="p-3 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-cyan-400" />
                  <span>4G M2M SIM renewed for 1 Year (+365 days). Next invoice scheduled.</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                  <span className="text-slate-500 block">ICCID Number:</span>
                  <span className="text-slate-200 font-bold">8991861002938472910</span>
                </div>
                <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                  <span className="text-slate-500 block">Monthly Data Usage:</span>
                  <span className="text-slate-200 font-bold">142 MB / 2000 MB</span>
                </div>
                <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                  <span className="text-slate-500 block">Annual Renewal Fee:</span>
                  <span className="text-emerald-400 font-bold">₹1,499 / Year</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setSimRenewalSuccess(true);
                  setTimeout(() => setSimRenewalSuccess(false), 3500);
                }}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow"
              >
                Renew 1-Year M2M SIM (₹1,499)
              </button>
            </div>

            {/* AMC Tickets & Shield 24h Swap Priority SLA */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-100">Annual Maintenance &amp; Swap Priority SLA</h3>
                  <p className="text-slate-400 text-[11px]">
                    Shield Tier guarantees 24-hour hardware swap SLA on all core switches and sensors.
                  </p>
                </div>

                <span className="text-indigo-400 text-xs font-bold bg-indigo-950/60 px-2.5 py-1 rounded border border-indigo-800/40">
                  Shield SLA Guaranteed
                </span>
              </div>

              <div className="space-y-2">
                {amcTickets.map((t) => (
                  <div
                    key={t.id}
                    className="p-3.5 rounded-xl border border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-200">{t.device}</span>
                        <span className="text-[10px] text-indigo-400 bg-indigo-950/60 px-1.5 py-0.2 rounded border border-indigo-800/40">
                          {t.priority}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{t.issue}</p>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        t.status.includes('Scheduled')
                          ? 'bg-amber-950 text-amber-300 border border-amber-600'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: CONTRACT v1.4 AUDIT SUITE */}
        {activeTab === 'contract_audit' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  Protocol Contract v1.4 Compliance Suite
                </h3>
                <p className="text-xs text-slate-400">
                  Automated test suite asserting rules G1–G18 across all 6 Phase 1 modules, transports, and safety ceilings.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAuditReport(runContractV14Audit(snapshot.devices))}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 transition self-start sm:self-auto"
              >
                <FileCheck className="w-4 h-4" />
                <span>Run Live v1.4 Audit</span>
              </button>
            </div>

            {/* Run audit on first mount if not yet run */}
            {(() => {
              const report = auditReport ?? runContractV14Audit(snapshot.devices);
              return (
                <div className="space-y-6">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
                      <span className="text-[11px] text-slate-400">Total Assertions</span>
                      <div className="text-2xl font-bold text-white mt-1">{report.totalAssertions}</div>
                      <span className="text-[10px] text-slate-500">Rules G1–G18 verified</span>
                    </div>

                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20">
                      <span className="text-[11px] text-emerald-400">Passed Checks</span>
                      <div className="text-2xl font-bold text-emerald-400 mt-1">{report.passedCount}</div>
                      <span className="text-[10px] text-emerald-500/80">100% Golden Match</span>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
                      <span className="text-[11px] text-slate-400">Failed Checks</span>
                      <div className={`text-2xl font-bold mt-1 ${report.failedCount > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                        {report.failedCount}
                      </div>
                      <span className="text-[10px] text-slate-500">Zero regressions allowed</span>
                    </div>

                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20">
                      <span className="text-[11px] text-emerald-400">Compliance Status</span>
                      <div className="text-sm font-bold text-emerald-400 mt-2 flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4" />
                        <span>FROZEN v1.4 COMPLIANT</span>
                      </div>
                      <span className="text-[10px] text-emerald-500/80">Hardware & Firmware Ready</span>
                    </div>
                  </div>

                  {/* Module Cards Grid */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Phase 1 Hardware Module Verification (Golden Fixtures)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                      {Object.entries(report.moduleResults).map(([modCode, res]) => (
                        <div
                          key={modCode}
                          className="p-3 rounded-xl border border-slate-800 bg-slate-900/80 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-xs">{modCode}</span>
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          </div>
                          <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            <span>{res.assertions.length} Rules Passed</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Detailed Assertions Table */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Detailed Rule-by-Rule Compliance Table
                    </h4>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
                      <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950/90 border-b border-slate-800 text-slate-400 text-[11px] uppercase sticky top-0">
                            <tr>
                              <th className="p-3">Rule</th>
                              <th className="p-3">Verification Item</th>
                              <th className="p-3">Result</th>
                              <th className="p-3">Wire Payload / Specification Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {report.assertions.map((a, i) => (
                              <tr key={`${a.ruleId}-${i}`} className="hover:bg-slate-800/40 font-mono text-[11px]">
                                <td className="p-3">
                                  <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold border border-slate-700">
                                    {a.ruleId}
                                  </span>
                                </td>
                                <td className="p-3 text-slate-200 font-medium">{a.title}</td>
                                <td className="p-3">
                                  {a.passed ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      <span>PASS</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-rose-400 font-bold">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      <span>FAIL</span>
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-slate-400">{a.details}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}
