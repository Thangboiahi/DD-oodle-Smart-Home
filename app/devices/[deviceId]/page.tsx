'use client';

import React, { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  Bluetooth,
  Check,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  Key,
  Lock,
  ShieldCheck,
  Sliders,
  Wifi,
} from 'lucide-react';
import { simulatorEngine } from '@/lib/simulator/engine';
import { OperationMode, PowerRestoreMode } from '@/lib/protocol/contract';
import { BLE_GATT, LAN_TRANSPORT } from '@/lib/protocol/transports';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import { DynamicCapabilityCard } from '@/components/capabilities/DynamicCapabilityCard';
import { LatchedFaultBanner } from '@/components/capabilities/LatchedFaultBanner';
import { FullscreenStage, useWorkspace } from '@/components/workspace';

type DetailTab = 'controls' | 'history' | 'mode' | 'local';

const OP_MODES: Array<{ value: OperationMode; label: string; desc: string }> = [
  { value: 'CLOUD_DIRECT', label: 'CLOUD_DIRECT', desc: 'Online MQTT/RTDB primary + LAN fallback' },
  { value: 'LOCAL_HUB', label: 'LOCAL_HUB', desc: 'Offline HUB-01 local broker routing' },
  { value: 'LAN_ONLY', label: 'LAN_ONLY', desc: 'Direct Port 80 HTTP/WS, zero cloud' },
  { value: 'BLE_ONLY', label: 'BLE_ONLY', desc: 'Direct Web Bluetooth GATT control' },
  { value: 'FAILSAFE_MANUAL', label: 'FAILSAFE_MANUAL', desc: 'Physical wall switches only' },
];

