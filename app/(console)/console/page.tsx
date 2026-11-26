'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';
import {
  Activity,
  Box,
  ChevronDown,
  CreditCard,
  Eye,
  EyeOff,
  LayoutGrid,
  Mic,
  PanelRightOpen,
  Sliders,
} from 'lucide-react';
import { simulatorEngine } from '@/lib/simulator/engine';
import { Phase1ModuleCode } from '@/lib/protocol/contract';
import { TIER_CATALOG } from '@/lib/entitlements/resolver';
import { useUnifiedHome } from '@/lib/data/unifiedStore';
import { DynamicCapabilityCard } from '@/components/capabilities/DynamicCapabilityCard';
import { SimulatorWorkbench } from '@/components/simulator/SimulatorWorkbench';
import { VoiceIntegrationsModal } from '@/components/voice/VoiceIntegrationsModal';

const Home3DTwinView = dynamic(
  () => import('@/components/twin/Home3DTwinView').then((m) => m.Home3DTwinView),
  {
    ssr: false,
    loading: () => (
      <div className="h-[calc(100dvh-136px)] md:h-[calc(100dvh-96px)] min-h-[500px] rounded-2xl border border-border bg-surface flex items-center justify-center text-xs font-mono text-foreground-muted">
        Loading 3D Home Twin...
      </div>
    ),
  }
);
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import {
  Badge,
  useToast,
} from '@/components/ui';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import {
  DockablePanel,
  UniversalLayoutStudio,
  useWorkspace,
} from '@/components/workspace';
import { cn } from '@/lib/utils';
import {
  countVisibleWidgetsInSubtree,
  flattenContainersWithMeta,
  getDisplayTitle,
} from '@/lib/layout/tree';

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
  const { subscription, entitlements } = useUnifiedHome(prefs.activeHomeId);

  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [selectedModule, setSelectedModule] = useState<Phase1ModuleCode>('PWR-01');
  const [inspectedDeviceId, setInspectedDeviceId] = useState<string>('dd_pwr01_a1b2c3');
  const [inspectorPinRevealed, setInspectorPinRevealed] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  const workbenchState = getDockPanelState('home_sim_workbench', { open: false, position: 'right' });
  const inspectorState = getDockPanelState('quick_inspector', { open: false, position: 'right' });

  // Listen for global Quick Tools header toggles (2D/3D switch & Voice C2C modal)
  useEffect(() => {
    const onToggleViewMode = () => {
      setViewMode((prev) => {
        const next = prev === '2d' ? '3d' : '2d';
        if (next === '3d') setEditLayoutMode(false);
        return next;
      });
    };
    const onOpenVoice = () => {
      setShowVoiceModal(true);
    };
    window.addEventListener('ddoodle:toggle-home-view-mode', onToggleViewMode);
    window.addEventListener('ddoodle:open-voice-modal', onOpenVoice);
    return () => {
      window.removeEventListener('ddoodle:toggle-home-view-mode', onToggleViewMode);
      window.removeEventListener('ddoodle:open-voice-modal', onOpenVoice);
    };
  }, [setEditLayoutMode]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const devicesList = Object.values(snapshot.devices);
  const hubMembers = devicesList
    .filter((d) => d.module_code !== 'HUB-01')
    .map((d) => ({
      device_id: d.device_id,
      name: d.name,
      module_code: d.module_code,
      via: d.state.via,
    }));

  const visibleFlatContainers = flattenContainersWithMeta(
    prefs.layout2D.layout_tree,
    prefs.layout2D.customTitles
  ).filter(
    ({ container }) =>
      container.id !== 'zone_monitors' &&
      !prefs.layout2D.hiddenContainers.includes(container.id)
  );
  const filterTabs = [
    {
      id: 'all',
      label: 'All Rooms',
      count: devicesList.filter((d) => !prefs.layout2D.hiddenItems.includes(d.device_id)).length,
    },
    ...visibleFlatContainers.map(({ container }) => ({
      id: container.id,
      label: getDisplayTitle(prefs.layout2D.customTitles, container.id, container.title),
      count: countVisibleWidgetsInSubtree(
        container,
        prefs.layout2D.hiddenItems,
        prefs.layout2D.hiddenContainers
      ),
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
      <div className="space-y-3">
        {/* 2D Dashboard Sub-Bar (hidden in full-viewport 3D mode so zero duplicate chrome) */}
        {viewMode === '2d' && (
        <div className="flex items-center justify-between gap-2 rounded-2xl border hairline-border bg-surface/75 px-2.5 py-1.5">
          {/* Compact 2D / 3D Segmented Toggle */}
          <div className="inline-flex shrink-0 rounded-xl border border-border/70 bg-surface-elevated p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('2d')}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors cursor-pointer',
                'bg-accent text-[var(--dd-accent-fg)] font-semibold'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>2D</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditLayoutMode(false);
                setViewMode('3d');
              }}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors cursor-pointer',
                'text-foreground-secondary hover:text-foreground'
              )}
            >
              <Box className="h-3.5 w-3.5" />
              <span>3D</span>
            </button>
          </div>

          {/* Horizontal Snap-Scrolling Room Filter Strip (zero visible scrollbar) */}
          <div className="snap-strip flex-1 items-center gap-1.5 px-1">
              {filterTabs.map((r) => {
                const active = selectedRoom === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRoom(r.id)}
                    className={cn(
                      'snap-start relative shrink-0 px-2.5 h-7 rounded-full border text-xs font-medium whitespace-nowrap transition-colors cursor-pointer tabular-nums',
                      active
                        ? 'text-accent border-accent-border'
                        : 'bg-surface-elevated/60 border-transparent text-foreground-secondary hover:text-foreground'
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="home-room-pill"
                        transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                        className="absolute inset-0 rounded-full bg-accent-soft"
                      />
                    )}
                    <span className="relative z-10">
                      {r.label}{' '}
                      <span className="font-mono text-[10px] opacity-70">{r.count}</span>
                    </span>
                  </button>
                );
              })}
          </div>

          {/* Single Compact [Actions ▾] Dropdown */}
          <div ref={actionsMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setActionsOpen((o) => !o)}
              aria-expanded={actionsOpen}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-xl border px-2.5 text-xs font-medium transition-colors cursor-pointer',
                editLayoutMode || actionsOpen
                  ? 'border-accent bg-accent-soft text-accent font-semibold'
                  : 'border-border/70 bg-surface-elevated text-foreground-secondary hover:text-foreground'
              )}
            >
              <Sliders className="h-3 w-3" />
              <span className="hidden sm:inline">
                {editLayoutMode ? 'Editing' : 'Actions'}
              </span>
              <ChevronDown className="h-3 w-3" />
            </button>

            {actionsOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-border bg-surface shadow-2xl p-1.5 z-40 space-y-1 text-xs">
                {viewMode === '2d' && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditLayoutMode((m) => !m);
                      setActionsOpen(false);
                    }}
                    className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Sliders className="h-3.5 w-3.5 text-accent" />
                      <span>{editLayoutMode ? 'Finish Editing' : 'Customize Layout'}</span>
                    </span>
                    {editLayoutMode && <Badge variant="accent">ON</Badge>}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setDockPanelState('quick_inspector', {
                      open: !inspectorState.open,
                      collapsed: false,
                    });
                    setActionsOpen(false);
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5 text-accent" />
                    <span>Quick Inspector Dock</span>
                  </span>
                  {inspectorState.open && <Badge variant="accent">OPEN</Badge>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDockPanelState('home_sim_workbench', {
                      open: !workbenchState.open,
                      collapsed: false,
                    });
                    setActionsOpen(false);
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <PanelRightOpen className="h-3.5 w-3.5 text-accent" />
                    <span>Protocol Diagnostics Deck</span>
                  </span>
                  {workbenchState.open && <Badge variant="accent">OPEN</Badge>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowVoiceModal(true);
                    setActionsOpen(false);
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <Mic className="h-3.5 w-3.5 text-accent" />
                    <span>Voice C2C Integrations</span>
                  </span>
                  <span className="text-[10px] font-mono text-foreground-muted">Plus</span>
                </button>

                <div className="pt-1 border-t hairline-border">
                  <Link
                    href="/console/billing"
                    onClick={() => setActionsOpen(false)}
                    className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] text-foreground-secondary hover:bg-surface-elevated hover:text-foreground"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-accent" />
                      <span>
                        Plan: {TIER_CATALOG[entitlements.effectiveTier].displayName} (
                        {subscription?.trialStatus ?? 'Active'})
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-accent">→</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Main Stage: Full-Viewport 3D Home Twin or Universal 2D Layout Studio */}
        {viewMode === '3d' ? (
          <ErrorBoundary>
            <Home3DTwinView
              homeId={prefs.activeHomeId}
              canCustomize={prefs.userRole === 'OWNER'}
              devices={snapshot.devices}
              entitlements={entitlements}
              onSendCommand={(deviceId, set) =>
                simulatorEngine.sendCommand(deviceId, set, 'pwa_cloud')
              }
              onInspectDevice={openInspectorFor}
              onExitTo2D={() => setViewMode('2d')}
            />
          </ErrorBoundary>
        ) : (
          <UniversalLayoutStudio
            selectedRoomFilter={selectedRoom}
            hasPlusHistory={entitlements.effectiveTier !== 'core'}
            onInspectDevice={openInspectorFor}
          />
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
                <div className="rounded-xl border hairline-border bg-surface-elevated p-2">
                  <div className="text-[9px] text-foreground-muted">RSSI / SIGNAL</div>
                  <div className="font-semibold text-foreground">{inspectedDevice.state.rssi} dBm</div>
                </div>
                <div className="rounded-xl border hairline-border bg-surface-elevated p-2">
                  <div className="text-[9px] text-foreground-muted">LAST ACK</div>
                  <div className="font-semibold text-success truncate">
                    {inspectedDevice.state.ack ?? 'SYNCED'}
                  </div>
                </div>
                <div className="rounded-xl border hairline-border bg-surface-elevated p-2">
                  <div className="text-[9px] text-foreground-muted">OP MODE</div>
                  <div className="font-semibold text-foreground">{inspectedDevice.info.operation_mode}</div>
                </div>
                <div className="rounded-xl border hairline-border bg-surface-elevated p-2">
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
                    href={
                      inspectedDevice.module_code === 'VEH-01'
                        ? `/console/vehicles/${inspectedDevice.device_id}`
                        : `/console/devices/${inspectedDevice.device_id}`
                    }
                    className="text-accent hover:underline"
                  >
                    Open Detail Page →
                  </Link>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto dd-scroll">
                  {inspectedPackets.length === 0 ? (
                    <div className="rounded-xl border hairline-border bg-surface-elevated p-2.5 text-[11px] font-mono text-foreground-muted">
                      Listening for live frames on {inspectedDevice.device_id}...
                    </div>
                  ) : (
                    inspectedPackets.map((pkt) => (
                      <div
                        key={pkt.id}
                        className="rounded-xl border hairline-border bg-surface-elevated p-2 font-mono text-[10px] space-y-0.5"
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
          panelId="home_sim_workbench"
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
