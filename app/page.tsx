'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Box,
  ChevronRight,
  Cpu,
  Droplets,
  Eye,
  EyeOff,
  LayoutGrid,
  Mic,
  PanelRightOpen,
  Play,
  RotateCcw,
  Sliders,
  Zap,
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
  Badge,
  Button,
  Card,
  Dropdown,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import {
  CollapsibleSection,
  DockablePanel,
  DraggableList,
  FullscreenStage,
  useWorkspace,
  WidgetSizeFrame,
} from '@/components/workspace';

const ROOM_META: Record<string, string> = {
  room_living: 'Living Room',
  room_bedroom: 'Master Bedroom',
  room_bath: 'Master Bath',
  room_terrace: 'Terrace & Tank',
  room_garage: 'Garage & Vehicle',
};

export default function DDoodleSmartHomeDashboard() {
  const {
    snapshot,
    getDockPanelState,
    setDockPanelState,
    resetWorkspacePreferences,
  } = useWorkspace();
  const { pushToast } = useToast();

  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [customizeLayout, setCustomizeLayout] = useState(false);
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

  const devicesList = useMemo(() => Object.values(snapshot.devices), [snapshot.devices]);

  const hubMembers = useMemo(
    () =>
      devicesList
        .filter((d) => d.module_code !== 'HUB-01')
        .map((d) => ({
          device_id: d.device_id,
          name: d.name,
          module_code: d.module_code,
          via: d.state.via,
        })),
    [devicesList]
  );

  const rooms = useMemo(() => {
    const uniqueRoomIds = Array.from(new Set(devicesList.map((d) => d.room_id)));
    return [
      { id: 'all', label: 'All Rooms', count: devicesList.length },
      ...uniqueRoomIds.map((rid) => ({
        id: rid,
        label: ROOM_META[rid] ?? rid,
        count: devicesList.filter((d) => d.room_id === rid).length,
      })),
    ];
  }, [devicesList]);

  const visibleRoomGroups = useMemo(() => {
    const targetRoomIds =
      selectedRoom === 'all'
        ? Array.from(new Set(devicesList.map((d) => d.room_id)))
        : [selectedRoom];

    return targetRoomIds
      .map((rid) => ({
        roomId: rid,
        label: ROOM_META[rid] ?? rid,
        devices: devicesList.filter((d) => d.room_id === rid),
      }))
      .filter((g) => g.devices.length > 0);
  }, [devicesList, selectedRoom]);

  // Aggregates (Protocol Contract v1.4)
  const totalWatts = devicesList.reduce((acc, d) => {
    const p = d.telemetry as { p?: number };
    return acc + (p?.p ?? 0);
  }, 0);

  const totalKwh = devicesList.reduce((acc, d) => {
    const p = d.telemetry as { kwh?: number };
    return acc + (p?.kwh ?? 0);
  }, 0);

  const wat01 = snapshot.devices['dd_wat01_j1k2l3'];
  const watTel = wat01?.telemetry as {
    level_pct?: number;
    level_cm?: number;
    flow_lpm?: number;
    tank_link?: boolean;
  };
  const waterLevel = watTel?.level_pct ?? 0;
  const waterDepthCm = watTel?.level_cm ?? Math.round(waterLevel * 2);
  const tankLinkLost = watTel?.tank_link === false;

  const inspectedDevice = snapshot.devices[inspectedDeviceId] ?? devicesList[0];
  const inspectedPackets = useMemo(
    () =>
      snapshot.packetLog
        .filter((p) => !inspectedDevice || p.topic.includes(inspectedDevice.device_id))
        .slice(0, 8),
    [snapshot.packetLog, inspectedDevice]
  );

  const openInspectorFor = (deviceId: string) => {
    setInspectedDeviceId(deviceId);
    setInspectorPinRevealed(false);
    setDockPanelState('quick_inspector', { open: true, collapsed: false });
  };

  const triggerRecipe = (recipe: string, label: string) => {
    if (recipe === 'inverter_saver') {
      simulatorEngine.sendCommand('dd_pwr03_g7h8i9', { ch1: false }, 'rule');
    } else if (recipe === 'geyser_morning') {
      simulatorEngine.sendCommand('dd_pwr03_g7h8i9', { ch1: true }, 'rule');
    } else if (recipe === 'tank_fill') {
      simulatorEngine.sendCommand('dd_wat01_j1k2l3', { pump_on: true }, 'rule');
    } else if (recipe === 'porch_lights') {
      const pwr01 = snapshot.devices['dd_pwr01_a1b2c3'];
      const next = !pwr01?.state.state.ch3;
      simulatorEngine.sendCommand('dd_pwr01_a1b2c3', { ch3: next }, 'rule');
    }
    pushToast({
      title: `Scene Dispatched: ${label}`,
      description: `Transport: ${snapshot.activeTransport}`,
      tone: 'success',
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Context Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <SegmentedControl<'2d' | '3d'>
            ariaLabel="2D Grid or 3D Twin"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: '2d', label: '2D Grid', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
              { value: '3d', label: '3D Twin', icon: <Box className="h-3.5 w-3.5" /> },
            ]}
          />
          <PlanBadge entitlements={entitlements} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {viewMode === '2d' && (
            <>
              <Button
                variant={customizeLayout ? 'accent' : 'secondary'}
                size="sm"
                onClick={() => setCustomizeLayout((c) => !c)}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>{customizeLayout ? 'Done Customizing' : 'Customize Layout'}</span>
              </Button>
              {customizeLayout && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetWorkspacePreferences();
                    pushToast({ title: 'Dashboard Layout Reset', tone: 'info' });
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </Button>
              )}
            </>
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

      {/* Collapsible Energy & Water Summary Widgets */}
      <CollapsibleSection
        sectionId="home_energy_water_summary"
        title="Energy & Water Summary"
        subtitle={`Live Load ${totalWatts.toFixed(0)} W · Overhead Tank ${waterLevel}% · Tariff ₹7.50/kWh`}
        icon={<Zap className="h-3.5 w-3.5" />}
        badge={<Badge variant="mono">LIVE NVS</Badge>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 dd-grid-gap">
          <WidgetSizeFrame widgetId="summary_power" showSizeControls={customizeLayout}>
            <Card className="h-full space-y-1">
              <div className="flex items-center justify-between text-[11px] text-foreground-muted">
                <span>Live Home Load</span>
                <Zap className="h-3.5 w-3.5 text-accent" />
              </div>
              <div className="text-xl font-semibold font-mono tabular-nums text-foreground">
                {totalWatts.toFixed(0)} <span className="text-xs font-normal text-foreground-muted">W</span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-foreground-secondary">
                {totalKwh.toFixed(2)} kWh · ₹{(totalKwh * 7.5).toFixed(1)}
              </div>
            </Card>
          </WidgetSizeFrame>

          <WidgetSizeFrame widgetId="summary_water" showSizeControls={customizeLayout}>
            <Card className="h-full space-y-1">
              <div className="flex items-center justify-between text-[11px] text-foreground-muted">
                <span>Overhead Tank (WAT-01)</span>
                <Droplets className="h-3.5 w-3.5 text-accent" />
              </div>
              <div className="text-xl font-semibold font-mono tabular-nums text-foreground">
                {waterLevel}%
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-foreground-secondary">
                <span>{waterDepthCm} cm · {(watTel?.flow_lpm ?? 0).toFixed(1)} L/m</span>
                {tankLinkLost && <Badge variant="danger">LINK LOST</Badge>}
              </div>
            </Card>
          </WidgetSizeFrame>

          <WidgetSizeFrame widgetId="summary_modules" showSizeControls={customizeLayout}>
            <Card className="h-full space-y-1">
              <div className="flex items-center justify-between text-[11px] text-foreground-muted">
                <span>Active Modules</span>
                <Cpu className="h-3.5 w-3.5 text-accent" />
              </div>
              <div className="text-xl font-semibold font-mono tabular-nums text-foreground">
                {devicesList.filter((d) => d.status === 'online').length} / {devicesList.length}
              </div>
              <div className="text-[11px] font-mono text-foreground-secondary">
                Transport: {snapshot.activeTransport}
              </div>
            </Card>
          </WidgetSizeFrame>

          <WidgetSizeFrame widgetId="summary_guard" showSizeControls={customizeLayout}>
            <Card className="h-full space-y-1">
              <div className="flex items-center justify-between text-[11px] text-foreground-muted">
                <span>Safety &amp; Core Floor</span>
                <Activity className="h-3.5 w-3.5 text-success" />
              </div>
              <div className="text-xl font-semibold font-mono tabular-nums text-foreground">
                G1–G18
              </div>
              <div className="text-[11px] font-mono text-success">
                Contract v1.4 · Local Ready
              </div>
            </Card>
          </WidgetSizeFrame>
        </div>
      </CollapsibleSection>

      {/* Collapsible Quick Scenes Strip */}
      <CollapsibleSection
        sectionId="home_quick_recipes"
        title="Quick Scenes & 1-Tap Indian Recipes"
        subtitle="Deterministic local-first actions (works offline over Hub/LAN)"
        icon={<Play className="h-3.5 w-3.5" />}
        badge={<Badge variant="mono">OFFLINE READY</Badge>}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { id: 'inverter_saver', label: 'Inverter Saver', sub: 'Cut 25A Geyser Load' },
            { id: 'geyser_morning', label: 'Morning Geyser', sub: 'Auto 45m Cutoff (G8)' },
            { id: 'tank_fill', label: 'Fill Overhead Tank', sub: 'Dry-run Guard Active' },
            { id: 'porch_lights', label: 'Toggle Porch Light', sub: 'PWR-01 Channel 3' },
          ].map((rec) => (
            <button
              key={rec.id}
              type="button"
              onClick={() => triggerRecipe(rec.id, rec.label)}
              className="min-h-[44px] flex flex-col items-start justify-center rounded-[var(--dd-radius-control)] border border-border bg-surface-elevated hover:border-accent-border px-3 py-2 text-left transition-colors cursor-pointer"
            >
              <span className="text-xs font-medium text-foreground">{rec.label}</span>
              <span className="text-[11px] text-foreground-muted">{rec.sub}</span>
            </button>
          ))}
        </div>
      </CollapsibleSection>

      {/* Main 2D Grid or 3D Twin Stage */}
      {viewMode === '3d' ? (
        <FullscreenStage
          title="3D Home Digital Twin"
          subtitle="Interactive Three.js Spatial View · Switch back to 2D Grid anytime for Eco mode"
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
          {/* Room Tabs: scrollable pills on mobile, searchable dropdown + pills on desktop */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 dd-scroll flex-1">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRoom(r.id)}
                  className={`px-3 h-8 rounded-full border text-xs font-medium whitespace-nowrap transition-colors cursor-pointer tabular-nums ${
                    selectedRoom === r.id
                      ? 'bg-accent-soft text-accent border-accent-border'
                      : 'bg-surface border-border text-foreground-secondary hover:text-foreground'
                  }`}
                >
                  {r.label} <span className="font-mono text-[10px] opacity-75">{r.count}</span>
                </button>
              ))}
            </div>

            <div className="hidden lg:block w-52 shrink-0">
              <Dropdown
                searchable
                ariaLabel="Filter room"
                value={selectedRoom}
                onChange={setSelectedRoom}
                options={rooms.map((r) => ({
                  value: r.id,
                  label: r.label,
                  badge: String(r.count),
                }))}
              />
            </div>
          </div>

          {/* Collapsible Room Sections with Draggable Device Cards */}
          <div className="space-y-4">
            {visibleRoomGroups.map((group) => (
              <CollapsibleSection
                key={group.roomId}
                sectionId={`room_section_${group.roomId}`}
                title={group.label}
                subtitle={`${group.devices.length} module${group.devices.length === 1 ? '' : 's'}`}
                badge={<Badge variant="mono">{group.roomId}</Badge>}
              >
                <DraggableList
                  listId={`room_order_${group.roomId}`}
                  items={group.devices.map((d) => ({ id: d.device_id, label: d.name, device: d }))}
                  className="grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                  renderItem={(entry, dragHandle) => (
                    <WidgetSizeFrame
                      widgetId={`widget_${entry.id}`}
                      showSizeControls={customizeLayout}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 px-0.5">
                          {customizeLayout ? (
                            dragHandle
                          ) : (
                            <span className="text-[10px] font-mono text-foreground-muted">
                              {entry.device.device_id}
                            </span>
                          )}
                          <Link
                            href={
                              entry.device.module_code === 'VEH-01'
                                ? `/vehicles/${entry.device.device_id}`
                                : `/devices/${entry.device.device_id}`
                            }
                            className="inline-flex items-center gap-0.5 text-[11px] font-mono text-foreground-muted hover:text-accent transition-colors"
                          >
                            <span>Full Control</span>
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        </div>

                        <DynamicCapabilityCard
                          device={entry.device}
                          hasPlusHistory={entitlements.effectiveTier !== 'core'}
                          connectedHubMembers={
                            entry.device.module_code === 'HUB-01' ? hubMembers : undefined
                          }
                          onSendCommand={(deviceId, set) =>
                            simulatorEngine.sendCommand(deviceId, set, 'pwa_cloud')
                          }
                          onTriggerCrash={() => simulatorEngine.triggerVehicleCrash()}
                          onInspect={openInspectorFor}
                          onOpenLocalAccess={(deviceId) => openInspectorFor(deviceId)}
                        />
                      </div>
                    </WidgetSizeFrame>
                  )}
                />
              </CollapsibleSection>
            ))}
          </div>
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
        onTestScene={(scene) => triggerRecipe(scene, scene)}
      />
    </div>
  );
}
