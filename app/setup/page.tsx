'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Bluetooth,
  Box,
  Check,
  CheckCircle2,
  Cpu,
  Home,
  QrCode,
  Radio,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { OperationMode, Phase1ModuleCode } from '@/lib/protocol/contract';
import { BLE_GATT, SOFTAP_TRANSPORT, SoftApProvisionPayload } from '@/lib/protocol/transports';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dropdown,
  OtpPinInput,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import { useWorkspace } from '@/components/workspace';

const STEPS = [
  { id: 1, title: 'QR / Module ID', short: 'Identify' },
  { id: 2, title: 'SoftAP / BLE Provision', short: 'Provision' },
  { id: 3, title: 'Capability Handshake', short: 'Handshake' },
  { id: 4, title: 'Room & 3D Pin', short: 'Assign' },
] as const;

const ROOM_OPTIONS = [
  { value: 'room_living', label: 'Living Room' },
  { value: 'room_bedroom', label: 'Master Bedroom' },
  { value: 'room_bath', label: 'Master Bath' },
  { value: 'room_terrace', label: 'Terrace & Tank' },
  { value: 'room_garage', label: 'Garage & Vehicle' },
];

export default function DeviceSetupPage() {
  const { activeHome, snapshot } = useWorkspace();
  const { pushToast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [deviceId, setDeviceId] = useState('dd_pwr01_new01');
  const [moduleCode, setModuleCode] = useState<Phase1ModuleCode>('PWR-01');
  const [localPin, setLocalPin] = useState('48291034');

  const [transportMethod, setTransportMethod] = useState<'softap' | 'ble'>('softap');
  const [ssid, setSsid] = useState('Imphal-Home-2.4G');
  const [wifiPass, setWifiPass] = useState('');
  const [opMode, setOpMode] = useState<OperationMode>('CLOUD_DIRECT');
  const [handshakeVerified, setHandshakeVerified] = useState(false);

  const [assignedRoom, setAssignedRoom] = useState('room_living');
  const [place3DPin, setPlace3DPin] = useState(true);
  const [pinX, setPinX] = useState(2.4);
  const [pinZ, setPinZ] = useState(1.8);
  const [completed, setCompleted] = useState(false);

  // Exact frozen SoftAP POST /api/v1/prov payload
  const provisionPayload = useMemo<SoftApProvisionPayload>(
    () => ({
      ssid,
      pass: wifiPass || '••••••••',
      home_id: activeHome.id,
      claim_token: `clm_${activeHome.id.slice(-3)}_${deviceId.slice(-5)}`,
      local_key: `key_${localPin}`,
      operation_mode: opMode,
    }),
    [ssid, wifiPass, activeHome.id, deviceId, localPin, opMode]
  );

  // Reference capability template from existing simulator module
  const discoveredInfo = useMemo(() => {
    const match = Object.values(snapshot.devices).find((d) => d.module_code === moduleCode);
    return match?.info ?? Object.values(snapshot.devices)[0]?.info;
  }, [snapshot.devices, moduleCode]);

  const runHandshake = () => {
    setHandshakeVerified(true);
    pushToast({
      title: 'Capability Handshake Verified',
      description: `Received ddoodle/${activeHome.id}/${deviceId}/info (schema v1.4)`,
      tone: 'success',
    });
  };

  const finishSetup = () => {
    setCompleted(true);
    pushToast({
      title: 'Module Commissioned',
      description: `${deviceId} (${moduleCode}) assigned to ${assignedRoom}`,
      tone: 'success',
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Device Setup &amp; Commissioning Wizard
        </h1>
        <p className="text-xs text-foreground-secondary">
          4-step zero-cloud-lock-in onboarding over SoftAP ({SOFTAP_TRANSPORT.GATEWAY_IP}) or Direct BLE GATT.
        </p>
      </div>

      {/* Mobile-First Progress Stepper */}
      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((s) => {
          const active = s.id === step;
          const done = s.id < step || completed;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setStep(s.id)}
                className={`w-full rounded-[var(--dd-radius-control)] border px-2 py-2 text-left transition-colors cursor-pointer ${
                  active
                    ? 'border-accent-border bg-accent-soft text-accent'
                    : done
                    ? 'border-success/40 bg-success-soft text-success'
                    : 'border-border bg-surface text-foreground-muted'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-mono">
                  {done ? <Check className="h-3 w-3" /> : <span>0{s.id}</span>}
                  <span className="truncate font-semibold">{s.short}</span>
                </div>
                <div className="hidden sm:block text-[11px] font-medium truncate mt-0.5 text-foreground">
                  {s.title}
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {/* STEP 1: QR Scan / Manual ID */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-accent" />
              <span>Step 1 · Scan Enclosure QR or Enter Module ID</span>
            </CardTitle>
            <Badge variant="mono">G7 PIN REQUIRED</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 text-xs">
                <span className="text-foreground-secondary font-medium">Device ID (MQTT Safe)</span>
                <input
                  type="text"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  className="w-full h-10 rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated px-3 font-mono text-xs text-foreground focus:outline-none focus:border-accent"
                />
              </label>

              <div className="space-y-1 text-xs">
                <span className="text-foreground-secondary font-medium block">Module Code</span>
                <Dropdown
                  ariaLabel="Select module code"
                  value={moduleCode}
                  onChange={(v) => setModuleCode(v as Phase1ModuleCode)}
                  options={[
                    { value: 'PWR-01', label: 'PWR-01 · 4-Ch Switchboard' },
                    { value: 'PWR-02', label: 'PWR-02 · Fan & Dimmer' },
                    { value: 'PWR-03', label: 'PWR-03 · 25A Heavy Appliance' },
                    { value: 'WAT-01', label: 'WAT-01 · Tank & Pump Guard' },
                    { value: 'VEH-01', label: 'VEH-01 · Vehicle Safety' },
                    { value: 'HUB-01', label: 'HUB-01 · Local Offline Hub' },
                  ]}
                />
              </div>
            </div>

            <OtpPinInput
              length={8}
              label="G7 8-Digit Local Device PIN (Printed on QR Sticker)"
              value={localPin}
              onChange={setLocalPin}
            />

            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="primary" touchTarget onClick={() => setStep(2)}>
                <span>Continue to Provisioning</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: SoftAP / BLE Provisioning */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {transportMethod === 'softap' ? (
                <Wifi className="h-4 w-4 text-accent" />
              ) : (
                <Bluetooth className="h-4 w-4 text-warning" />
              )}
              <span>Step 2 · Provision Wi-Fi &amp; Local Key</span>
            </CardTitle>
            <Badge variant="accent">FROZEN TRANSPORT</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <SegmentedControl<'softap' | 'ble'>
              fullWidth
              ariaLabel="Provisioning transport"
              value={transportMethod}
              onChange={setTransportMethod}
              options={[
                { value: 'softap', label: 'SoftAP 192.168.4.1', icon: <Wifi className="h-3.5 w-3.5" /> },
                { value: 'ble', label: 'Direct BLE GATT', icon: <Bluetooth className="h-3.5 w-3.5" /> },
              ]}
            />

            <div className="rounded-lg border border-border bg-surface-elevated p-3 text-[11px] font-mono text-foreground-secondary space-y-1">
              {transportMethod === 'softap' ? (
                <>
                  <div>
                    1. Join Wi-Fi SSID: <strong className="text-foreground">{SOFTAP_TRANSPORT.SSID_PREFIX}{deviceId.slice(-4).toUpperCase()}</strong>
                  </div>
                  <div>
                    2. Dispatch <strong className="text-accent">POST {SOFTAP_TRANSPORT.BASE_URL}{SOFTAP_TRANSPORT.PROVISION_ENDPOINT}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div>Service: <strong className="text-foreground">{BLE_GATT.SERVICE_NAME}</strong></div>
                  <div className="truncate">UUID: <strong className="text-accent">{BLE_GATT.SERVICE_UUID}</strong></div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 text-xs">
                <span className="text-foreground-secondary font-medium">2.4 GHz Home Wi-Fi SSID</span>
                <input
                  type="text"
                  value={ssid}
                  onChange={(e) => setSsid(e.target.value)}
                  className="w-full h-10 rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated px-3 text-xs text-foreground focus:outline-none focus:border-accent"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-foreground-secondary font-medium">Wi-Fi Passphrase</span>
                <input
                  type="password"
                  value={wifiPass}
                  onChange={(e) => setWifiPass(e.target.value)}
                  placeholder="Enter home Wi-Fi password"
                  className="w-full h-10 rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated px-3 text-xs text-foreground focus:outline-none focus:border-accent"
                />
              </label>
            </div>

            <div className="space-y-1 text-xs">
              <span className="text-foreground-secondary font-medium block">Initial Operation Mode (Optional)</span>
              <Dropdown
                ariaLabel="Initial operation mode"
                value={opMode}
                onChange={(v) => setOpMode(v as OperationMode)}
                options={[
                  { value: 'CLOUD_DIRECT', label: 'CLOUD_DIRECT (Recommended)' },
                  { value: 'LOCAL_HUB', label: 'LOCAL_HUB (Offline Hub)' },
                  { value: 'LAN_ONLY', label: 'LAN_ONLY (Zero Cloud)' },
                  { value: 'BLE_ONLY', label: 'BLE_ONLY (Bluetooth Direct)' },
                ]}
              />
            </div>

            <div className="rounded-lg border border-border bg-canvas p-2.5 font-mono text-[10px] text-foreground-muted overflow-x-auto dd-scroll">
              <div className="text-foreground-secondary mb-1">POST /api/v1/prov Payload Preview:</div>
              <pre>{JSON.stringify(provisionPayload, null, 2)}</pre>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </Button>
              <Button
                variant="primary"
                touchTarget
                onClick={() => {
                  pushToast({
                    title: 'Credentials Dispatched',
                    description: `Sent to ${SOFTAP_TRANSPORT.PROVISION_ENDPOINT}`,
                    tone: 'info',
                  });
                  setStep(3);
                }}
              >
                <Radio className="h-3.5 w-3.5" />
                <span>Send &amp; Verify Handshake</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Capability Handshake (.../info verification) */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-accent" />
              <span>Step 3 · Capability Handshake (`.../info`)</span>
            </CardTitle>
            <Badge variant={handshakeVerified ? 'success' : 'warning'}>
              {handshakeVerified ? 'SCHEMA v1.4 VERIFIED' : 'AWAITING INFO'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-elevated p-3 font-mono text-[11px] space-y-1">
              <div className="text-foreground-muted">
                Topic: <span className="text-accent">ddoodle/{activeHome.id}/{deviceId}/info</span>
              </div>
              <div className="text-foreground-secondary">
                Schema: {discoveredInfo?.schema ?? 'v1.4'} · FW: {discoveredInfo?.fw_version ?? '1.4.0'} · Mode: {opMode}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-foreground-secondary">
                Discovered `capabilities[]` ({discoveredInfo?.capabilities.length ?? 0})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {discoveredInfo?.capabilities.map((cap) => (
                  <div
                    key={cap.key}
                    className="flex items-center justify-between rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-foreground">{cap.label}</span>
                    <Badge variant={cap.type === 'sensor' ? 'mono' : 'accent'}>{cap.type}</Badge>
                  </div>
                ))}
              </div>
            </div>

            {!handshakeVerified && (
              <Button variant="accent" className="w-full" touchTarget onClick={runHandshake}>
                <ShieldCheck className="h-4 w-4" />
                <span>Verify `.../info` Capability Handshake</span>
              </Button>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </Button>
              <Button
                variant="primary"
                touchTarget
                disabled={!handshakeVerified}
                onClick={() => setStep(4)}
              >
                <span>Assign Room &amp; 3D Pin</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: Room Assignment & Optional 3D Pin Placement */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-4 w-4 text-accent" />
              <span>Step 4 · Room Assignment &amp; Optional 3D Pin</span>
            </CardTitle>
            <Badge variant="mono">{activeHome.name}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 text-xs">
              <span className="text-foreground-secondary font-medium block">Assign to Room</span>
              <Dropdown
                ariaLabel="Assign room"
                value={assignedRoom}
                onChange={setAssignedRoom}
                options={ROOM_OPTIONS}
              />
            </div>

            <div className="rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Box className="h-4 w-4 text-accent" />
                  <span>Place Pin on 3D Home Twin (Optional)</span>
                </div>
                <Button
                  variant={place3DPin ? 'accent' : 'secondary'}
                  size="sm"
                  onClick={() => setPlace3DPin((p) => !p)}
                >
                  {place3DPin ? 'Enabled' : 'Skip 3D Pin'}
                </Button>
              </div>

              {place3DPin && (
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <label className="space-y-1">
                    <span className="text-foreground-muted text-[10px]">FLOOR X (meters)</span>
                    <input
                      type="number"
                      step="0.2"
                      value={pinX}
                      onChange={(e) => setPinX(Number(e.target.value))}
                      className="w-full h-9 rounded border border-border bg-surface px-2.5 text-foreground tabular-nums"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-foreground-muted text-[10px]">FLOOR Z (meters)</span>
                    <input
                      type="number"
                      step="0.2"
                      value={pinZ}
                      onChange={(e) => setPinZ(Number(e.target.value))}
                      className="w-full h-9 rounded border border-border bg-surface px-2.5 text-foreground tabular-nums"
                    />
                  </label>
                </div>
              )}
            </div>

            {completed ? (
              <div className="rounded-lg border border-success/40 bg-success-soft p-3.5 space-y-3 text-xs">
                <div className="flex items-center gap-2 font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Device Commissioned Successfully!</span>
                </div>
                <p className="text-foreground-secondary">
                  <strong>{deviceId}</strong> ({moduleCode}) is bound to <strong>{assignedRoom}</strong>. Local Port 80 + BLE remain active forever under Core Floor.
                </p>
                <Link href="/">
                  <Button variant="primary" size="sm">
                    <span>Return to Home Dashboard</span>
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back</span>
                </Button>
                <Button variant="primary" touchTarget onClick={finishSetup}>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Complete Commissioning</span>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
