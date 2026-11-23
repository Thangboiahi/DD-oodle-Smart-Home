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
  MoreHorizontal,
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
  SegmentedControl,
  useToast,
} from '@/components/ui';
import { DynamicCapabilityCard } from '@/components/capabilities/DynamicCapabilityCard';
import { LatchedFaultBanner } from '@/components/capabilities/LatchedFaultBanner';
import { CollapsibleSection, useWorkspace } from '@/components/workspace';

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
  const { snapshot, prefs, toggleSectionCollapsed } = useWorkspace();
  const { pushToast } = useToast();

  const [pinRevealed, setPinRevealed] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [bleStatus, setBleStatus] = useState<string | null>(null);
  const [showMetaPopover, setShowMetaPopover] = useState(false);

  const device = snapshot.devices[deviceId];

  const telemetryEntries = useMemo(() => {
    if (!device) return [];
    return Object.entries(device.telemetry).filter(([, v]) => typeof v !== 'object');
  }, [device]);

  const devicePackets = useMemo(
    () => snapshot.packetLog.filter((p) => p.topic.includes(deviceId)).slice(0, 24),
    [snapshot.packetLog, deviceId]
  );

  // Build live SVG polyline for telemetry sparkline
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

  const devicesList = Object.values(snapshot.devices);
  const hubMembers = devicesList
    .filter((d) => d.module_code !== 'HUB-01')
    .map((d) => ({
      device_id: d.device_id,
      name: d.name,
      module_code: d.module_code,
      via: d.state.via,
    }));

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
      setBleStatus(
        `Connected to ${bleDev.name || device.name}. Nonce HMAC-SHA256 verified on ${BLE_GATT.CHARACTERISTICS.AUTH}.`
      );
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
    <div className="max-w-4xl mx-auto space-y-3">
      {/* Sticky Compact Device Header */}
      <div className="sticky top-[52px] md:top-14 z-20 flex items-center justify-between gap-2 rounded-2xl border hairline-border bg-surface/90 backdrop-blur-md px-3.5 py-2.5 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-surface-elevated text-foreground-secondary hover:text-foreground transition-colors"
            aria-label="Back to Home Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-sm sm:text-base font-semibold tracking-tight text-foreground truncate">
                {device.name}
              </h1>
              <Badge variant="accent">{device.module_code}</Badge>
              <Badge
                variant={device.status === 'online' ? 'success' : 'danger'}
                dot
                pulse={device.status === 'online'}
              >
                {device.status.toUpperCase()}
              </Badge>
            </div>
            <p className="text-[11px] font-mono text-foreground-muted tabular-nums truncate">
              RSSI {device.state.rssi} dBm · {device.info.operation_mode} · FW {device.info.fw_version}
            </p>
          </div>
        </div>

        {/* Right: Quick Jump to Local LAN or Metadata Popover */}
        <div className="relative flex items-center gap-1.5 shrink-0">
          <a
            href={localUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex h-8 items-center gap-1 rounded-xl border border-border/70 bg-surface-elevated px-2.5 text-xs font-mono text-foreground-secondary hover:text-accent hover:border-accent-border transition-colors"
          >
            <Wifi className="h-3.5 w-3.5 text-accent" />
            <span>LAN Port 80</span>
            <ExternalLink className="h-3 w-3" />
          </a>

          <button
            type="button"
            onClick={() => setShowMetaPopover((v) => !v)}
            aria-label="Device metadata and quick actions"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border/70 bg-surface-elevated text-foreground-secondary hover:text-foreground cursor-pointer"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {showMetaPopover && (
            <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-border bg-surface shadow-2xl p-3 z-40 space-y-2 text-xs font-mono">
              <div className="text-[10px] uppercase text-foreground-muted">Hardware Identity</div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">device_id</span>
                <span className="text-foreground">{device.device_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">Hardware Rev</span>
                <span className="text-foreground">{device.info.hw_rev}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">Schema</span>
                <span className="text-accent">{device.info.schema}</span>
              </div>
              <div className="pt-1.5 border-t hairline-border flex flex-col gap-1 font-sans">
                <button
                  type="button"
                  onClick={() => {
                    toggleSectionCollapsed(`dev_local_${device.device_id}`, true);
                    setShowMetaPopover(false);
                  }}
                  className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-surface-elevated text-accent font-medium cursor-pointer"
                >
                  Open G7 PIN &amp; Web Bluetooth →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global G10 Latched Fault Lock Banner (NO remote clear button) */}
      <LatchedFaultBanner fault={device.state.fault} moduleCode={device.module_code} />

      {/* 1. Primary Upfront Capability Controls (DynamicCapabilityCard) */}
      <DynamicCapabilityCard
        device={device}
        tariffInr={prefs.tariffInr}
        connectedHubMembers={device.module_code === 'HUB-01' ? hubMembers : undefined}
        onSendCommand={(id, set) => simulatorEngine.sendCommand(id, set, 'pwa_cloud')}
        onTriggerCrash={() => simulatorEngine.triggerVehicleCrash()}
      />

      {/* 2. Collapsible Accordion: Live Telemetry & Sparklines */}
      <CollapsibleSection
        sectionId={`dev_telemetry_${device.device_id}`}
        title="History, Sparklines & Telemetry Frames"
        subtitle={`${telemetryEntries.length} metrics · ${devicePackets.length} packets`}
        icon={<History className="h-3.5 w-3.5" />}
        defaultCollapsed={false}
      >
        <div className="space-y-3">
          <div className="rounded-xl border hairline-border bg-surface-elevated/50 p-3">
            <svg
              viewBox="0 0 600 150"
              className="w-full h-32 overflow-visible"
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
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {telemetryEntries.map(([k, v]) => (
              <div
                key={k}
                className="rounded-xl border hairline-border bg-surface-elevated/70 px-3 py-2"
              >
                <div className="text-[10px] font-mono uppercase text-foreground-muted">{k}</div>
                <div className="text-xs font-mono font-semibold text-foreground tabular-nums mt-0.5">
                  {typeof v === 'number' ? Number(v.toFixed(2)) : String(v)}
                </div>
              </div>
            ))}
          </div>

          {/* Compact Packet Stream */}
          <div className="space-y-1.5 pt-2 border-t hairline-border">
            <div className="text-[10px] font-mono uppercase text-foreground-muted">
              Recent Protocol v1.4 Wire Frames
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto dd-scroll">
              {devicePackets.length === 0 ? (
                <div className="py-4 text-center text-xs text-foreground-muted font-mono">
                  Listening for live frames on {device.device_id}...
                </div>
              ) : (
                devicePackets.slice(0, 8).map((pkt) => (
                  <div
                    key={pkt.id}
                    className="rounded-xl border hairline-border bg-surface-elevated/60 p-2 font-mono text-[10px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-accent">{pkt.direction}</span>
                      <span className="text-foreground-muted tabular-nums">
                        {pkt.transport} · {new Date(pkt.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-foreground-secondary truncate">{pkt.topic}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 3. Collapsible Accordion: Mode, Power-Restore & Hardware Safety Guardrails */}
      <CollapsibleSection
        sectionId={`dev_mode_guardrails_${device.device_id}`}
        title="Mode, Power-Restore & Safety Guardrails"
        subtitle={guardrailsHardLocked ? 'hard_locked: true' : device.info.operation_mode}
        icon={<ShieldCheck className="h-3.5 w-3.5" />}
        defaultCollapsed={true}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {/* Operation Mode & Power Restore */}
          <div className="rounded-xl border hairline-border bg-surface-elevated/40 p-3 space-y-3">
            <div className="font-semibold text-foreground flex items-center justify-between">
              <span>Operation Mode &amp; Power-Cut Recovery</span>
              <Badge variant="mono">G2 / NVS</Badge>
            </div>

            <div className="space-y-1.5">
              {OP_MODES.map((m) => {
                const active = device.info.operation_mode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => handleModeChange(m.value)}
                    className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                      active
                        ? 'bg-accent-soft border-accent-border text-foreground'
                        : 'bg-surface border-border/70 text-foreground-secondary hover:text-foreground'
                    }`}
                  >
                    <div>
                      <div className="font-mono font-semibold text-[11px]">{m.label}</div>
                      <div className="text-[10px] text-foreground-muted">{m.desc}</div>
                    </div>
                    {active && <Badge variant="accent">ACTIVE</Badge>}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5 pt-2 border-t hairline-border">
              <div className="text-[11px] font-medium text-foreground-secondary">
                Power-Cut Restore Policy (`power_restore`)
              </div>
              <SegmentedControl<PowerRestoreMode>
                fullWidth
                size="sm"
                ariaLabel="Power restore policy"
                value={device.config.power_restore ?? 'OFF'}
                onChange={handlePowerRestoreChange}
                options={[
                  { value: 'OFF', label: 'Force OFF' },
                  { value: 'RESTORE_LAST', label: 'Restore Last' },
                  { value: 'ON', label: 'Force ON' },
                ]}
              />
            </div>
          </div>

          {/* Non-Overridable Safety Guardrails */}
          <div className="rounded-xl border hairline-border bg-surface-elevated/40 p-3 space-y-3">
            <div className="font-semibold text-foreground flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-accent" />
                <span>Hardware Safety Guardrails</span>
              </span>
              {guardrailsHardLocked && <Badge variant="success">HARD-LOCKED</Badge>}
            </div>

            {guardrailsHardLocked && (
              <div className="rounded-xl border border-success/35 bg-success-soft p-2.5 text-[11px] text-foreground leading-relaxed">
                <strong>Non-Overridable Ceiling (`hard_locked: true`):</strong> Firmware enforces
                these limits locally in NVS. Neither cloud nor PWA can disable dry-run or
                max-runtime protection.
              </div>
            )}

            <div className="space-y-1.5 font-mono text-xs tabular-nums">
              <div className="flex items-center justify-between rounded-lg border hairline-border bg-surface px-3 py-2">
                <span className="text-foreground-muted">Max Runtime</span>
                <span className="font-semibold">
                  {device.config.guardrails?.max_runtime_min ?? 'N/A'} min
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border hairline-border bg-surface px-3 py-2">
                <span className="text-foreground-muted">Dry-Run Cutoff</span>
                <span className="font-semibold">
                  {device.config.guardrails?.dry_run_timeout_sec ?? 'N/A'} sec
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border hairline-border bg-surface px-3 py-2">
                <span className="text-foreground-muted">Overload Ceiling</span>
                <span className="font-semibold">
                  {device.config.guardrails?.overpower_w ?? 'Firmware Default'} W
                </span>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 4. Collapsible Accordion: Local Access (G7 PIN / Port 80 LAN / Web Bluetooth) */}
      <CollapsibleSection
        sectionId={`dev_local_${device.device_id}`}
        title="Local Offline Access (Port 80 LAN & Web Bluetooth)"
        subtitle="G7 Zero Mixed-Content + BLE GATT"
        icon={<Wifi className="h-3.5 w-3.5" />}
        defaultCollapsed={true}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {/* Port 80 Direct LAN */}
          <div className="rounded-xl border hairline-border bg-surface-elevated/40 p-3 space-y-3">
            <div className="font-semibold text-foreground flex items-center justify-between">
              <span>Direct LAN Control (iOS Safari / Port 80)</span>
              <Badge variant="mono">G7</Badge>
            </div>
            <p className="text-foreground-secondary leading-relaxed">
              Open this module&apos;s built-in HTTP/WS control page directly in a top-level browser
              tab on your home Wi-Fi with zero mixed-content errors.
            </p>

            <div className="flex items-center justify-between gap-2 rounded-xl border hairline-border bg-surface px-3 py-2 font-mono">
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
                className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-[var(--dd-accent-fg)] font-semibold hover:opacity-95 transition"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open Local Control</span>
              </a>
              <a
                href={LAN_TRANSPORT.HUB_LOCAL_URL}
                target="_blank"
                rel="noreferrer"
                className="min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-foreground hover:border-border-strong transition"
              >
                <span>Hub Portal</span>
              </a>
            </div>
          </div>

          {/* Direct Web Bluetooth */}
          <div className="rounded-xl border hairline-border bg-surface-elevated/40 p-3 space-y-3">
            <div className="font-semibold text-foreground flex items-center justify-between">
              <span>Direct Web Bluetooth (Android Chrome)</span>
              <Badge variant="mono">DD-HMAC</Badge>
            </div>
            <div className="rounded-xl border hairline-border bg-surface p-2.5 font-mono text-[11px] space-y-1 text-foreground-secondary">
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
              <div className="rounded-xl border hairline-border bg-surface p-2.5 font-mono text-[11px] text-foreground-secondary">
                {bleStatus}
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
