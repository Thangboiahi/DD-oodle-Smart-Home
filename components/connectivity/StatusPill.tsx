'use client';

import React, { useState } from 'react';
import {
  Cloud,
  HardDrive,
  Wifi,
  Bluetooth,
  Sliders,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  ShieldAlert,
  Smartphone,
  Key,
} from 'lucide-react';
import { ActiveTransportTier, BLE_GATT, LAN_TRANSPORT } from '@/lib/protocol/transports';
import { OperationMode } from '@/lib/protocol/contract';

interface StatusPillProps {
  transport: ActiveTransportTier;
  homeId: string;
  selectedDeviceId?: string;
  localPin?: string;
  onModeSelect?: (mode: OperationMode) => void;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  transport,
  selectedDeviceId = 'dd_pwr01_a1b2c3',
  localPin = '48291034',
  onModeSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [bleStatus, setBleStatus] = useState<string | null>(null);

  const getPillConfig = (tier: ActiveTransportTier) => {
    switch (tier) {
      case 'CLOUD':
        return {
          label: 'Cloud (4G/Wi-Fi)',
          shortLabel: 'Cloud',
          badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          dotClass: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
          icon: Cloud,
        };
      case 'LOCAL_HUB':
        return {
          label: 'Local Hub (Offline LAN)',
          shortLabel: 'Local Hub',
          badgeClass: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
          dotClass: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]',
          icon: HardDrive,
        };
      case 'DIRECT_LAN':
        return {
          label: 'Direct LAN',
          shortLabel: 'Direct LAN',
          badgeClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
          dotClass: 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]',
          icon: Wifi,
        };
      case 'DIRECT_BLE':
        return {
          label: 'Direct Bluetooth (BLE)',
          shortLabel: 'Direct BLE',
          badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
          dotClass: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
          icon: Bluetooth,
        };
      case 'MANUAL_FAILSAFE':
      default:
        return {
          label: 'Manual Failsafe',
          shortLabel: 'Failsafe',
          badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
          dotClass: 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.6)]',
          icon: Sliders,
        };
    }
  };

  const pill = getPillConfig(transport);
  const Icon = pill.icon;

  const localDeviceUrl = `http://ddoodle-${selectedDeviceId.toLowerCase().replace(/_/g, '-')}.local/`;

  const copyPin = () => {
    navigator.clipboard.writeText(localPin);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  const connectWebBluetooth = async () => {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      setBleStatus('Web Bluetooth is supported in Chrome for Android & Desktop. On iOS Safari, use the 1-tap Direct LAN link below.');
      return;
    }
    try {
      setBleStatus('Scanning for DD_OODLE_CTRL BLE peripherals...');
      const device = await (navigator as unknown as {
        bluetooth: {
          requestDevice: (opts: unknown) => Promise<{
            name: string;
            gatt: { connect: () => Promise<unknown> };
          }>;
        };
      }).bluetooth.requestDevice({
        filters: [{ namePrefix: BLE_GATT.DEVICE_NAME_PREFIX }],
        optionalServices: [BLE_GATT.SERVICE_UUID],
      });
      setBleStatus(`Connecting to ${device.name || 'DD oodle device'}...`);
      await device.gatt.connect();
      setBleStatus(`Connected via BLE (${BLE_GATT.SERVICE_UUID.slice(0, 8)}...). Encrypted command channel ready.`);
      if (onModeSelect) onModeSelect('BLE_ONLY');
    } catch (err) {
      setBleStatus(`BLE Scan: ${err instanceof Error ? err.message : 'Cancelled'}`);
    }
  };

  return (
    <>
      {/* Top Bar Status Pill */}
      <button
        onClick={() => setOpen(true)}
        className={`group flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95 ${pill.badgeClass}`}
      >
        <span className={`w-2 h-2 rounded-full animate-pulse ${pill.dotClass}`} />
        <Icon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline font-mono">{pill.label}</span>
        <span className="sm:hidden font-mono">{pill.shortLabel}</span>
        <ChevronRight className="w-3 h-3 opacity-60 group-hover:translate-x-0.5 transition" />
      </button>

      {/* Connectivity & Local Access Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg border ${pill.badgeClass}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">4-Tier Fail-Safe Connectivity</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Active Transport: <span className="text-emerald-400 font-bold">{pill.label}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Zero Mixed-Content Direct LAN Section (Spec Section 3 & G7) */}
            <div className="mt-5 rounded-xl border border-sky-500/30 bg-sky-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wider">
                  <Wifi className="w-4 h-4" />
                  <span>Offline LAN / iOS Safari (Zero Mixed-Content)</span>
                </div>
                <span className="text-[10px] font-mono bg-sky-900/50 text-sky-300 px-2 py-0.5 rounded border border-sky-700/50">
                  G7 Port 80
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                DD oodle ESP32 boards serve a standalone ~15 KB gzipped control page over plain HTTP/WS. To bypass browser mixed-content restrictions, open the top-level device portal:
              </p>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <a
                  href={localDeviceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Local Control ({selectedDeviceId})</span>
                </a>
                <a
                  href={LAN_TRANSPORT.HUB_LOCAL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition"
                >
                  <span>Hub Portal</span>
                </a>
              </div>

              {/* G7 8-Digit PIN */}
              <div className="flex items-center justify-between rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 text-slate-400 font-mono">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>G7 Local Device PIN:</span>
                  <span className="font-bold text-amber-300 tracking-wider text-sm">{localPin}</span>
                </div>
                <button
                  onClick={copyPin}
                  className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
                >
                  {copiedPin ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPin ? 'Copied' : 'Copy PIN'}</span>
                </button>
              </div>
            </div>

            {/* Direct Bluetooth (BLE) Manager */}
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold uppercase tracking-wider">
                  <Bluetooth className="w-4 h-4" />
                  <span>Direct Bluetooth (BLE_ONLY)</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">Android Chrome</span>
              </div>
              <p className="text-xs text-slate-400">
                Connect directly to the ESP32 hardware via Web Bluetooth using frozen service UUID <code className="text-slate-300 text-[11px] font-mono">dd000001</code>.
              </p>

              <button
                onClick={connectWebBluetooth}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-300 transition"
              >
                <Bluetooth className="w-3.5 h-3.5" />
                <span>Pair via Web Bluetooth (DD_OODLE_CTRL)</span>
              </button>

              {bleStatus && (
                <div className="rounded-lg bg-slate-900 border border-slate-800 p-2 text-[11px] font-mono text-slate-300">
                  {bleStatus}
                </div>
              )}
            </div>

            {/* Manual Transport Override */}
            {onModeSelect && (
              <div className="mt-4 border-t border-slate-800 pt-4 space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Manual Transport Simulation
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {(
                    [
                      ['CLOUD_DIRECT', 'Cloud (MQTT)', 'CLOUD'],
                      ['LOCAL_HUB', 'Local Hub (LAN)', 'LOCAL_HUB'],
                      ['LAN_ONLY', 'Direct LAN (mDNS)', 'DIRECT_LAN'],
                      ['BLE_ONLY', 'Direct BLE', 'DIRECT_BLE'],
                      ['FAILSAFE_MANUAL', 'Manual Failsafe', 'MANUAL_FAILSAFE'],
                    ] as const
                  ).map(([mode, label, tier]) => (
                    <button
                      key={mode}
                      onClick={() => onModeSelect(mode)}
                      className={`px-3 py-2 rounded-lg border text-left transition font-mono text-[11px] ${
                        transport === tier
                          ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300 font-semibold'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SoftAP 192.168.4.1 Provisioning Info */}
            <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500 font-mono">
              <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
              <span>SoftAP recovery fallback: Connect to &ldquo;DDoodle-Setup-XXXX&rdquo; at 192.168.4.1/api/v1/prov</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
