'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  Activity,
  Box,
  Eye,
  EyeOff,
  LayoutGrid,
  Mic,
  PanelRightOpen,
  Sliders,
} from 'lucide-react';
import { simulatorEngine } from '@/lib/simulator/engine';
import { Phase1ModuleCode } from '@/lib/protocol/contract';
import { resolveEntitlements } from '@/lib/entitlements/resolver';
import { PlanBadge } from '@/components/entitlements/PlanBadge';
import { PWAInstallButton } from '@/components/pwa/PWAInstallButton';
import { DynamicCapabilityCard } from '@/components/capabilities/DynamicCapabilityCard';
import { SimulatorWorkbench } from '@/components/simulator/SimulatorWorkbench';
import { Home3DTwinView } from '@/components/twin/Home3DTwinView';
import { VoiceIntegrationsModal } from '@/components/voice/VoiceIntegrationsModal';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import {
  Button,
  Dropdown,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import {
  DockablePanel,
  FullscreenStage,
  UniversalLayoutStudio,
  useWorkspace,
} from '@/components/workspace';

export default function DDoodleSmartHomeDashboard() {
  const {
    prefs,
    snapshot,
    editLayoutMode,
    setEditLayoutMode,
    getDockPanelState,
    setDockPanelState,
  } = useWorkspace();
  const { pushToast } = useToast();

  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [selectedModule, setSelectedModule] = useState<Phase1ModuleCode>('PWR-01');
  const [inspectedDeviceId, setInspectedDeviceId] = useState<string>('dd_pwr01_a1b2c3');
  const [inspectorPinRevealed, setInspectorPinRevealed] = useState(false);

  const workbenchState = getDockPanelState('sim_workbench', { open: false, position: 'right' });
  const inspectorState = getDockPanelState('quick_inspector', { open: false, position: 'right' });

  const [initialTrialEndsAt] = useState(() => 1771488000000 + 89 * 24 * 60 * 60 * 1000);
  const entitlements = resolveEntitlements({
    tier: 'core',
    status: 'trial',
    trial_ends_at: initialTrialEndsAt,
    expires_at: null,
    dfy_3d_purchased: false,
  });

  const devicesList = Object.values(snapshot.devices);
  const hubMembers = devicesList
    .filter((d) => d.module_code !== 'HUB-01')
    .map((d) => ({
      device_id: d.device_id,
      name: d.name,
      module_code: d.module_code,
      via: d.state.via,
    }));

  const roomContainers = prefs.layout2D.containers;
  const filterTabs = [
    { id: 'all', label: 'All Containers', count: devicesList.length },
    ...roomContainers.map((c) => ({
      id: c.id,
      label: c.title,
      count: c.itemIds.filter((id) => !prefs.layout2D.hiddenItems.includes(id)).length,
    })),
  ];

  const inspectedDevice = snapshot.devices[inspectedDeviceId] ?? devicesList[0];
  const inspectedPackets = snapshot.packetLog
    .filter((p) => !inspectedDevice || p.topic.includes(inspectedDevice.device_id))
    .slice(0, 8);

  const openInspectorFor = (deviceId: string) => {
    setInspectedDeviceId(deviceId);
    setInspectorPinRevealed(false);
    setDockPanelState('quick_inspector', { open: true, collapsed: false });
  };

  const handlePullRefresh = () => {
    pushToast({
      title: 'Home State Synced',
      description: `Verified ${devicesList.length} modules over ${snapshot.activeTransport}`,
      tone: 'success',
    });
  };

  return (
    <PullToRefresh onRefresh={handlePullRefresh} hapticsEnabled={prefs.hapticsEnabled}>
      <div className="space-y-4">
        {/* Top Context Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <SegmentedControl<'2d' | '3d'>
              ariaLabel="2D Grid or 3D Twin"
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: '2d', label: '2D Studio', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
                { value: '3d', label: '3D Twin', icon: <Box className="h-3.5 w-3.5" /> },
              ]}
            />
            <PlanBadge entitlements={entitlements} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {viewMode === '2d' && (
              <Button
                variant={editLayoutMode ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setEditLayoutMode((m) => !m)}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>{editLayoutMode ? 'Done Editing' : 'Customize Layout'}</span>
              </Button>
            )}

            <Button
              variant={inspectorState.open ? 'accent' : 'secondary'}
              size="sm"
              onClick={() =>
                setDockPanelState('quick_inspector', {
                  open: !inspectorState.open,
                  collapsed: false,
                })
              }
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Inspector</span>
            </Button>

            <Button
              variant={workbenchState.open ? 'accent' : 'secondary'}
              size="sm"
              onClick={() =>
                setDockPanelState('sim_workbench', {
                  open: !workbenchState.open,
                  collapsed: false,
                })
              }
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Diagnostics</span>
            </Button>

            <Button variant="secondary" size="sm" onClick={() => setShowVoiceModal(true)}>
              <Mic className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Voice</span>
            </Button>

            <PWAInstallButton />
          </div>
        </div>

        {/* Main Stage: 3D Home Twin or Universal 2D Layout Studio */}
        {viewMode === '3d' ? (
          <FullscreenStage
            title="3D Home Digital Twin"
            subtitle="Interactive Three.js Spatial View · Switch back to 2D Studio anytime for Eco mode"
            toolbar={
              <Button variant="secondary" size="sm" onClick={() => setViewMode('2d')}>
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Eco 2D Fallback</span>
              </Button>
            }
          >
            <ErrorBoundary>
              <Home3DTwinView
                devices={snapshot.devices}
                entitlements={entitlements}
                onSendCommand={(deviceId, set) =>
                  simulatorEngine.sendCommand(deviceId, set, 'pwa_cloud')
                }
                onInspectDevice={openInspectorFor}
              />
            </ErrorBoundary>
          </FullscreenStage>
        ) : (
          <div className="space-y-4">
            {/* Container / Room Filter Pills (with shared-element layoutId) */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 dd-scroll flex-1">
                {filterTabs.map((r) => {
                  const active = selectedRoom === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRoom(r.id)}
                      className={`relative px-3 h-8 rounded-full border text-xs font-medium whitespace-nowrap transition-colors cursor-pointer tabular-nums ${
                        active
                          ? 'text-accent border-accent-border'
                          : 'bg-surface border-border text-foreground-secondary hover:text-foreground'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="home-room-pill"
                          transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                          className="absolute inset-0 rounded-full bg-accent-soft"
                        />
                      )}
                      <span className="relative z-10">
                        {r.label} <span className="font-mono text-[10px] opacity-75">{r.count}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="hidden lg:block w-52 shrink-0">
                <Dropdown
                  searchable
                  ariaLabel="Filter container or room"
                  value={selectedRoom}
                  onChange={setSelectedRoom}
                  options={filterTabs.map((r) => ({
                    value: r.id,
                    label: r.label,
                    badge: String(r.count),
                  }))}
                />
              </div>
            </div>

            <UniversalLayoutStudio
              selectedRoomFilter={selectedRoom}
              hasPlusHistory={entitlements.effectiveTier !== 'core'}
              onInspectDevice={openInspectorFor}
            />
          </div>
        )}

        {/* Dockable Quick Inspector & Live Stream Panel */}
        <DockablePanel
          panelId="quick_inspector"
          title={inspectedDevice ? `Inspector · ${inspectedDevice.name}` : 'Quick Inspector'}
          subtitle={
            inspectedDevice
              ? `${inspectedDevice.module_code} · ${inspectedDevice.state.rssi} dBm`
              : 'Select a device'
          }
          icon={<Eye className="h-3.5 w-3.5" />}
          defaultOpen={false}
          defaultPosition="right"
        >
          {inspectedDevice && (
            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums">
                <div className="rounded-md border border-border bg-surface-elevated p-2">
                  <div className="text-[9px] text-foreground-muted">RSSI / SIGNAL</div>
                  <div className="font-semibold text-foreground">{inspectedDevice.state.rssi} dBm</div>
                </div>
                <div className="rounded-md border border-border bg-surface-elevated p-2">
                  <div className="text-[9px] text-foreground-muted">LAST ACK</div>
                  <div className="font-semibold text-success truncate">
                    {inspectedDevice.state.ack ?? 'SYNCED'}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-surface-elevated p-2">
                  <div className="text-[9px] text-foreground-muted">OP MODE</div>
                  <div className="font-semibold text-foreground">{inspectedDevice.info.operation_mode}</div>
                </div>
                <div className="rounded-md border border-border bg-surface-elevated p-2">
                  <div className="text-[9px] text-foreground-muted">G7 LOCAL PIN</div>
                  <button
                    type="button"
                    onClick={() => setInspectorPinRevealed((r) => !r)}
                    className="inline-flex items-center gap-1 font-semibold text-accent cursor-pointer"
                  >
                    <span>{inspectorPinRevealed ? inspectedDevice.local_pin : '••••••••'}</span>
                    {inspectorPinRevealed ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>

              <DynamicCapabilityCard
                device={inspectedDevice}
                tariffInr={prefs.tariffInr}
                hasPlusHistory={entitlements.effectiveTier !== 'core'}
                connectedHubMembers={
                  inspectedDevice.module_code === 'HUB-01' ? hubMembers : undefined
                }
                onSendCommand={(deviceId, set) =>
                  simulatorEngine.sendCommand(deviceId, set, 'pwa_cloud')
                }
                onTriggerCrash={() => simulatorEngine.triggerVehicleCrash()}
              />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-foreground-muted">
                  <span>LIVE TELEMETRY &amp; PACKET STREAM</span>
                  <Link
                    href={`/devices/${inspectedDevice.device_id}`}
                    className="text-accent hover:underline"
                  >
                    Open Detail Page →
                  </Link>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto dd-scroll">
                  {inspectedPackets.length === 0 ? (
                    <div className="rounded border border-border bg-surface-elevated p-2.5 text-[11px] font-mono text-foreground-muted">
                      Listening for live frames on {inspectedDevice.device_id}...
                    </div>
                  ) : (
                    inspectedPackets.map((pkt) => (
                      <div
                        key={pkt.id}
                        className="rounded border border-border bg-surface-elevated p-2 font-mono text-[10px] space-y-0.5"
                      >
                        <div className="flex items-center justify-between text-foreground-secondary">
                          <span className="text-accent font-semibold">{pkt.direction}</span>
                          <span className="tabular-nums">{pkt.transport}</span>
                        </div>
                        <div className="text-foreground-muted truncate">{pkt.topic}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </DockablePanel>

        {/* Dockable Simulator & Protocol Diagnostics Panel */}
        <DockablePanel
          panelId="sim_workbench"
          title="Protocol & Fault Diagnostics"
          subtitle="v1.4 Simulator · G1–G18 Validator"
          icon={<Activity className="h-3.5 w-3.5" />}
          defaultOpen={false}
          defaultPosition="right"
        >
          <ErrorBoundary>
            <SimulatorWorkbench
              snapshot={snapshot}
              selectedModule={selectedModule}
              onSelectModule={setSelectedModule}
            />
          </ErrorBoundary>
        </DockablePanel>

        {/* Voice C2C Modal */}
        <VoiceIntegrationsModal
          isOpen={showVoiceModal}
          onClose={() => setShowVoiceModal(false)}
          entitlements={entitlements}
          onTestScene={(scene) =>
            pushToast({ title: `Voice Scene: ${scene}`, tone: 'success' })
          }
        />
      </div>
    </PullToRefresh>
  );
}
