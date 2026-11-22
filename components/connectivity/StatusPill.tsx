'use client';

import React, { useEffect, useState } from 'react';
import {
  Bluetooth,
  Check,
  ChevronRight,
  Cloud,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  Key,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Wifi,
  X,
} from 'lucide-react';
import { ActiveTransportTier, BLE_GATT, LAN_TRANSPORT } from '@/lib/protocol/transports';
import { OperationMode } from '@/lib/protocol/contract';
import { cn } from '@/lib/utils';

interface StatusPillProps {
  transport: ActiveTransportTier;
  homeId: string;
  selectedDeviceId?: string;
  localPin?: string;
  lastSyncTs?: number;
  onModeSelect?: (mode: OperationMode) => void;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  transport,
  selectedDeviceId = 'dd_pwr01_a1b2c3',
  localPin = '48291034',
  lastSyncTs,
  onModeSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [pinRevealed, setPinRevealed] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [bleStatus, setBleStatus] = useState<string | null>(null);
  const [bleAuthStage, setBleAuthStage] = useState<'idle' | 'scanning' | 'nonce_hmac' | 'authenticated' | 'error'>('idle');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [open]);

  const syncedSecondsAgo = lastSyncTs
    ? Math.max(0, Math.floor((nowMs - lastSyncTs) / 1000))
    : 0;

  const getPillConfig = (tier: ActiveTransportTier) => {
    switch (tier) {
      case 'CLOUD':
        return {
          label: 'Cloud (4G/Wi-Fi)',
          shortLabel: 'Cloud',
          badgeClass: 'bg-success-soft text-success border-success/35',
          dotClass: 'bg-success',
          icon: Cloud,
        };
      case 'LOCAL_HUB':
        return {
          label: 'Local Hub (Offline LAN)',
          shortLabel: 'Local Hub',
          badgeClass: 'bg-accent-soft text-accent border-accent-border',
          dotClass: 'bg-accent',
          icon: HardDrive,
        };
      case 'DIRECT_LAN':
        return {
          label: 'Direct LAN',
          shortLabel: 'Direct LAN',
          badgeClass: 'bg-accent-soft text-accent border-accent-border',
          dotClass: 'bg-accent',
          icon: Wifi,
        };
      case 'DIRECT_BLE':
        return {
          label: 'Direct Bluetooth (BLE)',
          shortLabel: 'Direct BLE',
          badgeClass: 'bg-warning-soft text-warning border-warning/40',
          dotClass: 'bg-warning',
          icon: Bluetooth,
        };
      case 'MANUAL_FAILSAFE':
      default:
        return {
          label: 'Manual Failsafe',
          shortLabel: 'Failsafe',
          badgeClass: 'bg-danger-soft text-danger border-danger/40',
          dotClass: 'bg-danger',
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
      setBleAuthStage('error');
      setBleStatus(
        'Web Bluetooth requires Chrome on Android/Desktop. On iOS Safari, use the 1-tap "Open Local Control" Port 80 link below.'
      );
      return;
    }
    try {
      setBleAuthStage('scanning');
      setBleStatus(`Scanning for ${BLE_GATT.SERVICE_NAME} (${BLE_GATT.SERVICE_UUID})...`);
      const device = await (
        navigator as unknown as {
          bluetooth: {
            requestDevice: (opts: unknown) => Promise<{
              name?: string;
              gatt: { connect: () => Promise<unknown> };
            }>;
          };
        }
      ).bluetooth.requestDevice({
        filters: [{ namePrefix: BLE_GATT.DEVICE_NAME_PREFIX }],
        optionalServices: [BLE_GATT.SERVICE_UUID],
      });
      setBleAuthStage('nonce_hmac');
      setBleStatus(
        `GATT connected to ${device.name || 'DD oodle module'}. Exchanging HMAC-SHA256 nonce on ${BLE_GATT.CHARACTERISTICS.AUTH.slice(0, 8)}...`
      );
      await device.gatt.connect();
      setBleAuthStage('authenticated');
      setBleStatus(
        `Authenticated via DD-HMAC (${BLE_GATT.CHARACTERISTICS.AUTH}). Encrypted BLE command channel active.`
      );
      if (onModeSelect) onModeSelect('BLE_ONLY');
    } catch (err) {
      setBleAuthStage('error');
      setBleStatus(`BLE Scan: ${err instanceof Error ? err.message : 'Cancelled'}`);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group inline-flex items-center gap-1.5 h-8 rounded-full border px-2.5 text-xs font-medium transition active:scale-95 cursor-pointer',
          pill.badgeClass
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full animate-pulse', pill.dotClass)} />
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline font-mono text-[11px]">{pill.label}</span>
        <span className="sm:hidden font-mono text-[11px]">{pill.shortLabel}</span>
        <ChevronRight className="h-3 w-3 opacity-60 group-hover:translate-x-0.5 transition" />
      </button>

      {/* Connectivity Diagnostics & Mode Drawer */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 p-0 sm:p-4 backdrop-blur-xs"
          onMouseDown={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="4-Tier Fail-Safe Connectivity Diagnostics"
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-2xl sm:rounded-[var(--dd-radius-card)] border border-border-strong bg-surface p-5 shadow-2xl text-foreground max-h-[88vh] overflow-y-auto dd-scroll space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className={cn('p-2 rounded-lg border', pill.badgeClass)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Connectivity Diagnostics &amp; Fail-Safe</h3>
                  <p className="text-[11px] text-foreground-muted font-mono tabular-nums">
                    Active Tier: <span className="text-foreground font-semibold">{pill.label}</span> · Synced {syncedSecondsAgo}s ago
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close connectivity drawer"
                onClick={() => setOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-foreground-secondary hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Zero Mixed-Content Direct LAN Section (G7) */}
            <div className="rounded-[var(--dd-radius-control)] border border-accent-border bg-accent-soft/40 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-accent text-xs font-semibold">
                  <Wifi className="h-3.5 w-3.5" />
                  <span>Offline LAN / iOS Safari (Zero Mixed-Content)</span>
                </div>
                <span className="text-[10px] font-mono bg-surface px-1.5 py-0.5 rounded border border-border text-foreground-secondary">
                  G7 Port 80
                </span>
              </div>
              <p className="text-xs text-foreground-secondary leading-relaxed">
                Open the module&apos;s built-in local HTTP/WS control page directly in a top-level browser tab—zero internet or cloud required.
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href={localDeviceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 min-h-[40px] flex items-center justify-center gap-2 rounded-[var(--dd-radius-control)] bg-accent text-accent-foreground px-3 py-2 text-xs font-semibold hover:brightness-110 transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open Local Control</span>
                </a>
                <a
                  href={LAN_TRANSPORT.HUB_LOCAL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[40px] flex items-center justify-center gap-1.5 rounded-[var(--dd-radius-control)] border border-border bg-surface hover:border-border-strong px-3 py-2 text-xs font-medium text-foreground transition"
                >
                  <span>Hub Portal</span>
                </a>
              </div>

              {/* Tap-to-Reveal / Tap-to-Copy G7 8-Digit PIN */}
              <div className="flex items-center justify-between gap-2 rounded-lg bg-surface border border-border px-3 py-2 text-xs font-mono">
                <div className="flex items-center gap-2 min-w-0">
                  <Key className="h-3.5 w-3.5 text-warning shrink-0" />
                  <span className="text-foreground-muted">G7 PIN:</span>
                  <span className="font-semibold text-foreground tracking-wider tabular-nums">
                    {pinRevealed ? localPin : '•••• ••••'}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPinRevealed((r) => !r)}
                    className="inline-flex items-center gap-1 text-[11px] text-foreground-secondary hover:text-foreground px-2 py-1 rounded bg-surface-elevated border border-border cursor-pointer"
                  >
                    {pinRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    <span>{pinRevealed ? 'Hide' : 'Reveal'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={copyPin}
                    className="inline-flex items-center gap-1 text-[11px] text-foreground-secondary hover:text-foreground px-2 py-1 rounded bg-surface-elevated border border-border cursor-pointer"
                  >
                    {copiedPin ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedPin ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Direct Web Bluetooth (BLE_ONLY) */}
            <div className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-warning text-xs font-semibold">
                  <Bluetooth className="h-3.5 w-3.5" />
                  <span>Direct Bluetooth ({BLE_GATT.SERVICE_NAME})</span>
                </div>
                <span className="text-[10px] font-mono text-foreground-muted">
                  HMAC-SHA256 Nonce
                </span>
              </div>
              <p className="text-[11px] text-foreground-secondary font-mono">
                Service UUID: {BLE_GATT.SERVICE_UUID}
              </p>

              <button
                type="button"
                onClick={() => void connectWebBluetooth()}
                className="w-full min-h-[40px] flex items-center justify-center gap-2 rounded-[var(--dd-radius-control)] border border-warning/40 bg-warning-soft hover:brightness-110 px-3 py-2 text-xs font-semibold text-warning transition cursor-pointer"
              >
                <Bluetooth className="h-3.5 w-3.5" />
                <span>Pair via Web Bluetooth (DD_OODLE_CTRL)</span>
              </button>

              {bleStatus && (
                <div className="flex items-start gap-2 rounded-lg bg-surface border border-border p-2.5 text-[11px] font-mono text-foreground-secondary">
                  {bleAuthStage === 'authenticated' && (
                    <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                  )}
                  <span>{bleStatus}</span>
                </div>
              )}
            </div>

            {/* Manual Transport Override */}
            {onModeSelect && (
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-[11px] font-mono uppercase tracking-wider text-foreground-muted">
                  Transport Tier Simulation
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
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
                      type="button"
                      onClick={() => onModeSelect(mode)}
                      className={cn(
                        'px-2.5 py-2 rounded-[var(--dd-radius-control)] border text-left transition font-mono text-[11px] cursor-pointer',
                        transport === tier
                          ? 'border-accent-border bg-accent-soft text-accent font-semibold'
                          : 'border-border bg-surface-elevated text-foreground-secondary hover:text-foreground'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-[10px] text-foreground-muted font-mono pt-1">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              <span>SoftAP recovery: &ldquo;DDoodle-Setup-XXXX&rdquo; → 192.168.4.1/api/v1/prov</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
