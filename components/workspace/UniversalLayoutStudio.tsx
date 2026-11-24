'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CornerDownRight,
  Droplets,
  Eye,
  EyeOff,
  FolderPlus,
  GripVertical,
  Layers,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
  Redo2,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PowerTelemetryPayload,
  VehicleTelemetryPayload,
  WaterTelemetryPayload,
} from '@/lib/protocol/contract';
import {
  addContainerToTree,
  canMoveContainerInto,
  collectAllWidgetIds,
  countVisibleWidgetsInSubtree,
  deleteCustomContainerFromTree,
  findContainerById,
  flattenContainersWithMeta,
  getDisplayTitle,
  Layout2DGraph,
  LayoutItemSize,
  LayoutTreeContainerNode,
  LayoutTreeWidgetNode,
  MAX_NESTING_DEPTH,
  moveContainerInTree,
  moveWidgetInTree,
  reorderContainerAmongSiblings,
  withSyncedTree,
} from '@/lib/layout/tree';
import { DynamicCapabilityCard } from '@/components/capabilities/DynamicCapabilityCard';
import { simulatorEngine } from '@/lib/simulator/engine';
import { Badge, Button, EmptyState, ThemedSelect, triggerHaptic, useToast } from '@/components/ui';
import { useWorkspace } from './WorkspaceProvider';
import { MONITOR_CATALOG, StandaloneMonitorWidget } from './StandaloneMonitors';

const SIZE_COL_CLASSES: Record<LayoutItemSize, string> = {
  S: 'col-span-1',
  M: 'col-span-1',
  L: 'col-span-1 md:col-span-2',
  Full: 'col-span-1 md:col-span-2 xl:col-span-3',
};

const SIZE_ORDER: LayoutItemSize[] = ['S', 'M', 'L', 'Full'];

type DragPayload =
  | { kind: 'widget'; id: string; fromContainerId: string }
  | { kind: 'container'; id: string; fromParentId: string | null };

interface OpenMenuState {
  kind: 'widget' | 'container';
  id: string;
  showMovePicker: boolean;
}

