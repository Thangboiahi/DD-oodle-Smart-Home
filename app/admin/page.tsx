'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Activity,
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  CreditCard,
  Eye,
  FileCheck,
  Filter,
  HardDrive,
  Lock,
  Plus,
  QrCode,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Upload,
  Wrench,
} from 'lucide-react';
import {
  HomeLayout3D,
  OtaPayload,
  Phase1ModuleCode,
  SubscriptionTier,
  WaterTelemetryPayload,
} from '@/lib/protocol/contract';
import { OTA_SECURITY } from '@/lib/protocol/transports';
import { DFY_3D_TWIN_ADDON_INR, resolveEntitlements } from '@/lib/entitlements/resolver';
import { ContractComplianceReport, runContractV14Audit } from '@/lib/protocol/validator';
import { simulatorEngine } from '@/lib/simulator/engine';
import { SimulatorWorkbench } from '@/components/simulator/SimulatorWorkbench';

const Home3DTwinView = dynamic(
  () => import('@/components/twin/Home3DTwinView').then((m) => m.Home3DTwinView),
  {
    ssr: false,
    loading: () => (
      <div className="h-[calc(100dvh-136px)] md:h-[calc(100dvh-96px)] min-h-[500px] rounded-2xl border border-border bg-surface flex items-center justify-center text-xs font-mono text-foreground-muted">
        Loading 3D Twin Builder...
      </div>
    ),
  }
);
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dropdown,
  SegmentedControl,
  ThemedCheckbox,
  useToast,
} from '@/components/ui';
import {
  CollapsibleSection,
  DockablePanel,
  useWorkspace,
} from '@/components/workspace';

type AdminTab = 'fleet' | 'onboarding' | 'ota' | 'billing_amc';
type RolloutStage = 'test_device' | 'pilot_group' | 'fleet';

interface BatchClaimItem {
  id: string;
  deviceId: string;
  moduleCode: Phase1ModuleCode;
  roomId: string;
  status: 'queued' | 'claimed';
}

interface AmcTicket {
  ticket_id: string;
  customer: string;
  tier: SubscriptionTier;
  device: string;
  issue: string;
  sla24h: boolean;
  status: 'OPEN' | 'SCHEDULED' | 'RESOLVED';
}

const INITIAL_AMC_TICKETS: AmcTicket[] = [
  {
    ticket_id: 'amc_2026_001',
    customer: 'Imphal Residence (home_imphal_001)',
    tier: 'all_in_family',
    device: 'WAT-01 Tank & Pump Guard',
    issue: 'ESP-NOW terrace RF path check & ultrasonic probe calibration',
    sla24h: true,
    status: 'SCHEDULED',
  },
  {
    ticket_id: 'amc_2026_002',
    customer: 'Porompat Villa (home_imphal_014)',
    tier: 'shield',
    device: 'PWR-03 25A Geyser Node',
    issue: 'Thermal relay inspection after seasonal load spike',
    sla24h: true,
    status: 'OPEN',
  },
  {
    ticket_id: 'amc_2026_003',
    customer: 'Guwahati Studio (home_guwahati_002)',
    tier: 'plus',
    device: 'PWR-01 4-Ch Switchboard',
    issue: 'Routine annual inspection',
    sla24h: false,
    status: 'RESOLVED',
  },
];

