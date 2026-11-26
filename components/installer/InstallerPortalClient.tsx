'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Box,
  CheckCircle2,
  Clock,
  Cpu,
  Lock,
  QrCode,
  Radio,
  ShieldCheck,
  Sparkles,
  Wifi,
  Wrench,
} from 'lucide-react';
import { SessionPayload } from '@/lib/auth/session';
import { HARDWARE_REGISTRY, getHardwareModule } from '@/lib/catalog/hardwareRegistry';
import { SOFTAP_TRANSPORT } from '@/lib/protocol/transports';
import { resolveEntitlements } from '@/lib/entitlements/resolver';
import { simulatorEngine } from '@/lib/simulator/engine';
import { ModuleCode } from '@/lib/protocol/contract';
import {
  canJobAccess3DStudio,
  InstallerJobRecord,
  useScopedInstallerJobs,
} from '@/lib/installer/jobsStore';
import { useUnifiedFleet } from '@/lib/data/unifiedStore';
import {
  Badge,
  Banner,
  Button,
  Dropdown,
  OtpPinInput,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { cn } from '@/lib/utils';

const Home3DTwinView = dynamic(
  () => import('@/components/twin/Home3DTwinView').then((m) => m.Home3DTwinView),
  {
    ssr: false,
    loading: () => (
      <div className="h-[520px] rounded-2xl border border-border bg-surface flex items-center justify-center text-xs font-mono text-foreground-muted">
        Loading Scoped 3D Home Twin Studio...
      </div>
    ),
  }
);

const ROOM_OPTIONS = [
  { value: 'room_living', label: 'Living & Dining' },
  { value: 'room_bedroom', label: 'Master Bedroom' },
  { value: 'room_bath', label: 'Master Bath' },
  { value: 'room_kitchen', label: 'Kitchen & Utility' },
  { value: 'room_entry', label: 'Main Entry & Gate' },
  { value: 'room_elder', label: 'Elder Wellness Room' },
  { value: 'room_terrace', label: 'Terrace & Tank' },
  { value: 'room_garage', label: 'Garage & Vehicle' },
];

const MODULE_OPTIONS = HARDWARE_REGISTRY.map((m) => ({
  value: m.module_code,
  label: `${m.module_code} · ${m.shortName}`,
}));

export function InstallerPortalClient({ session }: { session: SessionPayload }) {
  const { pushToast } = useToast();
  const { activeJobs, inactiveJobs, linkDevice, completeJob } = useScopedInstallerJobs(session);
  const { snapshot: simSnapshot } = useUnifiedFleet();

  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const activeJob: InstallerJobRecord | null =
    activeJobs.find((j) => j.job_id === selectedJobId) ?? activeJobs[0] ?? null;

  const [transportMethod, setTransportMethod] = useState<'softap' | 'ble'>('softap');
  const [deviceId, setDeviceId] = useState('dd_pwr01_field01');
  const [moduleCode, setModuleCode] = useState<ModuleCode>('PWR-01');
  const [deviceName, setDeviceName] = useState('Living Switchboard Node');
  const [localPin, setLocalPin] = useState('48291034');
  const [roomId, setRoomId] = useState('room_living');
  const [g1Verified, setG1Verified] = useState(false);
  const [g10SafetyChecked, setG10SafetyChecked] = useState(false);
  const [show3DBuilder, setShow3DBuilder] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setNowMs(Date.now()), 0);
    const iv = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(iv);
    };
  }, []);

  const spec = getHardwareModule(moduleCode);
  const allow3D = activeJob ? canJobAccess3DStudio(activeJob) : false;

  const installerEntitlements = resolveEntitlements({
    tier: 'all_in_family',
    status: 'active',
    trial_ends_at: null,
    expires_at: null,
    dfy_3d_purchased: allow3D,
  });

  const handleLinkDevice = async () => {
    if (!activeJob) return;
    if (!deviceId.trim() || localPin.length !== 8) {
      pushToast({
        title: 'Valid Device ID & 8-digit G7 PIN required',
        tone: 'warning',
      });
      return;
    }
    if (!g1Verified || !g10SafetyChecked) {
      pushToast({
        title: 'Complete G1 .../info & G10 Safety checks before linking',
        tone: 'warning',
      });
      return;
    }

    const res = await linkDevice({
      job: activeJob,
      deviceId: deviceId.trim(),
      moduleCode,
      roomId,
      localPin,
      deviceName: deviceName.trim() || spec?.shortName || moduleCode,
    });

    if (res.ok) {
      setG1Verified(false);
      setG10SafetyChecked(false);
      setDeviceId(`dd_${moduleCode.toLowerCase().replace('-', '')}_${Math.random().toString(16).slice(2, 6)}`);
      pushToast({
        title: 'Module Linked to Customer Home',
        description: `${deviceId} bound to ${activeJob.home_name} (${roomId})`,
        tone: 'success',
      });
    }
  };

  return (
    <div className="space-y-4">
      <Banner
        tone="info"
        title="Scoped Field Installer Mode"
        description="You can only view and link hardware on active homes authorized by Admin. Store pricing, P&L ledgers, and unassigned homes are blocked at Firestore Rules & Server Middleware."
      />

      {activeJobs.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center space-y-2">
          <Lock className="h-8 w-8 text-warning mx-auto" />
          <h1 className="text-base font-semibold text-foreground">
            No Active Admin-Authorized Jobs
          </h1>
          <p className="text-xs text-foreground-secondary max-w-md mx-auto">
            Ask Admin to dispatch an active `INITIAL_SETUP_LINKING` or `FOLLOWUP_3D_SERVICE` job
            for your UID (`{session.uid}`). Once revoked or expired, home &amp; 3D access closes
            immediately.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column: Active Assigned Jobs Queue */}
          <div className="lg:col-span-4 space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-foreground-muted">
              Active Assigned Jobs ({activeJobs.length})
            </div>

            <div className="space-y-2">
              {activeJobs.map((job) => {
                const selected = activeJob?.job_id === job.job_id;
                const hoursLeft = Math.max(
                  1,
                  nowMs > 0 ? Math.ceil((job.expiresAtMs - nowMs) / (60 * 60 * 1000)) : 24
                );
                const jobHas3D = canJobAccess3DStudio(job);

                return (
                  <button
                    key={job.job_id}
                    type="button"
                    onClick={() => {
                      setSelectedJobId(job.job_id);
                      setShow3DBuilder(false);
                    }}
                    className={cn(
                      'w-full rounded-2xl border p-3.5 text-left transition-colors cursor-pointer space-y-2',
                      selected
                        ? 'border-primary bg-primary-soft/45 ring-1 ring-primary/30'
                        : 'border-border bg-surface hover:border-border-strong'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="accent">{job.type.replace(/_/g, ' ')}</Badge>
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground-muted">
                        <Clock className="h-3 w-3" /> {hoursLeft}h left
                      </span>
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-foreground">{job.home_name}</div>
                      <div className="text-[11px] text-foreground-secondary">{job.address}</div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 text-[10px] font-mono">
                      <span className="text-foreground-muted">
                        {job.linked_device_ids.length} Linked Nodes
                      </span>
                      <Badge variant={jobHas3D ? 'success' : 'neutral'}>
                        {jobHas3D ? '3D TWIN AUTHORIZED' : 'LINKING ONLY (NO 3D)'}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>

            {inactiveJobs.length > 0 && (
              <div className="pt-3 border-t border-border space-y-1.5">
                <div className="text-[10px] font-mono uppercase text-foreground-muted">
                  Completed / Revoked Jobs ({inactiveJobs.length})
                </div>
                {inactiveJobs.map((j) => (
                  <div
                    key={j.job_id}
                    className="rounded-xl border border-border/60 bg-surface-elevated/50 px-3 py-2 flex items-center justify-between text-xs opacity-70"
                  >
                    <span className="truncate font-medium">{j.home_name}</span>
                    <Badge variant="danger">{j.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Module Linking Workbench & Conditional 3D Twin Builder */}
          {activeJob && (
            <div className="lg:col-span-8 space-y-4">
              {/* Active Job Summary Header */}
              <div className="rounded-2xl border border-border-strong bg-surface p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-base font-bold text-foreground">{activeJob.home_name}</h1>
                      <Badge variant="mono">{activeJob.home_id}</Badge>
                      <Badge variant="success" dot>
                        ACTIVE JOB
                      </Badge>
                    </div>
                    <p className="text-xs text-foreground-secondary mt-0.5">
                      {activeJob.customer_name} · {activeJob.customer_phone} · {activeJob.notes}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {allow3D ? (
                      <Button
                        variant={show3DBuilder ? 'accent' : 'primary'}
                        size="sm"
                        onClick={() => setShow3DBuilder((v) => !v)}
                      >
                        <Box className="h-3.5 w-3.5" />
                        <span>{show3DBuilder ? 'Hide 3D Twin Studio' : 'Launch 3D Twin Builder'}</span>
                      </Button>
                    ) : (
                      <Badge variant="warning">
                        <Lock className="h-3 w-3" />
                        <span>3D BUILDER NOT AUTHORIZED ON THIS JOB</span>
                      </Badge>
                    )}

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        await completeJob(activeJob.job_id);
                        setShow3DBuilder(false);
                        pushToast({
                          title: 'Job Completed & Authority Closed',
                          description: `Installer write access to ${activeJob.home_name} is now locked.`,
                          tone: 'info',
                        });
                      }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      <span>Complete Job</span>
                    </Button>
                  </div>
                </div>

                {/* Linked Devices List */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/60">
                  {activeJob.linked_device_ids.length === 0 ? (
                    <span className="text-[11px] font-mono text-foreground-muted">
                      No devices linked yet on this work order.
                    </span>
                  ) : (
                    activeJob.linked_device_ids.map((id) => (
                      <Badge key={id} variant="mono">
                        ✓ {id}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              {/* Conditional 3D Twin Studio (Strict Job Authorization Check) */}
              {show3DBuilder && allow3D && (
                <div className="rounded-2xl border border-primary-border bg-surface p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                      <Sparkles className="h-4 w-4" />
                      Authorized On-Site 3D Twin Builder ({activeJob.home_id}/layout_3d)
                    </span>
                    <Badge variant="success">WRITE ENABLED</Badge>
                  </div>
                  <ErrorBoundary>
                    <Home3DTwinView
                      homeId={activeJob.home_id}
                      canCustomize
                      isAdminInstaller
                      defaultCustomizeOpen
                      devices={simSnapshot.devices}
                      entitlements={installerEntitlements}
                      onLayoutSaved={() => {
                        pushToast({
                          title: `Saved 3D Layout to ${activeJob.home_id}`,
                          tone: 'success',
                        });
                      }}
                      onSendCommand={(id, set) =>
                        simulatorEngine.sendCommand(id, set, 'pwa_cloud')
                      }
                    />
                  </ErrorBoundary>
                </div>
              )}

              {/* Step-by-Step SoftAP / BLE G1 Linking Form */}
              <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-3">
                  <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                    <QrCode className="h-4 w-4 text-primary" />
                    <span>Hardware Module Commissioning &amp; Room Linking</span>
                  </div>
                  <Badge variant="mono">v1.4 SOFTAP / BLE</Badge>
                </div>

                <SegmentedControl<'softap' | 'ble'>
                  fullWidth
                  size="sm"
                  ariaLabel="Installer commissioning transport"
                  value={transportMethod}
                  onChange={setTransportMethod}
                  options={[
                    {
                      value: 'softap',
                      label: `SoftAP ${SOFTAP_TRANSPORT.SSID_PREFIX}XXXX (${SOFTAP_TRANSPORT.GATEWAY_IP})`,
                      icon: <Wifi className="h-3.5 w-3.5" />,
                    },
                    {
                      value: 'ble',
                      label: 'Direct BLE GATT (DD_OODLE_CTRL)',
                      icon: <Radio className="h-3.5 w-3.5" />,
                    },
                  ]}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="font-medium text-foreground-secondary">
                      Scanned / QR `device_id`
                    </span>
                    <input
                      type="text"
                      value={deviceId}
                      onChange={(e) => setDeviceId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                      className="w-full h-10 rounded-xl border border-border bg-surface-elevated px-3 font-mono text-foreground"
                    />
                  </label>

                  <div className="space-y-1">
                    <span className="font-medium text-foreground-secondary block">
                      Hardware Module Code
                    </span>
                    <Dropdown
                      ariaLabel="Select hardware module code"
                      value={moduleCode}
                      onChange={(v) => setModuleCode(v as ModuleCode)}
                      options={MODULE_OPTIONS}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="font-medium text-foreground-secondary">
                      Fixture Label (e.g. Living Switchboard)
                    </span>
                    <input
                      type="text"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      className="w-full h-10 rounded-xl border border-border bg-surface-elevated px-3 text-foreground"
                    />
                  </label>

                  <div className="space-y-1">
                    <span className="font-medium text-foreground-secondary block">
                      Assign Customer Room
                    </span>
                    <Dropdown
                      ariaLabel="Assign customer room"
                      value={roomId}
                      onChange={setRoomId}
                      options={ROOM_OPTIONS}
                    />
                  </div>
                </div>

                <OtpPinInput
                  length={8}
                  label="G7 8-Digit Enclosure Local PIN"
                  value={localPin}
                  onChange={setLocalPin}
                />

                {/* Verification Checklist: G1 .../info & G10 Safety Cutoffs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setG1Verified(true)}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-colors cursor-pointer space-y-1',
                      g1Verified
                        ? 'border-success/60 bg-success-soft text-foreground'
                        : 'border-border bg-surface-elevated hover:border-primary-border'
                    )}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 text-primary" />
                        <span>1. Verify G1 `.../info` Handshake</span>
                      </span>
                      {g1Verified && <CheckCircle2 className="h-4 w-4 text-success" />}
                    </div>
                    <div className="text-[10px] font-mono text-foreground-muted">
                      {spec?.capabilities.length ?? 0} capabilities discovered ({spec?.core_platform})
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setG10SafetyChecked(true)}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-colors cursor-pointer space-y-1',
                      g10SafetyChecked
                        ? 'border-success/60 bg-success-soft text-foreground'
                        : 'border-border bg-surface-elevated hover:border-primary-border'
                    )}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-success" />
                        <span>2. Verify Live State &amp; G10 Guardrails</span>
                      </span>
                      {g10SafetyChecked && <CheckCircle2 className="h-4 w-4 text-success" />}
                    </div>
                    <div className="text-[10px] font-mono text-foreground-muted">
                      hard_locked: {String(spec?.guardrails.hard_locked ?? false)} · Wall override test
                    </div>
                  </button>
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  touchTarget
                  onClick={() => void handleLinkDevice()}
                >
                  <Wrench className="h-4 w-4" />
                  <span>Mark Module Commissioned &amp; Link to {activeJob.home_name}</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