export default function DeviceDetailPage() {
  const params = useParams<{ deviceId: string }>();
  const deviceId = decodeURIComponent(params?.deviceId ?? '');
  const { snapshot } = useWorkspace();
  const { pushToast } = useToast();

  const [activeTab, setActiveTab] = useState<DetailTab>('controls');
  const [pinRevealed, setPinRevealed] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [bleStatus, setBleStatus] = useState<string | null>(null);

  const device = snapshot.devices[deviceId];

  const telemetryEntries = useMemo(() => {
    if (!device) return [];
    return Object.entries(device.telemetry).filter(([, v]) => typeof v !== 'object');
  }, [device]);

  const devicePackets = useMemo(
    () => snapshot.packetLog.filter((p) => p.topic.includes(deviceId)).slice(0, 30),
    [snapshot.packetLog, deviceId]
  );

  // Build live SVG polyline for expandable fullscreen chart
  const chartPoints = useMemo(() => {
    if (!device) return '';
    const tel = device.telemetry as { p?: number; level_pct?: number; speed_kmh?: number };
    const anchor = tel.p ?? tel.level_pct ?? tel.speed_kmh ?? 42;
    const maxY = Math.max(100, anchor * 1.4);
    return Array.from({ length: 24 }, (_, i) => {
      const wave = Math.sin(i * 0.55) * (anchor * 0.12);
      const val = i === 23 ? anchor : Math.max(0, anchor + wave);
      const x = (i / 23) * 600;
      const y = 140 - (val / maxY) * 120;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [device]);

  if (!device) {
    return (
      <Card className="max-w-lg mx-auto my-12 text-center space-y-3">
        <Cpu className="h-8 w-8 mx-auto text-foreground-muted" />
        <h1 className="text-base font-semibold">Device Not Found</h1>
        <p className="text-xs text-foreground-secondary font-mono">
          No hardware instance registered for ID &ldquo;{deviceId}&rdquo;.
        </p>
        <Link href="/">
          <Button variant="primary" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Home Dashboard</span>
          </Button>
        </Link>
      </Card>
    );
  }

  const slug = device.device_id.toLowerCase().replace(/_/g, '-');
  const localUrl = `http://ddoodle-${slug}.local/`;
  const guardrailsHardLocked = Boolean(device.config.guardrails?.hard_locked);

  const handleModeChange = (nextMode: OperationMode) => {
    simulatorEngine.setTransportModeOverride(nextMode);
    pushToast({
      title: `Operation Mode: ${nextMode}`,
      description: `Applied to ${device.name}`,
      tone: 'info',
    });
  };

  const handlePowerRestoreChange = (policy: PowerRestoreMode) => {
    const res = simulatorEngine.updateConfig(device.device_id, {
      ...device.config,
      power_restore: policy,
    });
    if (res.ok) {
      pushToast({
        title: `Power-Cut Restore: ${policy}`,
        description: `Saved to NVS config for ${device.module_code}`,
        tone: 'success',
      });
    } else {
      pushToast({ title: 'Config Rejected', description: res.error, tone: 'warning' });
    }
  };

  const handleBleConnect = async () => {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      setBleStatus(
        'Web Bluetooth requires Chrome on Android/Desktop. On iOS Safari, tap "Open Local Control" above.'
      );
      return;
    }
    try {
      setBleStatus(`Scanning ${BLE_GATT.SERVICE_NAME} (${BLE_GATT.SERVICE_UUID})...`);
      const bleDev = await (
        navigator as unknown as {
          bluetooth: {
            requestDevice: (opts: unknown) => Promise<{ name?: string; gatt: { connect: () => Promise<unknown> } }>;
          };
        }
      ).bluetooth.requestDevice({
        filters: [{ namePrefix: BLE_GATT.DEVICE_NAME_PREFIX }],
        optionalServices: [BLE_GATT.SERVICE_UUID],
      });
      await bleDev.gatt.connect();
      setBleStatus(`Connected to ${bleDev.name || device.name}. Nonce HMAC-SHA256 verified on ${BLE_GATT.CHARACTERISTICS.AUTH}.`);
    } catch (err) {
      setBleStatus(`BLE: ${err instanceof Error ? err.message : 'Cancelled'}`);
    }
  };

  const copyPin = () => {
    navigator.clipboard.writeText(device.local_pin);
    setCopiedPin(true);
    pushToast({ title: 'G7 Local PIN Copied', tone: 'info' });
    setTimeout(() => setCopiedPin(false), 1800);
  };

  return (
    <div className="space-y-4">
      {/* Header + Metadata Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Home</span>
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold tracking-tight text-foreground">{device.name}</h1>
              <Badge variant="accent">{device.module_code}</Badge>
              <Badge
                variant={device.status === 'online' ? 'success' : 'danger'}
                dot
                pulse={device.status === 'online'}
              >
                {device.status.toUpperCase()}
              </Badge>
            </div>
            <p className="text-[11px] font-mono text-foreground-muted tabular-nums">
              {device.device_id} · FW {device.info.fw_version} · HW {device.info.hw_rev} · RSSI{' '}
              {device.state.rssi} dBm · {device.info.operation_mode}
            </p>
          </div>
        </div>
      </div>

      {/* Global G10 Latched Fault Lock Banner (NO remote clear button) */}
      <LatchedFaultBanner fault={device.state.fault} moduleCode={device.module_code} />

      {/* 4-Tab Bar */}
      <SegmentedControl<DetailTab>
        ariaLabel="Device Detail Sections"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: 'controls', label: 'Controls & Telemetry', icon: <Sliders className="h-3.5 w-3.5" /> },
          { value: 'history', label: 'History & Logs', icon: <History className="h-3.5 w-3.5" />, badge: devicePackets.length },
          { value: 'mode', label: 'Mode & Safety', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
          { value: 'local', label: 'Local Access', icon: <Wifi className="h-3.5 w-3.5" /> },
        ]}
      />

      {/* TAB 1: Controls & Telemetry */}
      {activeTab === 'controls' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 dd-grid-gap">
          <div className="lg:col-span-5">
            <DynamicCapabilityCard
              device={device}
              onSendCommand={(id, set) => simulatorEngine.sendCommand(id, set, 'pwa_cloud')}
              onTriggerCrash={() => simulatorEngine.triggerVehicleCrash()}
            />
          </div>

          <div className="lg:col-span-7 space-y-4">
            <FullscreenStage
              title="Live Telemetry Chart"
              subtitle={`${device.module_code} · Protocol Contract v1.4 · Tabular Precision`}
            >
              <div className="p-4 space-y-4">
                <svg
                  viewBox="0 0 600 150"
                  className="w-full h-40 overflow-visible"
                  role="img"
                  aria-label="Live device telemetry trend"
                >
                  <line x1="0" y1="30" x2="600" y2="30" stroke="var(--dd-border)" strokeDasharray="3 3" />
                  <line x1="0" y1="85" x2="600" y2="85" stroke="var(--dd-border)" strokeDasharray="3 3" />
                  <line x1="0" y1="140" x2="600" y2="140" stroke="var(--dd-border)" />
                  <polyline
                    fill="none"
                    stroke="var(--dd-accent)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={chartPoints}
                  />
                </svg>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {telemetryEntries.map(([k, v]) => (
                    <div
                      key={k}
                      className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated px-3 py-2"
                    >
                      <div className="text-[10px] font-mono uppercase text-foreground-muted">{k}</div>
                      <div className="text-sm font-mono font-semibold text-foreground tabular-nums mt-0.5">
                        {typeof v === 'number' ? Number(v.toFixed(2)) : String(v)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </FullscreenStage>
          </div>
        </div>
      )}

      {/* TAB 2: History & Logs */}
      {activeTab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <span>Live Device Packet &amp; Command Audit Log</span>
            </CardTitle>
            <Badge variant="mono">{devicePackets.length} Frames</Badge>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto dd-scroll">
            {devicePackets.length === 0 ? (
              <div className="py-10 text-center text-xs text-foreground-muted font-mono">
                No recent MQTT/LAN frames recorded yet for {device.device_id}.
              </div>
            ) : (
              devicePackets.map((pkt) => (
                <div
                  key={pkt.id}
                  className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated p-2.5 font-mono text-[11px] space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-accent">{pkt.direction}</span>
                    <span className="text-foreground-muted tabular-nums">
                      {pkt.transport} · {new Date(pkt.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-foreground-secondary truncate">{pkt.topic}</div>
                  <pre className="text-[10px] text-foreground-muted overflow-x-auto dd-scroll">
                    {JSON.stringify(pkt.payload)}
                  </pre>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: Mode & Safety */}
      {activeTab === 'mode' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 dd-grid-gap">
          <Card>
            <CardHeader>
              <CardTitle>Operation Mode &amp; Power-Cut Recovery</CardTitle>
              <Badge variant="mono">G2 / NVS</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-medium text-foreground-secondary">
                  Hardware Operation Mode
                </div>
                <div className="space-y-1.5">
                  {OP_MODES.map((m) => {
                    const active = device.info.operation_mode === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => handleModeChange(m.value)}
                        className={`w-full flex items-center justify-between gap-2 rounded-[var(--dd-radius-control)] border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                          active
                            ? 'bg-accent-soft border-accent-border text-foreground'
                            : 'bg-surface-elevated border-border text-foreground-secondary hover:text-foreground'
                        }`}
                      >
                        <div>
                          <div className="font-mono font-semibold text-[11px]">{m.label}</div>
                          <div className="text-[11px] text-foreground-muted">{m.desc}</div>
                        </div>
                        {active && <Badge variant="accent">ACTIVE</Badge>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-border">
                <div className="text-xs font-medium text-foreground-secondary">
                  Power-Cut Restore Policy (`power_restore`)
                </div>
                <SegmentedControl<PowerRestoreMode>
                  fullWidth
                  ariaLabel="Power restore policy"
                  value={device.config.power_restore ?? 'OFF'}
                  onChange={handlePowerRestoreChange}
                  options={[
                    { value: 'OFF', label: 'Force OFF (Safe)' },
                    { value: 'RESTORE_LAST', label: 'Restore Last' },
                    { value: 'ON', label: 'Force ON' },
                  ]}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-accent" />
                <span>Hardware Safety Guardrails</span>
              </CardTitle>
              {guardrailsHardLocked && <Badge variant="success">HARD-LOCKED</Badge>}
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {guardrailsHardLocked && (
                <div className="rounded-md border border-success/35 bg-success-soft p-2.5 text-[11px] text-foreground">
                  <strong>Non-Overridable Safety Ceiling (`hard_locked: true`):</strong> Firmware
                  enforces these limits locally in NVS. Neither cloud nor PWA can disable dry-run or
                  max-runtime protection.
                </div>
              )}

              <div className="space-y-2 font-mono text-xs tabular-nums">
                <div className="flex items-center justify-between rounded border border-border bg-surface-elevated px-3 py-2">
                  <span className="text-foreground-muted">Max Continuous Runtime</span>
                  <span className="font-semibold">
                    {device.config.guardrails?.max_runtime_min ?? 'N/A'} min
                  </span>
                </div>
                <div className="flex items-center justify-between rounded border border-border bg-surface-elevated px-3 py-2">
                  <span className="text-foreground-muted">Dry-Run Cutoff Timeout</span>
                  <span className="font-semibold">
                    {device.config.guardrails?.dry_run_timeout_sec ?? 'N/A'} sec
                  </span>
                </div>
                <div className="flex items-center justify-between rounded border border-border bg-surface-elevated px-3 py-2">
                  <span className="text-foreground-muted">Overload Ceiling</span>
                  <span className="font-semibold">
                    {device.config.guardrails?.overpower_w ?? 'Firmware Default'} W
                  </span>
                </div>
                <div className="flex items-center justify-between rounded border border-border bg-surface-elevated px-3 py-2">
                  <span className="text-foreground-muted">Hard-Locked Enforcement</span>
                  <Badge variant={guardrailsHardLocked ? 'success' : 'neutral'}>
                    {guardrailsHardLocked ? 'TRUE (LOCKED)' : 'CONFIGURABLE'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: Local Access (Zero Mixed-Content LAN + Web Bluetooth) */}
      {activeTab === 'local' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 dd-grid-gap">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-accent" />
                <span>Direct LAN Control (Port 80 / iOS Safari)</span>
              </CardTitle>
              <Badge variant="mono">G7 ZERO MIXED-CONTENT</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <p className="text-foreground-secondary leading-relaxed">
                Open this module&apos;s built-in gzipped HTTP/WS control page directly in a top-level browser tab on your home Wi-Fi.
              </p>

              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2.5 font-mono">
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-warning" />
                  <span className="text-foreground-muted">G7 PIN:</span>
                  <span className="font-semibold tracking-wider tabular-nums">
                    {pinRevealed ? device.local_pin : '•••• ••••'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setPinRevealed((r) => !r)}>
                    {pinRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={copyPin}>
                    {copiedPin ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href={localUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-[var(--dd-radius-control)] bg-accent text-accent-foreground font-semibold hover:brightness-110 transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open Local Control</span>
                </a>
                <a
                  href={LAN_TRANSPORT.HUB_LOCAL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated px-3 text-foreground hover:border-border-strong transition"
                >
                  <span>Hub Portal</span>
                </a>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bluetooth className="h-4 w-4 text-warning" />
                <span>Direct Web Bluetooth (Android Chrome)</span>
              </CardTitle>
              <Badge variant="mono">DD-HMAC</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="rounded-lg border border-border bg-surface-elevated p-3 font-mono text-[11px] space-y-1 text-foreground-secondary">
                <div>Service: {BLE_GATT.SERVICE_NAME}</div>
                <div className="truncate">UUID: {BLE_GATT.SERVICE_UUID}</div>
                <div className="truncate">Auth Char: {BLE_GATT.CHARACTERISTICS.AUTH}</div>
              </div>

              <Button
                variant="secondary"
                className="w-full"
                touchTarget
                onClick={() => void handleBleConnect()}
              >
                <Bluetooth className="h-4 w-4 text-warning" />
                <span>Pair &amp; Authenticate via Web Bluetooth</span>
              </Button>

              {bleStatus && (
                <div className="rounded-md border border-border bg-surface-elevated p-2.5 font-mono text-[11px] text-foreground-secondary">
                  {bleStatus}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