const CUSTOMER_PLANS: Array<{
  homeId: string;
  customer: string;
  tier: SubscriptionTier;
  trialStatus: string;
  simRenewal: string;
  upiStatus: 'PAID' | 'TRIAL' | 'DUE D-7';
}> = [
  {
    homeId: 'home_imphal_001',
    customer: 'Imphal Residence',
    tier: 'all_in_family',
    trialStatus: '89d Trial Active',
    simRenewal: '2027-08-15 (4G M2M Active)',
    upiStatus: 'TRIAL',
  },
  {
    homeId: 'home_imphal_014',
    customer: 'Porompat Villa',
    tier: 'shield',
    trialStatus: 'Annual Active',
    simRenewal: 'N/A (No VEH-01)',
    upiStatus: 'PAID',
  },
  {
    homeId: 'home_shillong_008',
    customer: 'Laitumkhrah Heights',
    tier: 'drive',
    trialStatus: 'Yr-2 Renewal',
    simRenewal: '2026-11-29 (D-7 Alert)',
    upiStatus: 'DUE D-7',
  },
  {
    homeId: 'home_guwahati_002',
    customer: 'Guwahati Studio',
    tier: 'core',
    trialStatus: 'Core Free Forever',
    simRenewal: 'N/A',
    upiStatus: 'PAID',
  },
];

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function AdminInstallerPortal() {
  const { snapshot, getDockPanelState, setDockPanelState } = useWorkspace();
  const { pushToast } = useToast();

  const [adminRole, setAdminRole] = useState<'INSTALLER_ADMIN' | 'CUSTOMER'>('INSTALLER_ADMIN');
  const [activeTab, setActiveTab] = useState<AdminTab>('fleet');

  // Fleet Health & Diagnostics state
  const [fleetQuery, setFleetQuery] = useState('');
  const [fleetSort, setFleetSort] = useState<'name' | 'rssi' | 'fault'>('fault');
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [expandedMobileCardId, setExpandedMobileCardId] = useState<string | null>(null);
  const [inspectedDeviceId, setInspectedDeviceId] = useState<string>('dd_pwr01_a1b2c3');
  const [simSelectedModule, setSimSelectedModule] = useState<Phase1ModuleCode>('PWR-01');
  const [auditReport, setAuditReport] = useState<ContractComplianceReport | null>(null);

  const inspectorDock = getDockPanelState('admin_node_inspector', {
    open: false,
    position: 'right',
  });

  // Onboarding & ₹999 DFY 3D Twin Builder state
  const [batchQueue, setBatchQueue] = useState<BatchClaimItem[]>([
    { id: 'q1', deviceId: 'dd_pwr01_f901', moduleCode: 'PWR-01', roomId: 'room_living', status: 'queued' },
    { id: 'q2', deviceId: 'dd_wat01_f902', moduleCode: 'WAT-01', roomId: 'room_terrace', status: 'queued' },
  ]);
  const [newClaimId, setNewClaimId] = useState('dd_pwr02_f903');
  const [newClaimMod, setNewClaimMod] = useState<Phase1ModuleCode>('PWR-02');
  const [dfyDelivered, setDfyDelivered] = useState(false);
  const [savedDfySummary, setSavedDfySummary] = useState<{
    template: string;
    floors: number;
    rooms: number;
    placements: number;
  }>({ template: '2BHK', floors: 2, rooms: 6, placements: 6 });

  // Signed OTA Manager (G5) state
  const [otaModule, setOtaModule] = useState<Phase1ModuleCode>('PWR-03');
  const [otaVersion, setOtaVersion] = useState('1.4.2-rc1');
  const [otaStage, setOtaStage] = useState<RolloutStage>('test_device');
  const [otaFileName, setOtaFileName] = useState('ddoodle_pwr03_v1.4.2_signed.bin');
  const [otaSizeBytes, setOtaSizeBytes] = useState(917504);
  const [otaSha256, setOtaSha256] = useState(
    '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4'
  );
  const [otaPreflight, setOtaPreflight] = useState({
    range206: true,
    c3CommonCa: true,
    secureBootV2: true,
  });
  const [otaDispatchedPayload, setOtaDispatchedPayload] = useState<OtaPayload | null>(null);

  // AMC Tickets state
  const [amcTickets, setAmcTickets] = useState<AmcTicket[]>(INITIAL_AMC_TICKETS);

  const devicesList = Object.values(snapshot.devices);

  const [initialTrialEndsAt] = useState(() => 1771488000000 + 89 * 24 * 60 * 60 * 1000);
  const demoEntitlements = resolveEntitlements({
    tier: 'all_in_family',
    status: 'active',
    trial_ends_at: initialTrialEndsAt,
    expires_at: initialTrialEndsAt + 365 * 86400000,
    dfy_3d_purchased: dfyDelivered,
  });

  const q = fleetQuery.trim().toLowerCase();
  const filteredFleet = devicesList
    .filter(
      (d) =>
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.device_id.toLowerCase().includes(q) ||
        d.module_code.toLowerCase().includes(q)
    )
    .sort((a, b) => {
      if (fleetSort === 'rssi') return a.state.rssi - b.state.rssi;
      if (fleetSort === 'fault') {
        const af = a.state.fault ? 0 : 1;
        const bf = b.state.fault ? 0 : 1;
        return af - bf;
      }
      return a.name.localeCompare(b.name);
    });

  const activeIncidents: Array<{ incident_id: string; deviceId: string; type: string; severity: string }> = [];
  if (snapshot.activeCrashSos && snapshot.activeCrashSos.status !== 'cancelled_by_user') {
    activeIncidents.push({
      incident_id: snapshot.activeCrashSos.incident_id,
      deviceId: snapshot.activeCrashSos.device_id,
      type: 'CRASH_DETECTED',
      severity: 'CRITICAL',
    });
  }
  for (const d of devicesList) {
    if (d.state.fault) {
      activeIncidents.push({
        incident_id: `inc_${d.device_id}_fault`,
        deviceId: d.device_id,
        type: d.state.fault,
        severity: 'HIGH',
      });
    }
    const wat = d.module_code === 'WAT-01' ? (d.telemetry as WaterTelemetryPayload) : null;
    if (wat?.tank_link === false) {
      activeIncidents.push({
        incident_id: `inc_${d.device_id}_tank`,
        deviceId: d.device_id,
        type: 'TANK_LINK_LOST',
        severity: 'HIGH',
      });
    }
  }

  const inspectedDevice = snapshot.devices[inspectedDeviceId] ?? devicesList[0];
  const otaWithinFlashCeiling = otaSizeBytes <= OTA_SECURITY.PREREQUISITES.MAX_BIN_SIZE_BYTES;

  const handleBinUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > OTA_SECURITY.PREREQUISITES.MAX_BIN_SIZE_BYTES) {
      pushToast({
        title: 'Firmware Exceeds Flash Ceiling',
        description: `Max allowed size is ${(OTA_SECURITY.PREREQUISITES.MAX_BIN_SIZE_BYTES / 1024).toFixed(0)} KiB (1.5 MiB).`,
        tone: 'critical',
      });
      return;
    }
    const buf = await file.arrayBuffer();
    const hex = await computeSha256Hex(buf);
    setOtaFileName(file.name);
    setOtaSizeBytes(file.size);
    setOtaSha256(hex);
    pushToast({
      title: 'Firmware Binary Hashed (SHA-256)',
      description: `${file.name} · ${(file.size / 1024).toFixed(1)} KiB`,
      tone: 'success',
    });
  };

  const handleDispatchOta = () => {
    if (!otaPreflight.range206 || !otaPreflight.c3CommonCa || !otaPreflight.secureBootV2) {
      pushToast({
        title: 'OTA Preflight Blocked',
        description: 'Verify HTTP 206 64 KiB Range, C3 Common-CA & secure-boot-v2 before rollout.',
        tone: 'critical',
      });
      return;
    }
    if (!otaWithinFlashCeiling) {
      pushToast({
        title: 'OTA Binary Too Large',
        description: `Binary must be <= ${OTA_SECURITY.PREREQUISITES.MAX_BIN_SIZE_BYTES} bytes.`,
        tone: 'critical',
      });
      return;
    }
    const payload: OtaPayload = {
      url: `https://ota.ddoodle.in/fw/${otaModule.toLowerCase()}/${otaFileName}`,
      fw_version: otaVersion,
      sha256: otaSha256,
      size: otaSizeBytes,
      sig: OTA_SECURITY.SIGNATURE_SCHEME,
    };
    setOtaDispatchedPayload(payload);
    pushToast({
      title: `Signed OTA Queued (${otaStage.replace('_', ' ').toUpperCase()})`,
      description: `${otaModule} v${otaVersion} · sig: ${payload.sig}`,
      tone: 'success',
    });
  };

  const runLiveAudit = () => {
    const rep = runContractV14Audit();
    setAuditReport(rep);
    pushToast({
      title: rep.isFullyCompliant
        ? `Contract v1.4 Audit: ${rep.passedCount}/${rep.totalAssertions} PASS`
        : 'Contract Audit Found Issues',
      tone: rep.isFullyCompliant ? 'success' : 'critical',
    });
  };

  // Role gate view if previewing as non-admin Customer
  if (adminRole !== 'INSTALLER_ADMIN') {
    return (
      <div className="max-w-md mx-auto my-12 space-y-4">
        <div className="rounded-[var(--dd-radius-card)] bg-surface/85 hairline-border p-5 text-center space-y-3">
          <Lock className="h-8 w-8 mx-auto text-danger" />
          <h1 className="text-base font-semibold">Installer / Admin Role Required</h1>
          <p className="text-xs text-foreground-secondary">
            `/admin` is protected by Firebase Custom Claims (`role == &quot;installer&quot; || role == &quot;admin&quot;`).
          </p>
          <Button variant="primary" size="sm" touchTarget onClick={() => setAdminRole('INSTALLER_ADMIN')}>
            <Shield className="h-3.5 w-3.5" />
            <span>Switch Preview to Installer Admin</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact Operations Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--dd-radius-card)] bg-surface/75 hairline-border px-3.5 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-sm sm:text-base font-semibold tracking-tight text-foreground">
            Installer &amp; Fleet Portal
          </h1>
          <Badge variant="accent">INSTALLER_ADMIN</Badge>
          <span className="text-[11px] text-foreground-muted font-mono tabular-nums">
            {devicesList.length} Nodes · {activeIncidents.length} Alerts
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={runLiveAudit}>
            <FileCheck className="h-3.5 w-3.5 text-success" />
            <span>v1.4 Audit</span>
          </Button>
          <Button
            variant={inspectorDock.open ? 'accent' : 'secondary'}
            size="sm"
            onClick={() =>
              setDockPanelState('admin_node_inspector', {
                open: !inspectorDock.open,
                collapsed: false,
              })
            }
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Inspector</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAdminRole('CUSTOMER')}>
            <Lock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Role Gate</span>
          </Button>
        </div>
      </div>

      {/* Live Contract v1.4 Audit Banner when run */}
      {auditReport && (
        <Banner
          tone={auditReport.isFullyCompliant ? 'success' : 'critical'}
          title={`Protocol Contract ${auditReport.contractVersion} Compliance: ${auditReport.passedCount} / ${auditReport.totalAssertions} Assertions Passed`}
          description="Validates G1–G18 fixtures, G10 latched fault lockout, G12 read-only sensors, G14 E.164 contacts, G15 starter interlock, and G18 Hub proxy."
        />
      )}

      {/* Horizontal Snap-Scrolling Module Tabs */}
      <div className="overflow-x-auto no-scrollbar snap-strip">
        <SegmentedControl<AdminTab>
          ariaLabel="Admin Portal Modules"
          value={activeTab}
          onChange={setActiveTab}
          className="w-max min-w-full"
          options={[
            {
              value: 'fleet',
              label: 'Fleet Health',
              icon: <Activity className="h-3.5 w-3.5" />,
              badge: activeIncidents.length || undefined,
            },
            {
              value: 'onboarding',
              label: 'Onboarding & 3D Builder',
              icon: <Box className="h-3.5 w-3.5" />,
            },
            {
              value: 'ota',
              label: 'Signed OTA (G5)',
              icon: <HardDrive className="h-3.5 w-3.5" />,
            },
            {
              value: 'billing_amc',
              label: 'Plans, 4G SIM & AMC',
              icon: <CreditCard className="h-3.5 w-3.5" />,
            },
          ]}
        />
      </div>

      {/* MODULE 1: FLEET HEALTH & DIAGNOSTICS */}
      {activeTab === 'fleet' && (
        <div className="space-y-3">
          {/* Active Incidents Strip */}
          {activeIncidents.length > 0 && (
            <div className="rounded-[var(--dd-radius-card)] bg-surface/80 hairline-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-danger">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Active Fleet Incidents ({activeIncidents.length})</span>
                </div>
                <Badge variant="danger">PRIORITY</Badge>
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar snap-strip pb-0.5 text-xs font-mono">
                {activeIncidents.map((inc) => (
                  <div
                    key={inc.incident_id}
                    className="snap-start shrink-0 min-w-[230px] rounded-lg hairline-border bg-danger-soft/70 px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-danger text-[11px]">{inc.type}</div>
                      <div className="text-[10px] text-foreground-secondary truncate">
                        {inc.deviceId}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setInspectedDeviceId(inc.deviceId);
                        setDockPanelState('admin_node_inspector', { open: true, collapsed: false });
                      }}
                    >
                      Inspect
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collapsible Filter / Sort Bar */}
          <div className="rounded-[var(--dd-radius-card)] bg-surface/70 hairline-border px-3 py-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground-secondary">
                Fleet Nodes ({filteredFleet.length})
              </span>
              <button
                type="button"
                onClick={() => setShowFilterBar((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-accent cursor-pointer"
              >
                <Filter className="h-3.5 w-3.5" />
                <span>{showFilterBar ? 'Hide Filter & Sort' : 'Filter & Sort'}</span>
              </button>
            </div>

            {showFilterBar && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="h-3.5 w-3.5 text-foreground-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    aria-label="Filter fleet devices"
                    value={fleetQuery}
                    onChange={(e) => setFleetQuery(e.target.value)}
                    placeholder="Filter by device_id, name, or module_code..."
                    className="w-full h-9 rounded-[var(--dd-radius-control)] hairline-border bg-surface-elevated pl-8 pr-3 text-xs text-foreground focus:outline-none focus:border-accent"
                  />
                </div>

                <SegmentedControl<'fault' | 'rssi' | 'name'>
                  size="sm"
                  ariaLabel="Sort fleet"
                  value={fleetSort}
                  onChange={setFleetSort}
                  options={[
                    { value: 'fault', label: 'Faults First' },
                    { value: 'rssi', label: 'Weakest RSSI' },
                    { value: 'name', label: 'A–Z' },
                  ]}
                />
              </div>
            )}
          </div>

          {/* Mobile Compact Expandable Fleet Cards */}
          <div className="grid grid-cols-1 md:hidden gap-2">
            {filteredFleet.map((dev) => {
              const wat = dev.module_code === 'WAT-01' ? (dev.telemetry as WaterTelemetryPayload) : null;
              const isExpanded = expandedMobileCardId === dev.device_id;
              return (
                <div
                  key={dev.device_id}
                  className="rounded-[var(--dd-radius-card)] bg-surface/85 hairline-border px-3 py-2.5 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedMobileCardId(isExpanded ? null : dev.device_id)
                      }
                      className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <Badge variant="accent">{dev.module_code}</Badge>
                      <span className="font-semibold text-foreground truncate">{dev.name}</span>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={dev.state.fault ? 'danger' : 'success'} dot>
                        {dev.state.fault ?? dev.status.toUpperCase()}
                      </Badge>
                      <button
                        type="button"
                        aria-label="Toggle node details"
                        onClick={() =>
                          setExpandedMobileCardId(isExpanded ? null : dev.device_id)
                        }
                        className="p-1 text-foreground-muted hover:text-foreground cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="pt-2 border-t border-border/50 space-y-2">
                      <div className="font-mono text-[11px] text-foreground-muted tabular-nums flex flex-wrap gap-2">
                        <span>ID: {dev.device_id}</span>
                        <span>RSSI {dev.state.rssi} dBm</span>
                        <span>FW v{dev.info.fw_version}</span>
                        <span>{dev.info.operation_mode}</span>
                        {wat?.tank_link === false && <Badge variant="warning">TANK_LINK_LOST</Badge>}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setInspectedDeviceId(dev.device_id);
                          setDockPanelState('admin_node_inspector', { open: true, collapsed: false });
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Open Node Inspector</span>
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop / Tablet Dense Fleet Table */}
          <Card noPadding className="hidden md:block overflow-hidden hairline-border">
            <div className="overflow-x-auto dd-scroll">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/60 bg-surface-elevated/60 text-[11px] font-mono text-foreground-muted">
                    <th className="p-3">Device / ID</th>
                    <th className="p-3">Module</th>
                    <th className="p-3">Status &amp; Faults</th>
                    <th className="p-3">Op Mode</th>
                    <th className="p-3">RSSI</th>
                    <th className="p-3">Firmware</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFleet.map((dev) => {
                    const wat = dev.module_code === 'WAT-01' ? (dev.telemetry as WaterTelemetryPayload) : null;
                    return (
                      <tr
                        key={dev.device_id}
                        className="border-b border-border/40 last:border-b-0 hover:bg-surface-elevated/50"
                      >
                        <td className="p-3">
                          <div className="font-medium text-foreground">{dev.name}</div>
                          <div className="text-[10px] font-mono text-foreground-muted">{dev.device_id}</div>
                        </td>
                        <td className="p-3">
                          <Badge variant="accent">{dev.module_code}</Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant={dev.state.fault ? 'danger' : 'success'} dot>
                              {dev.state.fault ? `G10: ${dev.state.fault}` : dev.status.toUpperCase()}
                            </Badge>
                            {wat?.tank_link === false && <Badge variant="warning">TANK_LINK_LOST</Badge>}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-foreground-secondary">
                          {dev.info.operation_mode}
                        </td>
                        <td className="p-3 font-mono tabular-nums text-foreground-secondary">
                          {dev.state.rssi} dBm
                        </td>
                        <td className="p-3 font-mono tabular-nums text-foreground-secondary">
                          v{dev.info.fw_version}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setInspectedDeviceId(dev.device_id);
                              setDockPanelState('admin_node_inspector', {
                                open: true,
                                collapsed: false,
                              });
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Inspect</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* MODULE 2: CUSTOMER ONBOARDING & ₹999 DFY 3D HOME TWIN BUILDER */}
      {activeTab === 'onboarding' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* QR Batch Provisioning Queue */}
            <Card className="space-y-3 hairline-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-accent" />
                  <span>Field QR Batch-Provisioning Queue</span>
                </CardTitle>
                <Badge variant="mono">{batchQueue.length} Nodes</Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    aria-label="Scanned device ID"
                    value={newClaimId}
                    onChange={(e) => setNewClaimId(e.target.value)}
                    placeholder="Scanned device_id"
                    className="flex-1 min-w-[140px] h-10 rounded hairline-border bg-surface-elevated px-2.5 font-mono text-foreground"
                  />
                  <Dropdown
                    ariaLabel="Module type"
                    value={newClaimMod}
                    onChange={(v) => setNewClaimMod(v as Phase1ModuleCode)}
                    options={[
                      { value: 'PWR-01', label: 'PWR-01' },
                      { value: 'PWR-02', label: 'PWR-02' },
                      { value: 'PWR-03', label: 'PWR-03' },
                      { value: 'WAT-01', label: 'WAT-01' },
                      { value: 'VEH-01', label: 'VEH-01' },
                      { value: 'HUB-01', label: 'HUB-01' },
                    ]}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (!newClaimId.trim()) return;
                      setBatchQueue((prev) => [
                        ...prev,
                        {
                          id: `q_${Date.now()}`,
                          deviceId: newClaimId.trim(),
                          moduleCode: newClaimMod,
                          roomId: 'room_living',
                          status: 'queued',
                        },
                      ]);
                      setNewClaimId('');
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Queue</span>
                  </Button>
                </div>

                <div className="space-y-1.5">
                  {batchQueue.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded hairline-border bg-surface-elevated px-3 py-2 font-mono"
                    >
                      <div>
                        <span className="font-semibold text-foreground">{item.deviceId}</span>
                        <span className="text-foreground-muted ml-2">
                          {item.moduleCode} · {item.roomId}
                        </span>
                      </div>
                      <Badge variant={item.status === 'claimed' ? 'success' : 'warning'}>
                        {item.status.toUpperCase()}
                      </Badge>
                    </div>
                  ))}
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    setBatchQueue((prev) => prev.map((x) => ({ ...x, status: 'claimed' })));
                    pushToast({
                      title: 'Batch Claimed to home_imphal_001',
                      description: 'All queued modules bound via SoftAP/Claim token.',
                      tone: 'success',
                    });
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Claim All Queued Devices to Customer Home</span>
                </Button>
              </CardContent>
            </Card>

            {/* Installer ₹999 DFY 3D Home Twin Delivery Status */}
            <Card className="space-y-3 hairline-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <span>₹{DFY_3D_TWIN_ADDON_INR} DFY 3D Home Twin Builder</span>
                </CardTitle>
                <Badge variant={dfyDelivered ? 'success' : 'accent'}>
                  {dfyDelivered ? 'DELIVERED' : 'LIVE STUDIO'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <p className="text-foreground-secondary leading-relaxed">
                  Use the unified 3D Studio below to configure Indian templates, multi-floor rooms
                  (0.5m grid), and Tap-to-Snap wall/ceiling/terrace module placement. Clicking{' '}
                  <strong className="text-foreground">Save</strong> inside the studio persists directly
                  to <code className="font-mono text-accent">homes/home_imphal_001/layout_3d</code>.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] tabular-nums">
                  <div className="rounded-lg hairline-border bg-surface-elevated p-2">
                    <div className="text-[9px] text-foreground-muted">TEMPLATE</div>
                    <div className="font-bold text-foreground">{savedDfySummary.template}</div>
                  </div>
                  <div className="rounded-lg hairline-border bg-surface-elevated p-2">
                    <div className="text-[9px] text-foreground-muted">FLOORS</div>
                    <div className="font-bold text-foreground">{savedDfySummary.floors}</div>
                  </div>
                  <div className="rounded-lg hairline-border bg-surface-elevated p-2">
                    <div className="text-[9px] text-foreground-muted">ROOMS</div>
                    <div className="font-bold text-foreground">{savedDfySummary.rooms}</div>
                  </div>
                  <div className="rounded-lg hairline-border bg-surface-elevated p-2">
                    <div className="text-[9px] text-foreground-muted">MODULES</div>
                    <div className="font-bold text-accent">{savedDfySummary.placements}</div>
                  </div>
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    setDfyDelivered(true);
                    pushToast({
                      title: `₹${DFY_3D_TWIN_ADDON_INR} DFY 3D Home Twin Marked Delivered`,
                      description: `Synced ${savedDfySummary.template} (${savedDfySummary.rooms} rooms, ${savedDfySummary.placements} modules) to home_imphal_001.`,
                      tone: 'success',
                    });
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Mark ₹{DFY_3D_TWIN_ADDON_INR} DFY 3D Twin Delivered</span>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Unified Full-Viewport 3D Twin Studio for Installer (Phase 10D) */}
          <ErrorBoundary>
            <Home3DTwinView
              homeId="home_imphal_001"
              canCustomize
              isAdminInstaller
              defaultCustomizeOpen
              devices={snapshot.devices}
              entitlements={demoEntitlements}
              onLayoutSaved={(saved: HomeLayout3D) => {
                setSavedDfySummary({
                  template: saved.template_id.toUpperCase(),
                  floors: saved.floors?.length ?? 1,
                  rooms: saved.rooms?.length ?? 0,
                  placements: saved.placements?.filter((p) => !p.hidden).length ?? saved.pins.length,
                });
              }}
              onSendCommand={(id, set) => simulatorEngine.sendCommand(id, set, 'pwa_cloud')}
            />
          </ErrorBoundary>
        </div>
      )}

      {/* MODULE 3: SIGNED OTA FIRMWARE MANAGER (G5) */}
      {activeTab === 'ota' && (
        <div className="space-y-3">
          <Card className="space-y-3 hairline-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-accent" />
                <span>Signed OTA Firmware Rollout (G5)</span>
              </CardTitle>
              <Badge variant="accent">sig: {OTA_SECURITY.SIGNATURE_SCHEME}</Badge>
            </CardHeader>

            <CardContent className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-foreground-secondary font-medium block">Target `module_code`</span>
                  <Dropdown
                    ariaLabel="Target OTA module"
                    value={otaModule}
                    onChange={(v) => setOtaModule(v as Phase1ModuleCode)}
                    options={[
                      { value: 'PWR-01', label: 'PWR-01 (4-Ch Switch)' },
                      { value: 'PWR-02', label: 'PWR-02 (Fan/Dimmer)' },
                      { value: 'PWR-03', label: 'PWR-03 (25A Heavy)' },
                      { value: 'WAT-01', label: 'WAT-01 (Tank/Pump)' },
                      { value: 'VEH-01', label: 'VEH-01 (Vehicle)' },
                      { value: 'HUB-01', label: 'HUB-01 (Local Hub)' },
                    ]}
                  />
                </div>
                <label className="space-y-1">
                  <span className="text-foreground-secondary font-medium">Firmware Version</span>
                  <input
                    type="text"
                    value={otaVersion}
                    onChange={(e) => setOtaVersion(e.target.value)}
                    className="w-full h-10 rounded-[var(--dd-radius-control)] hairline-border bg-surface-elevated px-3 font-mono text-foreground"
                  />
                </label>
              </div>

              <label className="block rounded-[var(--dd-radius-control)] border border-dashed border-border-strong bg-surface-elevated p-3 text-center cursor-pointer hover:border-accent-border transition">
                <input
                  type="file"
                  accept=".bin,application/octet-stream"
                  onChange={(e) => void handleBinUpload(e)}
                  className="hidden"
                />
                <div className="font-medium text-foreground">
                  Upload Signed `.bin` Firmware (computes SHA-256 in browser)
                </div>
                <div className="text-[11px] font-mono text-foreground-muted mt-1 tabular-nums">
                  Active: {otaFileName} · {(otaSizeBytes / 1024).toFixed(1)} KiB ({otaSizeBytes} bytes)
                </div>
              </label>

              <div className="rounded hairline-border bg-canvas/80 p-2.5 font-mono text-[10px] break-all text-foreground-secondary">
                <span className="text-foreground-muted">SHA-256: </span>
                <span className="text-accent">{otaSha256}</span>
              </div>

              <div className="space-y-1">
                <span className="text-foreground-secondary font-medium block">Staged Rollout Ring</span>
                <SegmentedControl<RolloutStage>
                  fullWidth
                  size="sm"
                  ariaLabel="Staged OTA rollout ring"
                  value={otaStage}
                  onChange={setOtaStage}
                  options={[
                    { value: 'test_device', label: '1. Test Device' },
                    { value: 'pilot_group', label: '2. Pilot Group' },
                    { value: 'fleet', label: '3. Full Fleet' },
                  ]}
                />
              </div>

              <Button variant="primary" className="w-full" onClick={handleDispatchOta}>
                <Send className="h-3.5 w-3.5" />
                <span>Publish Signed `.../ota` Rollout</span>
              </Button>
            </CardContent>
          </Card>

          {/* Collapsible OTA Preflight Readiness & Dispatched Payload */}
          <CollapsibleSection
            sectionId="admin_ota_preflight"
            title="v1.4 Backend OTA Preflight Readiness (C3 / HTTP 206)"
            subtitle="64 KiB Range Chunking, C3 Common-CA & Secure Boot v2 checks"
            icon={<ShieldCheck className="h-3.5 w-3.5 text-success" />}
            badge={<Badge variant="success">VERIFIED</Badge>}
            defaultOpen={false}
          >
            <div className="space-y-2.5 text-xs">
              {[
                {
                  key: 'range206' as const,
                  title: 'HTTP 206 Partial Content (64 KiB Range Chunking)',
                  desc: 'Required for ESP32-C3 low-RAM resilient resume over flaky Indian 4G/Wi-Fi.',
                },
                {
                  key: 'c3CommonCa' as const,
                  title: 'C3 Common-CA Certificate Chain Verified',
                  desc: 'Shared Root CA bundle pinned in firmware flash for MQTT TLS & OTA HTTPS.',
                },
                {
                  key: 'secureBootV2' as const,
                  title: 'ESP32 Secure Boot v2 Signature (`sig: "secure-boot-v2"`)',
                  desc: 'Unsigned or mismatched SHA-256 binaries are rejected by bootloader.',
                },
              ].map((chk) => (
                <ThemedCheckbox
                  key={chk.key}
                  variant="card"
                  checked={otaPreflight[chk.key]}
                  onChange={(checked) =>
                    setOtaPreflight((prev) => ({ ...prev, [chk.key]: checked }))
                  }
                  label={chk.title}
                  description={chk.desc}
                />
              ))}

              {otaDispatchedPayload && (
                <div className="space-y-1 pt-2">
                  <div className="text-[10px] font-mono text-success uppercase">
                    Dispatched G5 `.../ota` Payload:
                  </div>
                  <pre className="rounded hairline-border bg-canvas p-2.5 font-mono text-[10px] text-foreground-secondary overflow-x-auto dd-scroll">
                    {JSON.stringify(otaDispatchedPayload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* MODULE 4: SUBSCRIPTIONS, 4G M2M SIM & AMC MANAGER */}
      {activeTab === 'billing_amc' && (
        <div className="space-y-3">
          {/* Customer Plans & 4G M2M SIM Table */}
          <Card noPadding className="overflow-hidden hairline-border">
            <div className="p-3 border-b border-border/50 flex items-center justify-between">
              <div className="text-xs font-semibold text-foreground">
                Customer Subscriptions &amp; VEH-01 4G M2M SIM Renewals
              </div>
              <Badge variant="mono">{CUSTOMER_PLANS.length} Homes</Badge>
            </div>
            <div className="overflow-x-auto dd-scroll">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/50 bg-surface-elevated/60 text-[11px] font-mono text-foreground-muted">
                    <th className="p-3">Customer / Home</th>
                    <th className="p-3">Plan Tier</th>
                    <th className="p-3">Trial / Cycle</th>
                    <th className="p-3">VEH-01 4G M2M SIM</th>
                    <th className="p-3">UPI Status</th>
                  </tr>
                </thead>
                <tbody>
                  {CUSTOMER_PLANS.map((row) => (
                    <tr key={row.homeId} className="border-b border-border/40 last:border-b-0">
                      <td className="p-3">
                        <div className="font-medium text-foreground">{row.customer}</div>
                        <div className="text-[10px] font-mono text-foreground-muted">{row.homeId}</div>
                      </td>
                      <td className="p-3">
                        <Badge variant={row.tier === 'all_in_family' || row.tier === 'shield' ? 'accent' : 'neutral'}>
                          {row.tier.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-foreground-secondary">
                        {row.trialStatus}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-foreground-secondary tabular-nums">
                        {row.simRenewal}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            row.upiStatus === 'PAID'
                              ? 'success'
                              : row.upiStatus === 'DUE D-7'
                              ? 'warning'
                              : 'accent'
                          }
                        >
                          {row.upiStatus}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* AMC Tickets & 24h Swap Priority SLA */}
          <Card className="space-y-3 hairline-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-accent" />
                <span>AMC Tickets (`amc_tickets/&#123;ticket_id&#125;`)</span>
              </CardTitle>
              <Badge variant="warning">24h SWAP SLA — SHIELD / ALL-IN</Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {amcTickets.map((t) => (
                <div
                  key={t.ticket_id}
                  className="rounded-lg hairline-border bg-surface-elevated/70 p-3 flex flex-wrap items-center justify-between gap-2.5"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-semibold text-foreground">{t.ticket_id}</span>
                      <span className="font-medium text-foreground">{t.device}</span>
                      {t.sla24h && <Badge variant="danger">24h SWAP SLA</Badge>}
                      <Badge variant={t.status === 'RESOLVED' ? 'success' : 'warning'}>
                        {t.status}
                      </Badge>
                    </div>
                    <div className="text-foreground-secondary">{t.issue}</div>
                    <div className="text-[10px] font-mono text-foreground-muted">{t.customer}</div>
                  </div>

                  {t.status !== 'RESOLVED' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setAmcTickets((prev) =>
                          prev.map((x) =>
                            x.ticket_id === t.ticket_id ? { ...x, status: 'RESOLVED' } : x
                          )
                        );
                        pushToast({ title: `Ticket ${t.ticket_id} Resolved`, tone: 'success' });
                      }}
                    >
                      Mark Resolved
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dockable Node Telemetry & Protocol Diagnostics Inspector */}
      <DockablePanel
        panelId="admin_node_inspector"
        title={inspectedDevice ? `Node Inspector · ${inspectedDevice.name}` : 'Diagnostics Inspector'}
        subtitle={
          inspectedDevice
            ? `${inspectedDevice.module_code} · RSSI ${inspectedDevice.state.rssi} dBm`
            : 'Fleet Diagnostics'
        }
        icon={<Cpu className="h-3.5 w-3.5" />}
        defaultOpen={false}
        defaultPosition="right"
      >
        <div className="space-y-4">
          {inspectedDevice && (
            <div className="rounded-lg hairline-border bg-surface-elevated p-3 font-mono text-[11px] space-y-1 tabular-nums">
              <div className="flex justify-between">
                <span className="text-foreground-muted">Device ID</span>
                <span className="text-foreground">{inspectedDevice.device_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">Firmware / HW</span>
                <span className="text-foreground">
                  v{inspectedDevice.info.fw_version} / {inspectedDevice.info.hw_rev}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">Fault State</span>
                <span className={inspectedDevice.state.fault ? 'text-danger font-bold' : 'text-success'}>
                  {inspectedDevice.state.fault ?? 'NONE'}
                </span>
              </div>
            </div>
          )}

          <ErrorBoundary>
            <SimulatorWorkbench
              snapshot={snapshot}
              selectedModule={simSelectedModule}
              onSelectModule={setSimSelectedModule}
            />
          </ErrorBoundary>
        </div>
      </DockablePanel>
    </div>
  );
}
