'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  Droplets,
  EyeOff,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
  Redo2,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PowerTelemetryPayload,
  VehicleTelemetryPayload,
  WaterTelemetryPayload,
} from '@/lib/protocol/contract';
import { DynamicCapabilityCard } from '@/components/capabilities/DynamicCapabilityCard';
import { simulatorEngine } from '@/lib/simulator/engine';
import { Badge, Button, EmptyState, triggerHaptic, useToast } from '@/components/ui';
import { CollapsibleSection } from './CollapsibleSection';
import {
  Layout2DGraph,
  LayoutContainer,
  LayoutItemSize,
  useWorkspace,
} from './WorkspaceProvider';
import { MONITOR_CATALOG, StandaloneMonitorWidget } from './StandaloneMonitors';

const SIZE_COL_CLASSES: Record<LayoutItemSize, string> = {
  S: 'col-span-1',
  M: 'col-span-1',
  L: 'col-span-1 md:col-span-2',
  Full: 'col-span-1 md:col-span-2 xl:col-span-3',
};

const SIZE_ORDER: LayoutItemSize[] = ['S', 'M', 'L', 'Full'];

export interface UniversalLayoutStudioProps {
  selectedRoomFilter: string;
  hasPlusHistory: boolean;
  onInspectDevice: (deviceId: string) => void;
}