interface RenameState {
  kind: 'widget' | 'container';
  id: string;
  defaultTitle: string;
}

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

  // Auto-minimizing toolbar state (Phase 9C #4)
  const [toolbarExpanded, setToolbarExpanded] = useState(true);
  const toolbarExpandedRef = useRef(true);
  const wasToolbarOpenBeforeDragRef = useRef(false);

  // Hidden & Widgets drawer inside Customize toolbar
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'hidden' | 'monitors' | 'devices'>('hidden');

  // Add zone form state
  const [newZoneTitle, setNewZoneTitle] = useState('');
  const [newZoneParentId, setNewZoneParentId] = useState<string>('__root__');

  // Drag-and-drop state (widgets AND whole containers)
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [dragOverContainerId, setDragOverContainerId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);

  // Single unified contextual [...] menu state + inline rename state
  const [openMenu, setOpenMenu] = useState<OpenMenuState | null>(null);
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // Keep toolbarExpandedRef fresh without causing effect loops
  useEffect(() => {
    toolbarExpandedRef.current = toolbarExpanded;
  }, [toolbarExpanded]);

  // Close open [...] contextual menus on outside click or Escape
  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-layout-menu="true"]')) return;
      setOpenMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  const handleDragStartCommon = useCallback((payload: DragPayload) => {
    setDragPayload(payload);
    setOpenMenu(null);
    if (toolbarExpandedRef.current) {
      wasToolbarOpenBeforeDragRef.current = true;
      setToolbarExpanded(false);
    } else {
      wasToolbarOpenBeforeDragRef.current = false;
    }
  }, []);

  const handleDragEndCommon = useCallback(() => {
    setDragPayload(null);
    setDragOverContainerId(null);
    setDragOverRoot(false);
    if (wasToolbarOpenBeforeDragRef.current) {
      setToolbarExpanded(true);
    }
    wasToolbarOpenBeforeDragRef.current = false;
  }, []);

  // Global dragend safety net in case user cancels drag via Escape or drops outside target
  useEffect(() => {
    if (!dragPayload) return;
    const onWindowDragEnd = () => {
      handleDragEndCommon();
    };
    window.addEventListener('dragend', onWindowDragEnd);
    return () => window.removeEventListener('dragend', onWindowDragEnd);
  }, [dragPayload, handleDragEndCommon]);

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

  // Flattened container list with hierarchy metadata for Move To... pickers & drawer
  const flatContainers = useMemo(
    () => flattenContainersWithMeta(layout.layout_tree, layout.customTitles),
    [layout.layout_tree, layout.customTitles]
  );

  const monitorTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of MONITOR_CATALOG) map[m.id] = m.title;
    return map;
  }, []);

  const getWidgetDefaultTitle = useCallback(
    (widgetId: string) => {
      const dev = snapshot.devices[widgetId];
      if (dev) return dev.name;
      return monitorTitleMap[widgetId] ?? widgetId;
    },
    [snapshot.devices, monitorTitleMap]
  );

  const getWidgetDisplayTitle = useCallback(
    (widgetId: string) =>
      getDisplayTitle(layout.customTitles, widgetId, getWidgetDefaultTitle(widgetId)),
    [layout.customTitles, getWidgetDefaultTitle]
  );

  const getContainerDisplayTitle = useCallback(
    (container: LayoutTreeContainerNode) =>
      getDisplayTitle(layout.customTitles, container.id, container.title),
    [layout.customTitles]
  );

  // Compute live KPI summary for compact default monitor strip
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
  const estTodayInr = (totalKwh * 0.14 * prefs.tariffInr).toFixed(0);

  const watDevice = devicesList.find((d) => d.module_code === 'WAT-01');
  const watTel = (watDevice?.telemetry as WaterTelemetryPayload | undefined) ?? null;
  const hubDevice = devicesList.find((d) => d.module_code === 'HUB-01');
  const vehDevice = devicesList.find((d) => d.module_code === 'VEH-01');
  const vehTel = (vehDevice?.telemetry as VehicleTelemetryPayload | undefined) ?? null;
  const kpiCollapsed = isSectionCollapsed('home_compact_kpi_strip', false);

  const commitLayout = useCallback(
    (next: Layout2DGraph, announcement?: string) => {
      setHistoryPast((prev) => [...prev.slice(-19), layout]);
      setHistoryFuture([]);
      setLayout2D(next);
      if (announcement) setLiveAnnouncement(announcement);
    },
    [layout, setLayout2D]
  );

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

  const triggerQuickScene = (sceneId: 'morning' | 'away_eco' | 'monsoon' | 'all_off') => {
    triggerHaptic('tap', prefs.hapticsEnabled);
    if (sceneId === 'morning') {
      simulatorEngine.sendCommand('dd_pwr01_a1b2c3', { ch1: true, ch2: true }, 'pwa_cloud');
      simulatorEngine.sendCommand('dd_pwr03_g7h8i9', { ch1: true }, 'pwa_cloud');
    } else if (sceneId === 'away_eco') {
      simulatorEngine.sendCommand(
        'dd_pwr01_a1b2c3',
        { ch1: false, ch2: false, ch3: false, ch4: false },
        'pwa_cloud'
      );
      simulatorEngine.sendCommand('dd_pwr02_d4e5f6', { fan_speed: 0, dimmer_pct: 0 }, 'pwa_cloud');
      simulatorEngine.sendCommand('dd_pwr03_g7h8i9', { ch1: false }, 'pwa_cloud');
    } else if (sceneId === 'monsoon') {
      simulatorEngine.sendCommand('dd_pwr01_a1b2c3', { ch1: true, ch3: true }, 'pwa_cloud');
      simulatorEngine.sendCommand('dd_pwr02_d4e5f6', { fan_speed: 2, dimmer_pct: 60 }, 'pwa_cloud');
    } else if (sceneId === 'all_off') {
      for (const dev of devicesList) {
        if (dev.module_code === 'PWR-01') {
          simulatorEngine.sendCommand(
            dev.device_id,
            { ch1: false, ch2: false, ch3: false, ch4: false },
            'pwa_cloud'
          );
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

  // Move any individual widget/device into any container (preserving Owner room_id sync)
  const handleMoveWidget = (
    widgetId: string,
    targetContainerId: string,
    insertBeforeWidgetId?: string
  ) => {
    const targetContainer = findContainerById(layout.layout_tree, targetContainerId);
    if (!targetContainer) return;

    const nextTree = moveWidgetInTree(
      layout.layout_tree,
      widgetId,
      targetContainerId,
      insertBeforeWidgetId
    );
    const isHardwareDevice = Boolean(snapshot.devices[widgetId]);
    let nextOverrides = layout.deviceRoomOverrides;

    if (isHardwareDevice && targetContainer.kind === 'room' && targetContainer.roomId) {
      if (isOwner) {
        nextOverrides = { ...layout.deviceRoomOverrides, [widgetId]: targetContainer.roomId };
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ddoodle:device-room-sync', {
              detail: {
                homeId: prefs.activeHomeId,
                deviceId: widgetId,
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

    // Ensure destination container & widget are visible
    const nextHiddenItems = layout.hiddenItems.filter((id) => id !== widgetId);
    const nextHiddenContainers = layout.hiddenContainers.filter((id) => id !== targetContainerId);

    triggerHaptic('drag', prefs.hapticsEnabled);
    commitLayout(
      withSyncedTree(layout, nextTree, {
        deviceRoomOverrides: nextOverrides,
        hiddenItems: nextHiddenItems,
        hiddenContainers: nextHiddenContainers,
      }),
      `Moved ${getWidgetDisplayTitle(widgetId)} to ${getContainerDisplayTitle(targetContainer)}`
    );
    setOpenMenu(null);
  };

  // Move an entire container (with all its widgets & child containers) into another container or Root Level
  const handleMoveContainer = (
    containerId: string,
    targetParentId: string | null,
    insertIndex?: number
  ) => {
    const check = canMoveContainerInto(layout.layout_tree, containerId, targetParentId);
    if (!check.allowed) {
      pushToast({
        title: 'Cannot Move Container Here',
        description: check.reason ?? 'Invalid container nesting target.',
        tone: 'warning',
      });
      return;
    }

    const dragged = findContainerById(layout.layout_tree, containerId);
    if (!dragged) return;
    const nextTree = moveContainerInTree(layout.layout_tree, containerId, targetParentId, insertIndex);
    const targetName =
      targetParentId === null
        ? 'Root Level'
        : getContainerDisplayTitle(
            findContainerById(layout.layout_tree, targetParentId) ?? dragged
          );

    triggerHaptic('drag', prefs.hapticsEnabled);
    commitLayout(
      withSyncedTree(layout, nextTree),
      `Moved ${getContainerDisplayTitle(dragged)} into ${targetName}`
    );
    setOpenMenu(null);
  };

  const handleReorderContainer = (containerId: string, delta: -1 | 1) => {
    const nextTree = reorderContainerAmongSiblings(layout.layout_tree, containerId, delta);
    if (nextTree === layout.layout_tree) return;
    triggerHaptic('step', prefs.hapticsEnabled);
    commitLayout(withSyncedTree(layout, nextTree), 'Reordered container.');
    setOpenMenu(null);
  };

  const handleAddZone = (titleInput?: string, explicitParentId?: string | null) => {
    const title = (titleInput ?? newZoneTitle).trim();
    if (!title) return;
    const parentId =
      explicitParentId !== undefined
        ? explicitParentId
        : newZoneParentId === '__root__'
        ? null
        : newZoneParentId;

    const newNode: LayoutTreeContainerNode = {
      type: 'container',
      id: `custom_${Date.now().toString(36)}`,
      title,
      kind: 'custom',
      children: [],
    };
    const nextTree = addContainerToTree(layout.layout_tree, newNode, parentId);
    if (nextTree === layout.layout_tree) {
      pushToast({
        title: 'Max Nesting Depth Reached',
        description: `Containers can be nested up to ${MAX_NESTING_DEPTH} levels deep.`,
        tone: 'warning',
      });
      return;
    }

    if (!titleInput) setNewZoneTitle('');
    triggerHaptic('tap', prefs.hapticsEnabled);
    commitLayout(withSyncedTree(layout, nextTree), `Created zone ${title}`);
  };

  const handleDeleteCustomContainer = (containerId: string) => {
    const target = findContainerById(layout.layout_tree, containerId);
    if (!target || target.kind !== 'custom') return;
    const nextTree = deleteCustomContainerFromTree(layout.layout_tree, containerId);
    const nextHiddenContainers = layout.hiddenContainers.filter((id) => id !== containerId);
    const nextCustomTitles = { ...layout.customTitles };
    delete nextCustomTitles[containerId];

    triggerHaptic('step', prefs.hapticsEnabled);
    commitLayout(
      withSyncedTree(layout, nextTree, {
        hiddenContainers: nextHiddenContainers,
        customTitles: nextCustomTitles,
      }),
      `Deleted custom zone ${getContainerDisplayTitle(target)}`
    );
    setOpenMenu(null);
  };

  const handleSetItemSize = (itemId: string, size: LayoutItemSize) => {
    triggerHaptic('step', prefs.hapticsEnabled);
    commitLayout({
      ...layout,
      itemSizes: { ...layout.itemSizes, [itemId]: size },
    });
  };

  const handleSaveRename = () => {
    if (!renaming) return;
    const trimmed = renameDraft.trim();
    const nextTitles = { ...layout.customTitles };
    if (!trimmed || trimmed === renaming.defaultTitle) {
      delete nextTitles[renaming.id];
    } else {
      nextTitles[renaming.id] = trimmed;
    }
    triggerHaptic('tap', prefs.hapticsEnabled);
    commitLayout(
      { ...layout, customTitles: nextTitles },
      `Renamed ${renaming.defaultTitle} to ${trimmed || renaming.defaultTitle}`
    );
    setRenaming(null);
    setRenameDraft('');
  };

  const handleToggleHideWidget = (widgetId: string) => {
    const isHidden = layout.hiddenItems.includes(widgetId);
    if (isHidden) {
      // Restore widget: ensure it exists inside a visible container
      const nextHiddenItems = layout.hiddenItems.filter((id) => id !== widgetId);
      const placedIds = collectAllWidgetIds(layout.layout_tree);
      let nextTree = layout.layout_tree;
      if (!placedIds.has(widgetId)) {
        const firstVisible =
          flatContainers.find(({ container }) => !layout.hiddenContainers.includes(container.id))
            ?.container ?? layout.layout_tree[0];
        if (firstVisible) {
          nextTree = moveWidgetInTree(layout.layout_tree, widgetId, firstVisible.id);
        }
      }
      triggerHaptic('tap', prefs.hapticsEnabled);
      commitLayout(
        withSyncedTree(layout, nextTree, { hiddenItems: nextHiddenItems }),
        `Restored ${getWidgetDisplayTitle(widgetId)}`
      );
    } else {
      triggerHaptic('step', prefs.hapticsEnabled);
      commitLayout(
        { ...layout, hiddenItems: [...layout.hiddenItems, widgetId] },
        `Hidden ${getWidgetDisplayTitle(widgetId)}`
      );
      pushToast({
        title: `Hidden: ${getWidgetDisplayTitle(widgetId)}`,
        description: 'Restore anytime from Customize -> Hidden & Widgets.',
        tone: 'info',
      });
    }
    setOpenMenu(null);
  };

  const handleToggleHideContainer = (containerId: string) => {
    const target = findContainerById(layout.layout_tree, containerId);
    if (!target) return;
    const isHidden = layout.hiddenContainers.includes(containerId);
    const nextHidden = isHidden
      ? layout.hiddenContainers.filter((id) => id !== containerId)
      : [...layout.hiddenContainers, containerId];

    triggerHaptic('step', prefs.hapticsEnabled);
    commitLayout(
      { ...layout, hiddenContainers: nextHidden },
      `${isHidden ? 'Restored' : 'Hidden'} ${getContainerDisplayTitle(target)}`
    );
    if (!isHidden) {
      pushToast({
        title: `Hidden Container: ${getContainerDisplayTitle(target)}`,
        description: 'Restore anytime from Customize -> Hidden & Widgets.',
        tone: 'info',
      });
    }
    setOpenMenu(null);
  };

  const handleRestoreAllHidden = () => {
    const placedIds = collectAllWidgetIds(layout.layout_tree);
    let nextTree = layout.layout_tree;
    const firstContainer = layout.layout_tree[0];
    if (firstContainer) {
      for (const id of layout.hiddenItems) {
        if (!placedIds.has(id)) {
          nextTree = moveWidgetInTree(nextTree, id, firstContainer.id);
        }
      }
    }
    triggerHaptic('tap', prefs.hapticsEnabled);
    commitLayout(
      withSyncedTree(layout, nextTree, { hiddenItems: [], hiddenContainers: [] }),
      'Restored all hidden containers and widgets.'
    );
  };

  // Hidden counts for the Customize toolbar badge & Hidden drawer
  const hiddenContainerEntries = useMemo(
    () => flatContainers.filter(({ container }) => layout.hiddenContainers.includes(container.id)),
    [flatContainers, layout.hiddenContainers]
  );
  const totalHiddenCount = layout.hiddenItems.length + hiddenContainerEntries.length;

  // Determine root nodes to render based on selectedRoomFilter
  const rootNodesToRender = useMemo<LayoutTreeContainerNode[]>(() => {
    if (selectedRoomFilter === 'all') {
      return layout.layout_tree.filter((c) => !layout.hiddenContainers.includes(c.id));
    }
    const matched = findContainerById(layout.layout_tree, selectedRoomFilter);
    if (!matched || layout.hiddenContainers.includes(matched.id)) return [];
    return [matched];
  }, [layout.layout_tree, layout.hiddenContainers, selectedRoomFilter]);

  // Helper to parse HTML5 drag payload safely
  const readDropPayload = (e: React.DragEvent): DragPayload | null => {
    if (dragPayload) return dragPayload;
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DragPayload;
      if (parsed && (parsed.kind === 'widget' || parsed.kind === 'container') && parsed.id) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  };

  // Recursive Container Renderer (supports depth 0, 1, 2 with slim 10px indent + vertical tree guide)
  const renderContainerNode = (
    container: LayoutTreeContainerNode,
    depth: number,
    parentId: string | null,
    siblingIdx: number,
    siblingCount: number
  ): React.ReactNode => {
    if (layout.hiddenContainers.includes(container.id)) return null;

    const displayTitle = getContainerDisplayTitle(container);
    const directWidgets = container.children.filter(
      (ch): ch is LayoutTreeWidgetNode =>
        ch.type === 'widget' && !layout.hiddenItems.includes(ch.id)
    );
    const childContainers = container.children.filter(
      (ch): ch is LayoutTreeContainerNode =>
        ch.type === 'container' && !layout.hiddenContainers.includes(ch.id)
    );

    const totalVisibleItems = countVisibleWidgetsInSubtree(
      container,
      layout.hiddenItems,
      layout.hiddenContainers
    );
    const isCollapsed = isSectionCollapsed(`layout_container_${container.id}`, false);
    const isContainerMenuOpen = openMenu?.kind === 'container' && openMenu.id === container.id;
    const isRenamingThisContainer = renaming?.kind === 'container' && renaming.id === container.id;

    // Phase 8 ultra-compact KPI & Quick Scenes strip when zone_monitors is in view mode
    // with only monitors and no nested child containers
    const isPureMonitorZone =
      container.id === 'zone_monitors' &&
      !editLayoutMode &&
      childContainers.length === 0 &&
      directWidgets.every((w) => !snapshot.devices[w.id]);

    if (isPureMonitorZone) {
      return (
        <section
          key={container.id}
          className="rounded-2xl border hairline-border bg-surface/65 overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-surface-elevated/40">
            <button
              type="button"
              onClick={() => toggleSectionCollapsed('home_compact_kpi_strip', false)}
              className="flex items-center gap-2 min-w-0 flex-1 text-left text-xs cursor-pointer"
            >
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 shrink-0 text-foreground-muted transition-transform duration-150',
                  kpiCollapsed && '-rotate-90'
                )}
              />
              <span className="font-semibold text-foreground truncate">
                {layout.customTitles[container.id]?.trim() || 'Live Home Pulse & Scenes'}
              </span>
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

          {!kpiCollapsed && (
            <div className="px-2.5 py-2 border-t hairline-border snap-strip gap-2 items-stretch">
              {!layout.hiddenItems.includes('mon_energy') && (
                <div className="snap-start shrink-0 flex items-center gap-2.5 rounded-xl border hairline-border bg-surface px-3 py-1.5 min-w-[162px]">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-foreground-muted truncate">
                      {layout.customTitles['mon_energy']?.trim() || 'POWER · TODAY'}
                    </div>
                    <div className="text-xs font-semibold font-mono text-foreground tabular-nums">
                      {totalWatts.toFixed(0)} W · <span className="text-accent">₹{estTodayInr}</span>
                    </div>
                  </div>
                </div>
              )}

              {!layout.hiddenItems.includes('mon_water') && watDevice && watTel && (
                <Link
                  href={`/devices/${watDevice.device_id}`}
                  className="snap-start shrink-0 flex items-center gap-2.5 rounded-xl border hairline-border bg-surface px-3 py-1.5 min-w-[155px] hover:border-border-strong transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Droplets className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-foreground-muted truncate">
                      {layout.customTitles['mon_water']?.trim() ||
                        `TANK · ${watTel.pump ? 'PUMP ON' : 'IDLE'}`}
                    </div>
                    <div className="text-xs font-semibold font-mono text-foreground tabular-nums">
                      {watTel.level_pct}% ({watTel.level_cm} cm)
                    </div>
                  </div>
                </Link>
              )}

              {!layout.hiddenItems.includes('mon_vehicle') && vehDevice && vehTel && (
                <Link
                  href="/vehicles"
                  className="snap-start shrink-0 flex items-center gap-2.5 rounded-xl border hairline-border bg-surface px-3 py-1.5 min-w-[160px] hover:border-border-strong transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Car className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-foreground-muted truncate">
                      {layout.customTitles['mon_vehicle']?.trim() ||
                        `CRETA · ${vehTel.ignition ? 'MOVING' : 'PARKED'}`}
                    </div>
                    <div className="text-xs font-semibold font-mono text-foreground tabular-nums">
                      {vehTel.speed_kmh.toFixed(0)} km/h · {vehTel.ext_v.toFixed(1)}V
                    </div>
                  </div>
                </Link>
              )}

              {!layout.hiddenItems.includes('mon_hub') && hubDevice && (
                <Link
                  href={`/devices/${hubDevice.device_id}`}
                  className="snap-start shrink-0 flex items-center gap-2.5 rounded-xl border hairline-border bg-surface px-3 py-1.5 min-w-[150px] hover:border-border-strong transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Radio className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-foreground-muted truncate">
                      {layout.customTitles['mon_hub']?.trim() || 'LOCAL HUB-01'}
                    </div>
                    <div className="text-xs font-semibold font-mono text-foreground tabular-nums">
                      {devicesList.length} Nodes · {hubDevice.state.rssi} dBm
                    </div>
                  </div>
                </Link>
              )}

              {!layout.hiddenItems.includes('mon_scenes') && (
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
              )}
            </div>
          )}
        </section>
      );
    }

    // Evaluate drop eligibility for visual feedback
    const isDropTarget = dragOverContainerId === container.id;
    let isDropBlocked = false;
    if (isDropTarget && dragPayload?.kind === 'container') {
      const check = canMoveContainerInto(layout.layout_tree, dragPayload.id, container.id);
      isDropBlocked = !check.allowed;
    }

    const isBeingDragged = dragPayload?.kind === 'container' && dragPayload.id === container.id;

    return (
      <section
        key={container.id}
        draggable={editLayoutMode && !renaming}
        onDragStart={(e) => {
          if (!editLayoutMode) return;
          e.stopPropagation();
          const payload: DragPayload = {
            kind: 'container',
            id: container.id,
            fromParentId: parentId,
          };
          handleDragStartCommon(payload);
          triggerHaptic('drag', prefs.hapticsEnabled);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('application/json', JSON.stringify(payload));
        }}
        onDragOver={(e) => {
          if (!editLayoutMode) return;
          e.preventDefault();
          e.stopPropagation();
          if (dragOverContainerId !== container.id) {
            setDragOverContainerId(container.id);
            setDragOverRoot(false);
          }
          if (dragPayload?.kind === 'container') {
            const check = canMoveContainerInto(layout.layout_tree, dragPayload.id, container.id);
            e.dataTransfer.dropEffect = check.allowed ? 'move' : 'none';
          } else {
            e.dataTransfer.dropEffect = 'move';
          }
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          if (dragOverContainerId === container.id) {
            setDragOverContainerId(null);
          }
        }}
        onDrop={(e) => {
          if (!editLayoutMode) return;
          e.preventDefault();
          e.stopPropagation();
          const payload = readDropPayload(e);
          if (payload) {
            if (payload.kind === 'widget') {
              handleMoveWidget(payload.id, container.id);
            } else if (payload.kind === 'container') {
              handleMoveContainer(payload.id, container.id);
            }
          }
          handleDragEndCommon();
        }}
        onDragEnd={(e) => {
          e.stopPropagation();
          handleDragEndCommon();
        }}
        className={cn(
          'transition-all duration-150',
          depth === 0
            ? 'rounded-2xl border hairline-border bg-surface/65'
            : 'ml-2.5 pl-2.5 border-l border-border/80 pt-1',
          isBeingDragged && 'opacity-45',
          isDropTarget &&
            !isDropBlocked &&
            'ring-2 ring-accent bg-accent-soft/15 rounded-2xl',
          isDropTarget && isDropBlocked && 'ring-2 ring-danger/60 bg-danger/5 rounded-2xl'
        )}
      >
        {/* Slim Container Header — Zero Overflow on 360px even at depth 2 */}
        <div
          className={cn(
            'flex items-center justify-between gap-1.5 min-w-0',
            depth === 0
              ? cn(
                  'px-3 py-2 bg-surface-elevated/40 rounded-t-2xl',
                  isCollapsed ? 'rounded-b-2xl' : 'border-b hairline-border'
                )
              : 'px-2 py-1.5 rounded-xl bg-surface-elevated/45'
          )}
        >
          {isRenamingThisContainer ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveRename();
              }}
              className="flex items-center gap-1.5 flex-1 min-w-0"
            >
              <input
                type="text"
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setRenaming(null);
                }}
                placeholder={container.title}
                className="min-w-0 flex-1 h-7 rounded-lg border border-accent bg-surface px-2 text-xs text-foreground focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Save container name"
                className="inline-flex h-7 px-2 shrink-0 items-center rounded-lg bg-accent text-[11px] font-semibold text-[var(--dd-accent-fg)] cursor-pointer"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setRenaming(null)}
                aria-label="Cancel rename"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-foreground-muted hover:text-foreground cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {editLayoutMode && (
                  <GripVertical
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-accent cursor-grab"
                  />
                )}
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleSectionCollapsed(`layout_container_${container.id}`, false)}
                  className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 text-foreground-muted transition-transform duration-150',
                      isCollapsed && '-rotate-90'
                    )}
                  />
                  <span className="text-xs font-semibold tracking-tight text-foreground truncate">
                    {displayTitle}
                  </span>
                  <span className="text-[10px] font-mono text-foreground-muted tabular-nums shrink-0">
                    · {totalVisibleItems}
                  </span>
                </button>
              </div>

              {/* Single Slim [...] Context Menu Trigger */}
              <div className="relative shrink-0" data-layout-menu="true">
                <button
                  type="button"
                  aria-label={`Options for ${displayTitle}`}
                  aria-expanded={isContainerMenuOpen}
                  onClick={() =>
                    setOpenMenu((cur) =>
                      cur?.kind === 'container' && cur.id === container.id
                        ? null
                        : { kind: 'container', id: container.id, showMovePicker: false }
                    )
                  }
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer',
                    isContainerMenuOpen
                      ? 'bg-accent-soft text-accent border border-accent-border'
                      : 'text-foreground-muted hover:text-foreground hover:bg-surface-elevated'
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>

                {isContainerMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-56 max-w-[calc(100vw-24px)] rounded-xl border border-border-strong bg-[var(--dd-surface-0)] shadow-2xl p-1.5 z-40 text-xs space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setRenaming({
                          kind: 'container',
                          id: container.id,
                          defaultTitle: container.title,
                        });
                        setRenameDraft(displayTitle);
                        setOpenMenu(null);
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5 text-foreground-muted shrink-0" />
                      <span>Rename</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenu((cur) =>
                          cur ? { ...cur, showMovePicker: !cur.showMovePicker } : null
                        )
                      }
                      className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-2">
                        <ArrowRightLeft className="h-3.5 w-3.5 text-foreground-muted shrink-0" />
                        <span>Move to...</span>
                      </span>
                      <ChevronRight
                        className={cn(
                          'h-3.5 w-3.5 text-foreground-muted transition-transform',
                          openMenu.showMovePicker && 'rotate-90'
                        )}
                      />
                    </button>

                    {openMenu.showMovePicker && (
                      <div className="my-1 ml-1 pl-1.5 border-l border-border/80 space-y-0.5 max-h-44 overflow-y-auto dd-scroll">
                        <button
                          type="button"
                          disabled={parentId === null}
                          onClick={() => handleMoveContainer(container.id, null, 0)}
                          className="w-full flex items-center justify-between rounded-md px-2 py-1 text-left text-[11px] text-foreground hover:bg-surface-elevated disabled:opacity-40 cursor-pointer"
                        >
                          <span className="truncate font-medium">Root Level (Top)</span>
                          {parentId === null && (
                            <span className="text-[9px] font-mono text-accent">Here</span>
                          )}
                        </button>
                        {flatContainers.map((dest) => {
                          const eligibility = canMoveContainerInto(
                            layout.layout_tree,
                            container.id,
                            dest.container.id
                          );
                          const isCurrentParent = parentId === dest.container.id;
                          return (
                            <button
                              key={dest.container.id}
                              type="button"
                              disabled={!eligibility.allowed || isCurrentParent}
                              title={eligibility.reason}
                              onClick={() => handleMoveContainer(container.id, dest.container.id)}
                              className="w-full flex items-center justify-between gap-1 rounded-md px-2 py-1 text-left text-[11px] text-foreground hover:bg-surface-elevated disabled:opacity-35 cursor-pointer"
                            >
                              <span
                                className="inline-flex items-center gap-1 min-w-0 truncate"
                                style={{ paddingLeft: `${dest.depth * 10}px` }}
                              >
                                {dest.depth > 0 && (
                                  <CornerDownRight className="h-2.5 w-2.5 shrink-0 text-foreground-muted" />
                                )}
                                <span className="truncate">
                                  {getContainerDisplayTitle(dest.container)}
                                </span>
                              </span>
                              {isCurrentParent && (
                                <span className="text-[9px] font-mono text-accent shrink-0">
                                  Parent
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-1 pt-0.5">
                      <button
                        type="button"
                        disabled={siblingIdx === 0}
                        onClick={() => handleReorderContainer(container.id, -1)}
                        className="flex items-center justify-center gap-1 rounded-lg border border-border/70 bg-surface-elevated/60 px-2 py-1 text-[11px] text-foreground hover:bg-surface-elevated disabled:opacity-35 cursor-pointer"
                      >
                        <ArrowUp className="h-3 w-3" />
                        <span>Up</span>
                      </button>
                      <button
                        type="button"
                        disabled={siblingIdx >= siblingCount - 1}
                        onClick={() => handleReorderContainer(container.id, 1)}
                        className="flex items-center justify-center gap-1 rounded-lg border border-border/70 bg-surface-elevated/60 px-2 py-1 text-[11px] text-foreground hover:bg-surface-elevated disabled:opacity-35 cursor-pointer"
                      >
                        <ArrowDown className="h-3 w-3" />
                        <span>Down</span>
                      </button>
                    </div>

                    {depth < MAX_NESTING_DEPTH - 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          handleAddZone(`${displayTitle} Sub-Zone`, container.id);
                          setOpenMenu(null);
                        }}
                        className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
                      >
                        <FolderPlus className="h-3.5 w-3.5 text-accent shrink-0" />
                        <span>+ Add Sub-Zone</span>
                      </button>
                    )}

                    {!editLayoutMode && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditLayoutMode(true);
                          setOpenMenu(null);
                        }}
                        className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-accent hover:bg-surface-elevated cursor-pointer"
                      >
                        <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                        <span>Customize Layout</span>
                      </button>
                    )}

                    <div className="pt-1 mt-0.5 border-t hairline-border space-y-0.5">
                      <button
                        type="button"
                        onClick={() => handleToggleHideContainer(container.id)}
                        className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground-secondary hover:text-foreground hover:bg-surface-elevated cursor-pointer"
                      >
                        <EyeOff className="h-3.5 w-3.5 shrink-0" />
                        <span>Hide Container</span>
                      </button>

                      {container.kind === 'custom' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomContainer(container.id)}
                          className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-danger hover:bg-danger/10 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" />
                          <span>Delete Zone</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Container Body: Direct Widgets Grid + Nested Child Containers */}
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="overflow-visible"
            >
              <div className={cn(depth === 0 ? 'p-2.5 sm:p-3 space-y-2.5' : 'pt-2 pb-1 space-y-2')}>
                {/* Empty Container State */}
                {directWidgets.length === 0 && childContainers.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Plus className="h-4 w-4" />}
                    title="Empty Container"
                    description={
                      editLayoutMode
                        ? 'Drag any widget or sub-container here, or use "Move to..." in a card menu.'
                        : 'Open Customize Layout to drag devices or sub-zones into this container.'
                    }
                  />
                ) : (
                  <>
                    {/* Direct Widgets Grid */}
                    {directWidgets.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                        {directWidgets.map((widgetNode) => {
                          const itemId = widgetNode.id;
                          const device = snapshot.devices[itemId];
                          const widgetTitle = getWidgetDisplayTitle(itemId);
                          const widgetDefaultTitle = getWidgetDefaultTitle(itemId);
                          const size: LayoutItemSize =
                            layout.itemSizes[itemId] ?? (itemId === 'mon_scenes' ? 'Full' : 'M');
                          const isWidgetMenuOpen =
                            openMenu?.kind === 'widget' && openMenu.id === itemId;
                          const isRenamingThisWidget =
                            renaming?.kind === 'widget' && renaming.id === itemId;
                          const isWidgetDragged =
                            dragPayload?.kind === 'widget' && dragPayload.id === itemId;

                          return (
                            <motion.div
                              key={itemId}
                              layout={prefs.motionMode !== 'eco'}
                              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                              draggable={editLayoutMode && !renaming}
                              onDragStart={(e) => {
                                if (!editLayoutMode) return;
                                e.stopPropagation();
                                const dragEv = e as unknown as React.DragEvent<HTMLDivElement>;
                                const payload: DragPayload = {
                                  kind: 'widget',
                                  id: itemId,
                                  fromContainerId: container.id,
                                };
                                handleDragStartCommon(payload);
                                triggerHaptic('drag', prefs.hapticsEnabled);
                                if (dragEv.dataTransfer) {
                                  dragEv.dataTransfer.effectAllowed = 'move';
                                  dragEv.dataTransfer.setData(
                                    'application/json',
                                    JSON.stringify(payload)
                                  );
                                }
                              }}
                              onDragOver={(e) => {
                                if (!editLayoutMode) return;
                                if (dragPayload?.kind === 'widget') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }
                              }}
                              onDrop={(e) => {
                                if (!editLayoutMode) return;
                                const payload = readDropPayload(e);
                                if (payload?.kind === 'widget' && payload.id !== itemId) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleMoveWidget(payload.id, container.id, itemId);
                                  handleDragEndCommon();
                                }
                              }}
                              onDragEnd={(e) => {
                                e.stopPropagation();
                                handleDragEndCommon();
                              }}
                              className={cn(
                                'relative rounded-2xl min-w-0',
                                SIZE_COL_CLASSES[size],
                                editLayoutMode &&
                                  'ring-1 ring-border-strong/70 p-1.5 bg-surface-elevated/35',
                                isWidgetDragged && 'opacity-45'
                              )}
                            >
                              {/* PHASE 9C #3: Slim Zero-Overflow Widget Edit Header: [Drag Grip] [Title (truncate)] [···] */}
                              {editLayoutMode && (
                                <div className="flex items-center gap-1.5 min-w-0 px-1 pb-1.5 h-8">
                                  {isRenamingThisWidget ? (
                                    <form
                                      onSubmit={(e) => {
                                        e.preventDefault();
                                        handleSaveRename();
                                      }}
                                      className="flex items-center gap-1 flex-1 min-w-0"
                                    >
                                      <input
                                        type="text"
                                        autoFocus
                                        value={renameDraft}
                                        onChange={(e) => setRenameDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Escape') setRenaming(null);
                                        }}
                                        placeholder={widgetDefaultTitle}
                                        className="min-w-0 flex-1 h-6 rounded-md border border-accent bg-surface px-2 text-[11px] text-foreground focus:outline-none"
                                      />
                                      <button
                                        type="submit"
                                        className="inline-flex h-6 px-2 shrink-0 items-center rounded-md bg-accent text-[10px] font-semibold text-[var(--dd-accent-fg)] cursor-pointer"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setRenaming(null)}
                                        aria-label="Cancel rename"
                                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-foreground-muted cursor-pointer"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </form>
                                  ) : (
                                    <>
                                      <GripVertical className="h-3.5 w-3.5 shrink-0 text-accent cursor-grab" />
                                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                                        {widgetTitle}
                                      </span>
                                      <div className="relative shrink-0" data-layout-menu="true">
                                        <button
                                          type="button"
                                          aria-label={`Widget actions for ${widgetTitle}`}
                                          aria-expanded={isWidgetMenuOpen}
                                          onClick={() =>
                                            setOpenMenu((cur) =>
                                              cur?.kind === 'widget' && cur.id === itemId
                                                ? null
                                                : {
                                                    kind: 'widget',
                                                    id: itemId,
                                                    showMovePicker: false,
                                                  }
                                            )
                                          }
                                          className={cn(
                                            'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors cursor-pointer',
                                            isWidgetMenuOpen
                                              ? 'border-accent-border bg-accent-soft text-accent'
                                              : 'border-border/70 bg-surface text-foreground-secondary hover:text-foreground'
                                          )}
                                        >
                                          <MoreHorizontal className="h-3.5 w-3.5" />
                                        </button>

                                        {isWidgetMenuOpen && (
                                          <div className="absolute right-0 top-full mt-1 w-56 max-w-[calc(100vw-28px)] rounded-xl border border-border-strong bg-[var(--dd-surface-0)] shadow-2xl p-1.5 z-40 text-xs space-y-1">
                                            {/* Rename */}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setRenaming({
                                                  kind: 'widget',
                                                  id: itemId,
                                                  defaultTitle: widgetDefaultTitle,
                                                });
                                                setRenameDraft(widgetTitle);
                                                setOpenMenu(null);
                                              }}
                                              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
                                            >
                                              <Pencil className="h-3.5 w-3.5 text-foreground-muted shrink-0" />
                                              <span>Rename</span>
                                            </button>

                                            {/* Size (S / M / L / Full) */}
                                            <div className="px-2 py-1 space-y-1">
                                              <div className="text-[10px] font-mono text-foreground-muted uppercase tracking-wider">
                                                Card Size
                                              </div>
                                              <div className="grid grid-cols-4 gap-1 rounded-lg border border-border/70 bg-surface-elevated/60 p-0.5">
                                                {SIZE_ORDER.map((sz) => (
                                                  <button
                                                    key={sz}
                                                    type="button"
                                                    onClick={() => handleSetItemSize(itemId, sz)}
                                                    className={cn(
                                                      'h-6 rounded-md text-[10px] font-mono transition-colors cursor-pointer',
                                                      size === sz
                                                        ? 'bg-accent text-[var(--dd-accent-fg)] font-bold'
                                                        : 'text-foreground-muted hover:text-foreground'
                                                    )}
                                                  >
                                                    {sz}
                                                  </button>
                                                ))}
                                              </div>
                                            </div>

                                            {/* Move to... Tree Destination Picker */}
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setOpenMenu((cur) =>
                                                  cur
                                                    ? {
                                                        ...cur,
                                                        showMovePicker: !cur.showMovePicker,
                                                      }
                                                    : null
                                                )
                                              }
                                              className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-surface-elevated cursor-pointer"
                                            >
                                              <span className="inline-flex items-center gap-2">
                                                <ArrowRightLeft className="h-3.5 w-3.5 text-foreground-muted shrink-0" />
                                                <span>Move to...</span>
                                              </span>
                                              <ChevronRight
                                                className={cn(
                                                  'h-3.5 w-3.5 text-foreground-muted transition-transform',
                                                  openMenu.showMovePicker && 'rotate-90'
                                                )}
                                              />
                                            </button>

                                            {openMenu.showMovePicker && (
                                              <div className="ml-1 pl-1.5 border-l border-border/80 space-y-0.5 max-h-40 overflow-y-auto dd-scroll">
                                                {flatContainers.map((dest) => {
                                                  const isHere = dest.container.id === container.id;
                                                  return (
                                                    <button
                                                      key={dest.container.id}
                                                      type="button"
                                                      disabled={isHere}
                                                      onClick={() =>
                                                        handleMoveWidget(itemId, dest.container.id)
                                                      }
                                                      className="w-full flex items-center justify-between gap-1 rounded-md px-2 py-1 text-left text-[11px] text-foreground hover:bg-surface-elevated disabled:opacity-40 cursor-pointer"
                                                    >
                                                      <span
                                                        className="inline-flex items-center gap-1 min-w-0 truncate"
                                                        style={{
                                                          paddingLeft: `${dest.depth * 10}px`,
                                                        }}
                                                      >
                                                        {dest.depth > 0 && (
                                                          <CornerDownRight className="h-2.5 w-2.5 shrink-0 text-foreground-muted" />
                                                        )}
                                                        <span className="truncate">
                                                          {getContainerDisplayTitle(dest.container)}
                                                        </span>
                                                      </span>
                                                      {isHere && (
                                                        <span className="text-[9px] font-mono text-accent shrink-0">
                                                          Here
                                                        </span>
                                                      )}
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            )}

                                            {/* Hide (Works for BOTH Monitors AND Hardware Devices) */}
                                            <div className="pt-1 border-t hairline-border">
                                              <button
                                                type="button"
                                                onClick={() => handleToggleHideWidget(itemId)}
                                                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-danger hover:bg-danger/10 cursor-pointer"
                                              >
                                                <EyeOff className="h-3.5 w-3.5 shrink-0" />
                                                <span>Hide Widget</span>
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}

                              {/* Card Body */}
                              {device ? (
                                <DynamicCapabilityCard
                                  device={device}
                                  displayName={layout.customTitles[device.device_id]}
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
                                <StandaloneMonitorWidget
                                  monitorId={itemId}
                                  customTitle={layout.customTitles[itemId]}
                                />
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    )}

                    {/* Nested Child Containers (Recursive up to depth 2) */}
                    {childContainers.length > 0 && (
                      <div className="space-y-2 pt-0.5">
                        {childContainers.map((child, idx) =>
                          renderContainerNode(
                            child,
                            depth + 1,
                            container.id,
                            idx,
                            childContainers.length
                          )
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    );
  };

  return (
    <div className="space-y-3">
      {/* Screen reader live announcement for layout moves */}
      <div className="sr-only" aria-live="polite">
        {liveAnnouncement}
      </div>

      {/* PHASE 9C #4: Compact & Auto-Minimizing Customize Toolbar */}
      <AnimatePresence mode="wait">
        {editLayoutMode && !toolbarExpanded && (
          <motion.div
            key="minimized-edit-pill"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="sticky top-[62px] z-30 flex justify-end pointer-events-none"
          >
            <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-accent-border bg-[var(--dd-surface-0)]/96 backdrop-blur-md px-2.5 py-1 shadow-xl text-xs">
              <button
                type="button"
                onClick={() => setToolbarExpanded(true)}
                className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-accent transition-colors cursor-pointer"
              >
                <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                <span>Editing</span>
                <ChevronDown className="h-3.5 w-3.5 text-foreground-muted" />
              </button>
              <span className="h-3.5 w-px bg-border mx-0.5" aria-hidden="true" />
              <button
                type="button"
                onClick={() => {
                  setEditLayoutMode(false);
                  setOpenMenu(null);
                  setRenaming(null);
                }}
                className="inline-flex items-center gap-1 font-semibold text-accent hover:opacity-85 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Done</span>
              </button>
            </div>
          </motion.div>
        )}

        {editLayoutMode && toolbarExpanded && (
          <motion.div
            key="expanded-edit-toolbar"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
            className="sticky top-[62px] z-30 rounded-2xl border border-accent-border bg-[var(--dd-surface-0)]/96 backdrop-blur-md p-2.5 shadow-xl space-y-2"
          >
            {/* Row 1: Collapse + Actions (Compact & zero-overflow on 360px) */}
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setToolbarExpanded(false)}
                  title="Minimize toolbar to pill"
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-accent-border bg-accent-soft px-2 text-[11px] font-semibold text-accent cursor-pointer shrink-0"
                >
                  <span>Editing</span>
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <span className="hidden sm:inline text-[11px] text-foreground-secondary truncate">
                  {isOwner
                    ? 'Owner: room moves sync device room_id'
                    : 'Member: personal layout only'}
                </span>
              </div>

              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  disabled={historyPast.length === 0}
                  onClick={handleUndo}
                  title="Undo layout change"
                  aria-label="Undo layout change"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground-secondary hover:text-foreground disabled:opacity-35 cursor-pointer"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={historyFuture.length === 0}
                  onClick={handleRedo}
                  title="Redo layout change"
                  aria-label="Redo layout change"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground-secondary hover:text-foreground disabled:opacity-35 cursor-pointer"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen((o) => !o)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors cursor-pointer',
                    drawerOpen
                      ? 'border-accent-border bg-accent-soft text-accent'
                      : 'border-border bg-surface-elevated text-foreground hover:border-border-strong'
                  )}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Hidden &amp; Widgets</span>
                  {totalHiddenCount > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent text-[var(--dd-accent-fg)] px-1 text-[9px] font-mono font-bold">
                      {totalHiddenCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetLayout2D();
                    setHistoryPast([]);
                    setHistoryFuture([]);
                    pushToast({ title: 'Dashboard Layout Reset to Default', tone: 'info' });
                  }}
                  title="Reset layout to default"
                  aria-label="Reset layout to default"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground-secondary hover:text-foreground cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditLayoutMode(false);
                    setOpenMenu(null);
                    setRenaming(null);
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Done</span>
                </Button>
              </div>
            </div>

            {/* Row 2: Compact + Add Zone / Sub-Zone Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddZone();
              }}
              className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t hairline-border"
            >
              <input
                type="text"
                value={newZoneTitle}
                onChange={(e) => setNewZoneTitle(e.target.value)}
                placeholder="New container or sub-zone name..."
                className="flex-1 min-w-[140px] h-7 rounded-lg border border-border bg-surface-elevated px-2.5 text-xs text-foreground focus:outline-none focus:border-accent"
              />
              <div className="min-w-[140px] max-w-[180px]">
                <ThemedSelect
                  size="xs"
                  ariaLabel="Parent container for new zone"
                  value={newZoneParentId}
                  onChange={setNewZoneParentId}
                  options={[
                    { value: '__root__', label: 'In: Root Level' },
                    ...flatContainers
                      .filter((entry) => entry.depth < MAX_NESTING_DEPTH - 1)
                      .map((entry) => ({
                        value: entry.container.id,
                        label: `In: ${'— '.repeat(entry.depth)}${getContainerDisplayTitle(entry.container)}`,
                      })),
                  ]}
                />
              </div>
              <button
                type="submit"
                disabled={!newZoneTitle.trim()}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-surface-elevated px-2.5 text-[11px] font-medium text-foreground hover:border-accent-border hover:text-accent disabled:opacity-40 cursor-pointer shrink-0"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </form>

            {/* PHASE 9C #2: Clean "Hidden & Widgets" Drawer inside Customize Toolbar */}
            {drawerOpen && (
              <div className="pt-2 border-t hairline-border space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex rounded-lg border border-border/70 bg-surface-elevated p-0.5 text-[11px]">
                    {(
                      [
                        { id: 'hidden', label: `Hidden (${totalHiddenCount})` },
                        { id: 'monitors', label: `Monitors (${MONITOR_CATALOG.length})` },
                        { id: 'devices', label: `Devices (${devicesList.length})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setDrawerTab(tab.id)}
                        className={cn(
                          'px-2 py-1 rounded-md font-medium transition-colors cursor-pointer',
                          drawerTab === tab.id
                            ? 'bg-accent text-[var(--dd-accent-fg)]'
                            : 'text-foreground-secondary hover:text-foreground'
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {drawerTab === 'hidden' && totalHiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={handleRestoreAllHidden}
                      className="text-[11px] font-medium text-accent hover:underline cursor-pointer shrink-0"
                    >
                      Restore All
                    </button>
                  )}
                </div>

                <div className="max-h-52 overflow-y-auto dd-scroll space-y-1.5 pr-0.5">
                  {drawerTab === 'hidden' && (
                    <>
                      {totalHiddenCount === 0 ? (
                        <div className="rounded-xl border hairline-border bg-surface-elevated/40 px-3 py-2.5 text-[11px] text-foreground-muted">
                          No hidden containers or widgets. Use any card or container menu (&middot;&middot;&middot;) to hide items.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {hiddenContainerEntries.map(({ container, pathLabel }) => (
                            <div
                              key={container.id}
                              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-foreground truncate">
                                  {pathLabel}
                                </div>
                                <div className="text-[10px] font-mono text-foreground-muted">
                                  Hidden Container · {container.kind}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleToggleHideContainer(container.id)}
                                className="inline-flex h-6 items-center gap-1 rounded-md border border-accent-border bg-accent-soft px-2 text-[10px] font-semibold text-accent shrink-0 cursor-pointer"
                              >
                                <Eye className="h-3 w-3" />
                                <span>Restore</span>
                              </button>
                            </div>
                          ))}

                          {layout.hiddenItems.map((widgetId) => {
                            const dev = snapshot.devices[widgetId];
                            return (
                              <div
                                key={widgetId}
                                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="font-medium text-foreground truncate">
                                    {getWidgetDisplayTitle(widgetId)}
                                  </div>
                                  <div className="text-[10px] font-mono text-foreground-muted truncate">
                                    {dev ? `Device · ${dev.module_code}` : 'Monitor Widget'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleToggleHideWidget(widgetId)}
                                  className="inline-flex h-6 items-center gap-1 rounded-md border border-accent-border bg-accent-soft px-2 text-[10px] font-semibold text-accent shrink-0 cursor-pointer"
                                >
                                  <Eye className="h-3 w-3" />
                                  <span>Restore</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {drawerTab === 'monitors' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                      {MONITOR_CATALOG.map((mon) => {
                        const visible = !layout.hiddenItems.includes(mon.id);
                        return (
                          <button
                            key={mon.id}
                            type="button"
                            onClick={() => handleToggleHideWidget(mon.id)}
                            className={cn(
                              'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer',
                              visible
                                ? 'border-accent-border bg-accent-soft text-foreground'
                                : 'border-border bg-surface-elevated text-foreground-secondary'
                            )}
                          >
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {getWidgetDisplayTitle(mon.id)}
                              </div>
                              <div className="text-[10px] text-foreground-muted truncate">
                                {mon.category}
                              </div>
                            </div>
                            <Badge variant={visible ? 'accent' : 'neutral'}>
                              {visible ? 'Shown' : 'Add'}
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {drawerTab === 'devices' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                      {devicesList.map((dev) => {
                        const visible = !layout.hiddenItems.includes(dev.device_id);
                        return (
                          <button
                            key={dev.device_id}
                            type="button"
                            onClick={() => handleToggleHideWidget(dev.device_id)}
                            className={cn(
                              'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer',
                              visible
                                ? 'border-accent-border bg-accent-soft text-foreground'
                                : 'border-border bg-surface-elevated text-foreground-secondary'
                            )}
                          >
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {getWidgetDisplayTitle(dev.device_id)}
                              </div>
                              <div className="text-[10px] font-mono text-foreground-muted truncate">
                                {dev.module_code}
                              </div>
                            </div>
                            <Badge variant={visible ? 'accent' : 'neutral'}>
                              {visible ? 'Shown' : 'Hidden'}
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Root-Level Drop Strip (appears while dragging a nested container so it can be pulled back to root) */}
      {editLayoutMode && dragPayload?.kind === 'container' && dragPayload.fromParentId !== null && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverRoot(true);
            setDragOverContainerId(null);
          }}
          onDragLeave={() => setDragOverRoot(false)}
          onDrop={(e) => {
            e.preventDefault();
            const payload = readDropPayload(e);
            if (payload?.kind === 'container') {
              handleMoveContainer(payload.id, null, 0);
            }
            handleDragEndCommon();
          }}
          className={cn(
            'rounded-xl border-2 border-dashed px-3 py-2.5 text-center text-xs font-medium transition-colors',
            dragOverRoot
              ? 'border-accent bg-accent-soft/30 text-accent'
              : 'border-border-strong bg-surface-elevated/50 text-foreground-secondary'
          )}
        >
          Drop here to move container back to Root Level
        </div>
      )}

      {/* Recursive Nested Container Tree */}
      <div className="space-y-3">
        {rootNodesToRender.length === 0 ? (
          <EmptyState
            icon={<LayoutGrid className="h-5 w-5" />}
            title="No Visible Containers"
            description="All containers in this view are hidden. Open Customize Layout -> Hidden & Widgets to restore them."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditLayoutMode(true);
                  setToolbarExpanded(true);
                  setDrawerOpen(true);
                  setDrawerTab('hidden');
                }}
              >
                Open Hidden &amp; Widgets
              </Button>
            }
          />
        ) : (
          rootNodesToRender.map((container, idx) =>
            renderContainerNode(container, 0, null, idx, rootNodesToRender.length)
          )
        )}
      </div>
    </div>
  );
};