export const UniversalLayoutStudio: React.FC<UniversalLayoutStudioProps> = ({
  selectedRoomFilter,
  hasPlusHistory,
  onInspectDevice,
}) => {
  const {
    prefs,
    snapshot,
    editLayoutMode,
    setEditLayoutMode,
    setLayout2D,
    resetLayout2D,
    isSectionCollapsed,
    toggleSectionCollapsed,
  } = useWorkspace();
  const { pushToast } = useToast();

  const layout = prefs.layout2D;
  const isOwner = prefs.userRole === 'OWNER';

  const [historyPast, setHistoryPast] = useState<Layout2DGraph[]>([]);
  const [historyFuture, setHistoryFuture] = useState<Layout2DGraph[]>([]);
  const [draggedItem, setDraggedItem] = useState<{ itemId: string; fromContainerId: string } | null>(null);
  const [dragOverContainerId, setDragOverContainerId] = useState<string | null>(null);
  const [moveMenuForItem, setMoveMenuForItem] = useState<{ itemId: string; fromContainerId: string } | null>(null);
  const [containerMenuId, setContainerMenuId] = useState<string | null>(null);
  const [widgetCatalogOpen, setWidgetCatalogOpen] = useState(false);
  const [newContainerTitle, setNewContainerTitle] = useState('');
  const [renamingContainerId, setRenamingContainerId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const devicesList = Object.values(snapshot.devices);
  const hubMembers = devicesList
    .filter((d) => d.module_code !== 'HUB-01')
    .map((d) => ({
      device_id: d.device_id,
      name: d.name,
      module_code: d.module_code,
      via: d.state.via,
    }));

  // Compute live KPI summary for the compact collapsible horizontal KPI strip
  const totalWatts = devicesList.reduce((acc, d) => {
    if (d.module_code.startsWith('PWR')) {
      return acc + ((d.telemetry as PowerTelemetryPayload)?.p ?? 0);
    }
    return acc;
  }, 0);
  const totalKwh = devicesList.reduce((acc, d) => {
    if (d.module_code.startsWith('PWR')) {
      return acc + ((d.telemetry as PowerTelemetryPayload)?.kwh ?? 0);
    }
    return acc;
  }, 0);
  const estTodayInr = ((totalKwh * 0.14) * prefs.tariffInr).toFixed(0);

  const watDevice = devicesList.find((d) => d.module_code === 'WAT-01');
  const watTel = (watDevice?.telemetry as WaterTelemetryPayload | undefined) ?? null;
  const hubDevice = devicesList.find((d) => d.module_code === 'HUB-01');
  const vehDevice = devicesList.find((d) => d.module_code === 'VEH-01');
  const vehTel = (vehDevice?.telemetry as VehicleTelemetryPayload | undefined) ?? null;

  const kpiCollapsed = isSectionCollapsed('home_compact_kpi_strip', false);

  const triggerQuickScene = (sceneId: 'morning' | 'away_eco' | 'monsoon' | 'all_off') => {
    triggerHaptic('tap', prefs.hapticsEnabled);
    if (sceneId === 'morning') {
      simulatorEngine.sendCommand('dd_pwr01_a1b2c3', { ch1: true, ch2: true }, 'pwa_cloud');
      simulatorEngine.sendCommand('dd_pwr03_g7h8j9', { ch1: true }, 'pwa_cloud');
    } else if (sceneId === 'away_eco') {
      simulatorEngine.sendCommand('dd_pwr01_a1b2c3', { ch1: false, ch2: false, ch3: false, ch4: false }, 'pwa_cloud');
      simulatorEngine.sendCommand('dd_pwr02_d4e5f6', { fan_speed: 0, dimmer_pct: 0 }, 'pwa_cloud');
      simulatorEngine.sendCommand('dd_pwr03_g7h8j9', { ch1: false }, 'pwa_cloud');
    } else if (sceneId === 'monsoon') {
      simulatorEngine.sendCommand('dd_pwr01_a1b2c3', { ch1: true, ch3: true }, 'pwa_cloud');
      simulatorEngine.sendCommand('dd_pwr02_d4e5f6', { fan_speed: 2, dimmer_pct: 60 }, 'pwa_cloud');
    } else if (sceneId === 'all_off') {
      for (const dev of devicesList) {
        if (dev.module_code === 'PWR-01') {
          simulatorEngine.sendCommand(dev.device_id, { ch1: false, ch2: false, ch3: false, ch4: false }, 'pwa_cloud');
        } else if (dev.module_code === 'PWR-02') {
          simulatorEngine.sendCommand(dev.device_id, { fan_speed: 0, dimmer_pct: 0 }, 'pwa_cloud');
        } else if (dev.module_code === 'PWR-03') {
          simulatorEngine.sendCommand(dev.device_id, { ch1: false }, 'pwa_cloud');
        }
      }
    }
    pushToast({
      title: `Scene Activated: ${sceneId.replace('_', ' ').toUpperCase()}`,
      tone: 'success',
    });
  };

  const commitLayout = (next: Layout2DGraph, announcement?: string) => {
    setHistoryPast((prev) => [...prev.slice(-19), layout]);
    setHistoryFuture([]);
    setLayout2D(next);
    if (announcement) setLiveAnnouncement(announcement);
  };

  const handleUndo = () => {
    if (historyPast.length === 0) return;
    const prev = historyPast[historyPast.length - 1];
    setHistoryPast((p) => p.slice(0, -1));
    setHistoryFuture((f) => [layout, ...f]);
    setLayout2D(prev);
    triggerHaptic('step', prefs.hapticsEnabled);
    setLiveAnnouncement('Layout change undone.');
  };

  const handleRedo = () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryFuture((f) => f.slice(1));
    setHistoryPast((p) => [...p, layout]);
    setLayout2D(next);
    triggerHaptic('step', prefs.hapticsEnabled);
    setLiveAnnouncement('Layout change redone.');
  };

  const moveItemToContainer = (
    itemId: string,
    fromContainerId: string,
    toContainerId: string,
    insertIndex?: number
  ) => {
    if (!itemId) return;
    const isDevice = Boolean(snapshot.devices[itemId]);
    const targetContainer = layout.containers.find((c) => c.id === toContainerId);
    if (!targetContainer) return;

    const nextContainers = layout.containers.map((c) => {
      const cleaned = c.itemIds.filter((id) => id !== itemId);
      if (c.id !== toContainerId) {
        return { ...c, itemIds: cleaned };
      }
      const nextIds = [...cleaned];
      if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= nextIds.length) {
        nextIds.splice(insertIndex, 0, itemId);
      } else {
        nextIds.push(itemId);
      }
      return { ...c, itemIds: nextIds };
    });

    let nextOverrides = layout.deviceRoomOverrides;
    if (isDevice && targetContainer.kind === 'room' && targetContainer.roomId) {
      if (isOwner) {
        nextOverrides = { ...layout.deviceRoomOverrides, [itemId]: targetContainer.roomId };
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ddoodle:device-room-sync', {
              detail: {
                homeId: prefs.activeHomeId,
                deviceId: itemId,
                roomId: targetContainer.roomId,
              },
            })
          );
        }
      } else {
        pushToast({
          title: 'Personal Layout Updated',
          description: 'Member role keeps shared home room_id unchanged.',
          tone: 'info',
        });
      }
    }

    triggerHaptic('drag', prefs.hapticsEnabled);
    commitLayout(
      {
        ...layout,
        containers: nextContainers,
        deviceRoomOverrides: nextOverrides,
      },
      `Moved ${snapshot.devices[itemId]?.name ?? itemId} to ${targetContainer.title}`
    );
    setMoveMenuForItem(null);
  };

  const moveContainerOrder = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= layout.containers.length) return;
    const next = [...layout.containers];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    triggerHaptic('step', prefs.hapticsEnabled);
    commitLayout({ ...layout, containers: next }, `Reordered ${removed.title}`);
  };

  const addCustomContainer = () => {
    const title = newContainerTitle.trim();
    if (!title) return;
    const id = `custom_${Date.now().toString(36)}`;
    const newContainer: LayoutContainer = {
      id,
      title,
      kind: 'custom',
      itemIds: [],
    };
    setNewContainerTitle('');
    triggerHaptic('tap', prefs.hapticsEnabled);
    commitLayout(
      { ...layout, containers: [newContainer, ...layout.containers] },
      `Created custom container ${title}`
    );
  };

  const deleteCustomContainer = (containerId: string) => {
    const target = layout.containers.find((c) => c.id === containerId);
    if (!target || target.kind !== 'custom') return;
    const remaining = layout.containers.filter((c) => c.id !== containerId);
    const fallbackId = remaining[0]?.id;
    const reassigned = remaining.map((c) =>
      c.id === fallbackId ? { ...c, itemIds: [...c.itemIds, ...target.itemIds] } : c
    );
    commitLayout({ ...layout, containers: reassigned }, `Deleted container ${target.title}`);
  };

  const setItemSize = (itemId: string, size: LayoutItemSize) => {
    triggerHaptic('step', prefs.hapticsEnabled);
    commitLayout({
      ...layout,
      itemSizes: { ...layout.itemSizes, [itemId]: size },
    });
  };

  const toggleHideMonitor = (itemId: string) => {
    const isHidden = layout.hiddenItems.includes(itemId);
    if (isHidden) {
      const nextHidden = layout.hiddenItems.filter((id) => id !== itemId);
      const firstContainer = layout.containers[0];
      const alreadyPlaced = layout.containers.some((c) => c.itemIds.includes(itemId));
      const nextContainers = alreadyPlaced
        ? layout.containers
        : layout.containers.map((c) =>
            c.id === firstContainer?.id ? { ...c, itemIds: [...c.itemIds, itemId] } : c
          );
      commitLayout({ ...layout, hiddenItems: nextHidden, containers: nextContainers });
    } else {
      commitLayout({ ...layout, hiddenItems: [...layout.hiddenItems, itemId] });
    }
  };

  const visibleContainers = layout.containers.filter((c) => {
    if (selectedRoomFilter === 'all') return true;
    return c.roomId === selectedRoomFilter || c.id === selectedRoomFilter;
  });

  return (
    <div className="space-y-3">
      {/* Screen reader live announcement for layout moves */}
      <div className="sr-only" aria-live="polite">
        {liveAnnouncement}
      </div>

      {/* Floating Animated Edit Mode Toolbar */}
      <AnimatePresence>
        {editLayoutMode && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="sticky top-14 z-20 rounded-2xl border border-accent-border bg-surface/95 backdrop-blur-md p-3 shadow-xl space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="accent">CUSTOMIZE LAYOUT</Badge>
                <span className="text-xs text-foreground-secondary">
                  {isOwner
                    ? 'Owner mode: room moves sync device room_id.'
                    : 'Member mode: personal layout_2d only.'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={historyPast.length === 0}
                  onClick={handleUndo}
                  title="Undo layout change"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span>Undo</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={historyFuture.length === 0}
                  onClick={handleRedo}
                  title="Redo layout change"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                  <span>Redo</span>
                </Button>
                <Button
                  variant={widgetCatalogOpen ? 'accent' : 'secondary'}
                  size="sm"
                  onClick={() => setWidgetCatalogOpen((o) => !o)}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Widgets</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetLayout2D();
                    setHistoryPast([]);
                    setHistoryFuture([]);
                    pushToast({ title: 'Dashboard Layout Reset to Default', tone: 'info' });
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setEditLayoutMode(false)}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Done</span>
                </Button>
              </div>
            </div>

            {/* + Add Container Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t hairline-border">
              <input
                type="text"
                value={newContainerTitle}
                onChange={(e) => setNewContainerTitle(e.target.value)}
                placeholder="New room or zone name (e.g. Favorites, Upstairs)..."
                className="flex-1 min-w-[180px] h-8 rounded-lg border border-border bg-surface-elevated px-2.5 text-xs text-foreground focus:outline-none focus:border-accent"
              />
              <Button variant="secondary" size="sm" onClick={addCustomContainer}>
                <FolderPlus className="h-3.5 w-3.5" />
                <span>+ Add Zone</span>
              </Button>
            </div>

            {/* + Widget Catalog */}
            {widgetCatalogOpen && (
              <div className="pt-2 border-t hairline-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {MONITOR_CATALOG.map((mon) => {
                  const visible = !layout.hiddenItems.includes(mon.id);
                  return (
                    <button
                      key={mon.id}
                      type="button"
                      onClick={() => toggleHideMonitor(mon.id)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer',
                        visible
                          ? 'border-accent-border bg-accent-soft text-foreground'
                          : 'border-border bg-surface-elevated text-foreground-secondary'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{mon.title}</div>
                        <div className="text-[10px] text-foreground-muted truncate">{mon.category}</div>
                      </div>
                      <Badge variant={visible ? 'accent' : 'neutral'}>
                        {visible ? 'Shown' : 'Hidden'}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Containers & Rooms */}
      <div className="space-y-3">
        {visibleContainers.map((container, containerIdx) => {
          const activeItemIds = container.itemIds.filter(
            (id) => !layout.hiddenItems.includes(id)
          );
          const isDropTarget = dragOverContainerId === container.id;

          // PHASE 8 DECLUTTER: When rendering the default `zone_monitors` ("Telemetry & Quick Scenes")
          // in normal mode (not editLayoutMode) and it only contains monitor widgets, render it as a
          // ultra-compact collapsible horizontal KPI strip (<= 96px expanded, <= 38px collapsed)
          // so actual Room Switches & Fans appear immediately above the fold on 360px–430px phones!
          const isPureMonitorZone =
            container.id === 'zone_monitors' &&
            !editLayoutMode &&
            activeItemIds.every((id) => !snapshot.devices[id]);

          if (isPureMonitorZone) {
            return (
              <section
                key={container.id}
                className="rounded-2xl border hairline-border bg-surface/65 overflow-hidden"
              >
                {/* Ultra-Slim 38px Header Bar */}
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-surface-elevated/40">
                  <button
                    type="button"
                    onClick={() => toggleSectionCollapsed('home_compact_kpi_strip', false)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left text-xs cursor-pointer"
                  >
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 text-foreground-muted transition-transform duration-150',
                        kpiCollapsed && '-rotate-90'
                      )}
                    />
                    <span className="font-semibold text-foreground">Live Home Pulse &amp; Scenes</span>
                    <span className="text-[11px] font-mono text-foreground-muted tabular-nums truncate">
                      · {totalWatts.toFixed(0)}W · Tank {watTel?.level_pct ?? 68}% · ₹{estTodayInr} today
                    </span>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    {(['morning', 'away_eco', 'monsoon', 'all_off'] as const).map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => triggerQuickScene(sc)}
                        className="hidden sm:inline-flex h-6 items-center rounded-md border border-border/70 bg-surface px-2 text-[10px] font-medium text-foreground-secondary hover:text-accent hover:border-accent-border transition-colors cursor-pointer"
                      >
                        {sc === 'morning'
                          ? 'Morning'
                          : sc === 'away_eco'
                          ? 'Away Eco'
                          : sc === 'monsoon'
                          ? 'Monsoon'
                          : 'All Off'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compact Horizontal Snap-Scrolling KPI + Quick Scene Strip (<= 72px height) */}
                {!kpiCollapsed && (
                  <div className="px-2.5 py-2 border-t hairline-border snap-strip gap-2 items-stretch">
                    {/* Tile 1: Live Power & INR */}
                    <div className="snap-start shrink-0 flex items-center gap-2.5 rounded-xl border hairline-border bg-surface px-3 py-1.5 min-w-[162px]">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                        <Zap className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-mono text-foreground-muted">POWER · TODAY</div>
                        <div className="text-xs font-semibold font-mono text-foreground tabular-nums">
                          {totalWatts.toFixed(0)} W · <span className="text-accent">₹{estTodayInr}</span>
                        </div>
                      </div>
                    </div>

                    {/* Tile 2: Overhead Tank Level */}
                    {watDevice && watTel && (
                      <Link
                        href={`/devices/${watDevice.device_id}`}
                        className="snap-start shrink-0 flex items-center gap-2.5 rounded-xl border hairline-border bg-surface px-3 py-1.5 min-w-[155px] hover:border-border-strong transition-colors"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                          <Droplets className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono text-foreground-muted">
                            TANK · {watTel.pump ? 'PUMP ON' : 'IDLE'}
                          </div>
                          <div className="text-xs font-semibold font-mono text-foreground tabular-nums">
                            {watTel.level_pct}% ({watTel.level_cm} cm)
                          </div>
                        </div>
                      </Link>
                    )}

                    {/* Tile 3: Vehicle Safety Status */}
                    {vehDevice && vehTel && (
                      <Link
                        href="/vehicles"
                        className="snap-start shrink-0 flex items-center gap-2.5 rounded-xl border hairline-border bg-surface px-3 py-1.5 min-w-[160px] hover:border-border-strong transition-colors"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                          <Car className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono text-foreground-muted">
                            CRETA · {vehTel.ignition ? 'MOVING' : 'PARKED'}
                          </div>
                          <div className="text-xs font-semibold font-mono text-foreground tabular-nums">
                            {vehTel.speed_kmh.toFixed(0)} km/h · {vehTel.ext_v.toFixed(1)}V
                          </div>
                        </div>
                      </Link>
                    )}

                    {/* Tile 4: Local Hub & Link Health */}
                    {hubDevice && (
                      <Link
                        href={`/devices/${hubDevice.device_id}`}
                        className="snap-start shrink-0 flex items-center gap-2.5 rounded-xl border hairline-border bg-surface px-3 py-1.5 min-w-[150px] hover:border-border-strong transition-colors"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                          <Radio className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono text-foreground-muted">LOCAL HUB-01</div>
                          <div className="text-xs font-semibold font-mono text-foreground tabular-nums">
                            {devicesList.length} Nodes · {hubDevice.state.rssi} dBm
                          </div>
                        </div>
                      </Link>
                    )}

                    {/* Tile 5: Mobile 1-Tap Quick Scenes */}
                    <div className="snap-start shrink-0 flex items-center gap-1 rounded-xl border hairline-border bg-surface px-2.5 py-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-accent mr-1 shrink-0" />
                      {(['morning', 'away_eco', 'monsoon', 'all_off'] as const).map((sc) => (
                        <button
                          key={sc}
                          type="button"
                          onClick={() => triggerQuickScene(sc)}
                          className="h-7 rounded-lg border border-border/70 bg-surface-elevated px-2 text-[11px] font-medium text-foreground hover:border-accent-border hover:text-accent transition-colors whitespace-nowrap cursor-pointer"
                        >
                          {sc === 'morning'
                            ? 'Morning'
                            : sc === 'away_eco'
                            ? 'Away'
                            : sc === 'monsoon'
                            ? 'Monsoon'
                            : 'All Off'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          }

          return (
            <div
              key={container.id}
              onDragOver={(e) => {
                if (!editLayoutMode) return;
                e.preventDefault();
                if (dragOverContainerId !== container.id) {
                  setDragOverContainerId(container.id);
                }
              }}
              onDragLeave={() => {
                if (dragOverContainerId === container.id) {
                  setDragOverContainerId(null);
                }
              }}
              onDrop={(e) => {
                if (!editLayoutMode) return;
                e.preventDefault();
                setDragOverContainerId(null);
                const payload =
                  draggedItem ??
                  (() => {
                    try {
                      return JSON.parse(e.dataTransfer.getData('application/json')) as {
                        itemId: string;
                        fromContainerId: string;
                      };
                    } catch {
                      return null;
                    }
                  })();
                if (payload) {
                  moveItemToContainer(payload.itemId, payload.fromContainerId, container.id);
                }
                setDraggedItem(null);
              }}
              className={cn(
                'rounded-2xl transition-all duration-150',
                isDropTarget && 'ring-2 ring-accent bg-accent-soft/20'
              )}
            >
              <CollapsibleSection
                sectionId={`layout_container_${container.id}`}
                title={container.title}
                subtitle={`${activeItemIds.length} device${activeItemIds.length === 1 ? '' : 's'}`}
                actions={
                  <div className="relative flex items-center gap-1">
                    {editLayoutMode ? (
                      <>
                        <button
                          type="button"
                          disabled={containerIdx === 0}
                          aria-label={`Move ${container.title} up`}
                          onClick={() => moveContainerOrder(containerIdx, -1)}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-border bg-surface text-foreground-muted hover:text-foreground disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={containerIdx === layout.containers.length - 1}
                          aria-label={`Move ${container.title} down`}
                          onClick={() => moveContainerOrder(containerIdx, 1)}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-border bg-surface text-foreground-muted hover:text-foreground disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        {container.kind === 'custom' && (
                          <>
                            <button
                              type="button"
                              aria-label={`Rename ${container.title}`}
                              onClick={() => {
                                setRenamingContainerId(container.id);
                                setRenameDraft(container.title);
                              }}
                              className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-border bg-surface text-foreground-muted hover:text-foreground cursor-pointer"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${container.title}`}
                              onClick={() => deleteCustomContainer(container.id)}
                              className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-border bg-surface text-danger hover:bg-danger-soft cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      /* Clean subtle `...` overflow menu per room header */
                      <div className="relative">
                        <button
                          type="button"
                          aria-label={`Options for ${container.title}`}
                          onClick={() =>
                            setContainerMenuId((cur) =>
                              cur === container.id ? null : container.id
                            )
                          }
                          className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors cursor-pointer"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                        {containerMenuId === container.id && (
                          <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-border bg-surface shadow-xl p-1 z-30 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                moveContainerOrder(containerIdx, -1);
                                setContainerMenuId(null);
                              }}
                              disabled={containerIdx === 0}
                              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-surface-elevated disabled:opacity-40 cursor-pointer"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                              <span>Move Section Up</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                moveContainerOrder(containerIdx, 1);
                                setContainerMenuId(null);
                              }}
                              disabled={containerIdx === layout.containers.length - 1}
                              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-surface-elevated disabled:opacity-40 cursor-pointer"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                              <span>Move Section Down</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditLayoutMode(true);
                                setContainerMenuId(null);
                              }}
                              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-accent hover:bg-surface-elevated cursor-pointer"
                            >
                              <LayoutGrid className="h-3.5 w-3.5" />
                              <span>Customize Layout</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                }
              >
                {renamingContainerId === container.id && (
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      className="flex-1 h-8 rounded-lg border border-border bg-surface-elevated px-2.5 text-xs text-foreground"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        if (renameDraft.trim()) {
                          commitLayout({
                            ...layout,
                            containers: layout.containers.map((c) =>
                              c.id === container.id ? { ...c, title: renameDraft.trim() } : c
                            ),
                          });
                        }
                        setRenamingContainerId(null);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                )}

                {activeItemIds.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Plus className="h-4 w-4" />}
                    title="Empty Room Container"
                    description={
                      editLayoutMode
                        ? 'Drag a card from another room or use "Move to..." on any item.'
                        : 'Tap "..." -> Customize Layout to organize devices here.'
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {activeItemIds.map((itemId, itemIdx) => {
                      const device = snapshot.devices[itemId];
                      const isMonitor = !device;
                      const size: LayoutItemSize =
                        layout.itemSizes[itemId] ?? (itemId === 'mon_scenes' ? 'Full' : 'M');

                      return (
                        <motion.div
                          key={itemId}
                          layout={prefs.motionMode !== 'eco'}
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          draggable={editLayoutMode}
                          onDragStart={(e) => {
                            if (!editLayoutMode) return;
                            const dragEv = e as unknown as React.DragEvent<HTMLDivElement>;
                            setDraggedItem({ itemId, fromContainerId: container.id });
                            triggerHaptic('drag', prefs.hapticsEnabled);
                            if (dragEv.dataTransfer) {
                              dragEv.dataTransfer.effectAllowed = 'move';
                              dragEv.dataTransfer.setData(
                                'application/json',
                                JSON.stringify({ itemId, fromContainerId: container.id })
                              );
                            }
                          }}
                          onDragOver={(e) => {
                            if (!editLayoutMode) return;
                            e.preventDefault();
                          }}
                          onDrop={(e) => {
                            if (!editLayoutMode) return;
                            e.preventDefault();
                            e.stopPropagation();
                            if (draggedItem && draggedItem.itemId !== itemId) {
                              moveItemToContainer(
                                draggedItem.itemId,
                                draggedItem.fromContainerId,
                                container.id,
                                itemIdx
                              );
                            }
                            setDraggedItem(null);
                            setDragOverContainerId(null);
                          }}
                          onDragEnd={() => {
                            setDraggedItem(null);
                            setDragOverContainerId(null);
                          }}
                          className={cn(
                            'relative rounded-2xl',
                            SIZE_COL_CLASSES[size],
                            editLayoutMode && 'ring-1 ring-border-strong/70 p-1.5 bg-surface-elevated/40',
                            draggedItem?.itemId === itemId && 'opacity-50'
                          )}
                        >
                          {/* Edit Mode Item Header Bar */}
                          {editLayoutMode && (
                            <div className="flex flex-wrap items-center justify-between gap-1 px-1 pb-1.5">
                              <div className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground-muted">
                                <GripVertical className="h-3.5 w-3.5 cursor-grab text-accent" />
                                <span className="truncate max-w-[110px]">
                                  {device ? device.module_code : 'WIDGET'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                {/* Resize S / M / L / Full */}
                                <div className="inline-flex rounded border border-border bg-surface p-0.5">
                                  {SIZE_ORDER.map((sz) => (
                                    <button
                                      key={sz}
                                      type="button"
                                      onClick={() => setItemSize(itemId, sz)}
                                      className={cn(
                                        'px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer',
                                        size === sz
                                          ? 'bg-accent text-[var(--dd-accent-fg)] font-bold'
                                          : 'text-foreground-muted hover:text-foreground'
                                      )}
                                    >
                                      {sz}
                                    </button>
                                  ))}
                                </div>

                                {/* 1-Tap Move To... Menu */}
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMoveMenuForItem((cur) =>
                                        cur?.itemId === itemId
                                          ? null
                                          : { itemId, fromContainerId: container.id }
                                      )
                                    }
                                    className="inline-flex items-center gap-1 h-6 px-2 rounded border border-border bg-surface text-[10px] font-mono text-foreground-secondary hover:text-accent cursor-pointer"
                                  >
                                    <ArrowRightLeft className="h-2.5 w-2.5" />
                                    <span>Move</span>
                                  </button>

                                  {moveMenuForItem?.itemId === itemId && (
                                    <div className="absolute right-0 mt-1 w-48 rounded-xl border border-border-strong bg-surface p-1 shadow-xl z-40">
                                      {layout.containers.map((dest) => (
                                        <button
                                          key={dest.id}
                                          type="button"
                                          disabled={dest.id === container.id}
                                          onClick={() =>
                                            moveItemToContainer(itemId, container.id, dest.id)
                                          }
                                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-foreground hover:bg-surface-muted disabled:opacity-40 cursor-pointer truncate"
                                        >
                                          {dest.title}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {isMonitor && (
                                  <button
                                    type="button"
                                    title="Hide widget"
                                    aria-label="Hide widget"
                                    onClick={() => toggleHideMonitor(itemId)}
                                    className="h-6 w-6 inline-flex items-center justify-center rounded border border-border bg-surface text-foreground-muted hover:text-danger cursor-pointer"
                                  >
                                    <EyeOff className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Item Card Renderer (Clean — no duplicate raw device_id banner above card) */}
                          {device ? (
                            <DynamicCapabilityCard
                              device={device}
                              tariffInr={prefs.tariffInr}
                              hasPlusHistory={hasPlusHistory}
                              connectedHubMembers={
                                device.module_code === 'HUB-01' ? hubMembers : undefined
                              }
                              onSendCommand={(deviceId, set) =>
                                simulatorEngine.sendCommand(deviceId, set, 'pwa_cloud')
                              }
                              onTriggerCrash={() => simulatorEngine.triggerVehicleCrash()}
                              onInspect={onInspectDevice}
                              onOpenLocalAccess={(deviceId) => onInspectDevice(deviceId)}
                            />
                          ) : (
                            <StandaloneMonitorWidget monitorId={itemId} />
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </CollapsibleSection>
            </div>
          );
        })}
      </div>
    </div>
  );
};
